import { FastifyPluginAsync } from 'fastify'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import { unauthorized, badRequest, conflict, tooManyRequests, internalError, extractRootCause } from '../lib/errors.js'
import { authGuard, getSessionUser, SessionUser } from '../lib/auth-guard.js'
import { validatePassword } from '../lib/password-validator.js'
import { sendVerificationEmail } from '../lib/email.js'
import { z } from 'zod'

const TTL_HOURS = parseInt(process.env.VERIFICATION_TOKEN_TTL_HOURS ?? '24', 10)

// Simple in-memory rate limit for resend-verification (max 3 per email per hour)
const resendCounts = new Map<string, { count: number; resetAt: number }>()

function checkResendRateLimit(email: string): boolean {
  const now = Date.now()
  const entry = resendCounts.get(email)
  if (!entry || now > entry.resetAt) {
    resendCounts.set(email, { count: 1, resetAt: now + 60 * 60 * 1000 })
    return true
  }
  if (entry.count >= 3) return false
  entry.count++
  return true
}

const authRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/v1/auth/register
  fastify.post('/auth/register', async (request, reply) => {
    try {
      const { email, password, agreedToTerms } = request.body as { email?: string; password?: string; agreedToTerms?: boolean }

      // Validate terms agreement
      if (!agreedToTerms) {
        throw badRequest('Terms of service must be agreed to', [{ field: 'agreedToTerms', message: 'You must agree to the terms of service to register' }])
      }

      // Validate email format
      const emailParsed = z.string().email().safeParse(email)
      if (!emailParsed.success) {
        throw badRequest('Invalid email address', [{ field: 'email', message: 'Must be a valid email address' }])
      }

      // Validate password strength
      const pwResult = validatePassword(password ?? '')
      if (!pwResult.valid) {
        throw badRequest('Password does not meet requirements', pwResult.issues.map((m) => ({ field: 'password', message: m })))
      }

      // Check duplicate email
      const existing = await fastify.db.user.findUnique({ where: { email: email! } })
      if (existing) {
        throw conflict('Email already registered')
      }

      const passwordHash = await bcrypt.hash(password!, 12)
      const verificationToken = randomUUID()
      const verificationTokenExpiry = new Date(Date.now() + TTL_HOURS * 60 * 60 * 1000)

      await fastify.db.user.create({
        data: {
          email: email!,
          passwordHash,
          emailVerified: false,
          verificationToken,
          verificationTokenExpiry,
          role: 'REGULAR',
          agreedToTerms: true,
          termsAgreedAt: new Date(),
        },
      })

      let emailSent = true
      let emailError: string | undefined
      try {
        await sendVerificationEmail(email!, verificationToken)
      } catch (err: unknown) {
        emailSent = false
        emailError = extractRootCause(err)
        fastify.log.error({ err }, `[register] Failed to send verification email to ${email}`)
      }

      reply.status(201).send({
        message: emailSent
          ? `验证邮件已发送至 ${email}`
          : `账号已创建，但验证邮件发送失败（${emailError}）。请联系管理员手动开启邮箱验证。`,
        emailSent,
      })
    } catch (error) {
      throw error
    }
  })

  // GET /api/v1/auth/verify-email?token=...
  fastify.get('/auth/verify-email', async (request, reply) => {
    try {
      const { token } = request.query as { token?: string }
      if (!token) throw badRequest('Verification token is required')

      const user = await fastify.db.user.findFirst({ where: { verificationToken: token } })
      if (!user) throw badRequest('Invalid or already-used verification token')
      if (user.verificationTokenExpiry && user.verificationTokenExpiry < new Date()) {
        throw badRequest('Verification link has expired. Please request a new one.')
      }

      await fastify.db.user.update({
        where: { id: user.id },
        data: { emailVerified: true, verificationToken: null, verificationTokenExpiry: null },
      })

      reply.send({ message: 'Email verified. You can now log in.' })
    } catch (error) {
      throw error
    }
  })

  // POST /api/v1/auth/resend-verification
  fastify.post('/auth/resend-verification', async (request, reply) => {
    try {
      const { email } = request.body as { email?: string }

      if (!email) {
        return reply.send({ message: 'If that email is registered and unverified, a new link has been sent.' })
      }

      if (!checkResendRateLimit(email)) {
        throw tooManyRequests('Too many resend requests. Please wait before trying again.', 3600)
      }

      const user = await fastify.db.user.findUnique({ where: { email } })
      if (user && !user.emailVerified) {
        const verificationToken = randomUUID()
        const verificationTokenExpiry = new Date(Date.now() + TTL_HOURS * 60 * 60 * 1000)
        await fastify.db.user.update({
          where: { id: user.id },
          data: { verificationToken, verificationTokenExpiry },
        })
        try {
          await sendVerificationEmail(email, verificationToken)
        } catch (err: unknown) {
          const msg = extractRootCause(err)
          throw internalError(`验证邮件发送失败：${msg}`, msg)
        }
      }

      reply.send({ message: '如该邮箱已注册且未验证，验证邮件已重新发送。' })
    } catch (error) {
      throw error
    }
  })

  // POST /api/v1/auth/login
  fastify.post('/auth/login', async (request, reply) => {
    try {
      const { email, password } = request.body as { email?: string; password?: string }
      if (!email || !password) throw unauthorized('Invalid credentials')

      const user = await fastify.db.user.findUnique({ where: { email } })
      if (!user || !user.emailVerified) throw unauthorized('Invalid credentials')
      if (user.disabled) throw unauthorized('Account has been disabled')

      const valid = await bcrypt.compare(password, user.passwordHash)
      if (!valid) throw unauthorized('Invalid credentials')

      const sessionUser: SessionUser = {
        id: user.id,
        email: user.email,
        role: user.role,
        exportEnabled: user.exportEnabled,
        maxVersions: user.maxVersions,
        maxBooks: user.maxBooks,
        canEditBuiltinConfigs: user.canEditBuiltinConfigs,
        watermarkEnabled: user.watermarkEnabled,
      }
      const token = fastify.jwt.sign(sessionUser)  // sync — returns string directly
      reply.setCookie('auth_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 7 * 24 * 60 * 60,
      })

      // Update last login time
      await fastify.db.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      })

      // Attach subscription reminder info for the frontend
      const sub = await fastify.db.userSubscription.findUnique({ where: { userId: user.id } })
      let showRenewalReminder = false
      let subscriptionStatus = 'NONE'
      if (sub) {
        const now = new Date()
        if (sub.status === 'ACTIVE' && sub.expiresAt > now) {
          subscriptionStatus = 'ACTIVE'
          const daysLeft = Math.ceil((sub.expiresAt.getTime() - now.getTime()) / 86400000)
          showRenewalReminder = daysLeft <= 6
        } else if (sub.status === 'GRACE') {
          subscriptionStatus = 'GRACE'
        } else {
          subscriptionStatus = 'EXPIRED'
        }
      }

      return { ...sessionUser, token, subscriptionStatus, showRenewalReminder }
    } catch (error) {
      throw error
    }
  })

  // POST /api/v1/auth/change-password
  fastify.post('/auth/change-password', { preHandler: authGuard() }, async (request, reply) => {
    try {
      const sessionUser = getSessionUser(request)
      if (!sessionUser) throw unauthorized()

      const { currentPassword, newPassword } = request.body as { currentPassword?: string; newPassword?: string }
      if (!currentPassword || !newPassword) throw badRequest('currentPassword and newPassword are required')

      const user = await fastify.db.user.findUnique({ where: { id: sessionUser.id } })
      if (!user) throw unauthorized()

      const valid = await bcrypt.compare(currentPassword, user.passwordHash)
      if (!valid) throw badRequest('当前密码不正确')

      const pwResult = validatePassword(newPassword)
      if (!pwResult.valid) {
        throw badRequest('新密码不符合要求', pwResult.issues.map((m) => ({ field: 'newPassword', message: m })))
      }

      const newHash = await bcrypt.hash(newPassword, 12)
      await fastify.db.user.update({ where: { id: sessionUser.id }, data: { passwordHash: newHash } })

      reply.status(204).send()
    } catch (error) {
      throw error
    }
  })

  // POST /api/v1/auth/logout
  fastify.post('/auth/logout', async (request, reply) => {
    reply.clearCookie('auth_token', { path: '/' })
    reply.status(204).send()
  })

  // GET /api/v1/auth/me
  fastify.get('/auth/me', { preHandler: authGuard() }, async (request) => {
    try {
      const sessionUser = getSessionUser(request)
      if (!sessionUser) throw unauthorized()

      // Re-fetch fresh permissions from DB in case admin changed them
      const user = await fastify.db.user.findUnique({ where: { id: sessionUser.id } })
      if (!user) throw unauthorized()

      const fresh: SessionUser = {
        id: user.id,
        email: user.email,
        role: user.role,
        exportEnabled: user.exportEnabled,
        maxVersions: user.maxVersions,
        maxBooks: user.maxBooks,
        canEditBuiltinConfigs: user.canEditBuiltinConfigs,
        watermarkEnabled: user.watermarkEnabled,
      }
      return fresh
    } catch (error) {
      throw error
    }
  })

  // GET /api/v1/user/stats
  fastify.get('/user/stats', { preHandler: authGuard() }, async (request) => {
    try {
      const sessionUser = getSessionUser(request)
      if (!sessionUser) throw unauthorized()

      const userId = sessionUser.id

      const [bookCount, versionCount, wordUnlockCount, entryCount, alignmentCount, energyBalance] =
        await Promise.all([
          fastify.db.dictionary.count({ where: { userId, deletedAt: null } }),
          fastify.db.dictionaryVersion.count({ where: { dictionary: { userId } } }),
          fastify.db.wordUnlock.count({ where: { userId } }),
          fastify.db.entry.count({ where: { version: { dictionary: { userId } } } }),
          fastify.db.entryAlignment.count({
            where: { comparison: { versionA: { dictionary: { userId } } } },
          }),
          fastify.db.energyBalance.findUnique({ where: { userId } }),
        ])

      return {
        bookCount,
        maxBooks: sessionUser.maxBooks,
        versionCount,
        maxVersions: sessionUser.maxVersions,
        wordUnlockCount,
        entryCount,
        alignmentCount,
        lifetimeEnergyUsed: energyBalance?.lifetimeUsed ?? 0,
        currentEnergyBalance:
          (energyBalance?.monthlyRemaining ?? 0) + (energyBalance?.purchasedRemaining ?? 0),
      }
    } catch (error) {
      throw error
    }
  })
}

export default authRoutes
