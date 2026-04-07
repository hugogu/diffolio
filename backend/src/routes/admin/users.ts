import { FastifyPluginAsync } from 'fastify'
import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { authGuard } from '../../lib/auth-guard.js'
import { notFound, badRequest, internalError, extractRootCause } from '../../lib/errors.js'
import { sendVerificationEmail } from '../../lib/email.js'

const DEFAULT_PASSWORD = 'dict123456'

const TTL_HOURS = parseInt(process.env.VERIFICATION_TOKEN_TTL_HOURS ?? '24', 10)

const adminUserRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/admin/users
  fastify.get('/admin/users', { preHandler: authGuard({ role: 'ADMIN' }) }, async (request) => {
    try {
      const {
        page = '1',
        pageSize = '20',
        role,
        search,
        emailVerified,
        exportEnabled,
        canEditBuiltinConfigs,
        watermarkEnabled,
      } = request.query as {
        page?: string
        pageSize?: string
        role?: string
        search?: string
        emailVerified?: 'true' | 'false'
        exportEnabled?: 'true' | 'false'
        canEditBuiltinConfigs?: 'true' | 'false'
        watermarkEnabled?: 'true' | 'false'
      }
      const pageNum = Math.max(1, parseInt(page, 10))
      const size = Math.min(100, Math.max(1, parseInt(pageSize, 10)))
      const skip = (pageNum - 1) * size

      const where: Record<string, unknown> = {}
      if (role) where.role = role
      if (search) where.email = { contains: search, mode: 'insensitive' }
      if (emailVerified === 'true') where.emailVerified = true
      else if (emailVerified === 'false') where.emailVerified = false
      if (exportEnabled === 'true') where.exportEnabled = true
      else if (exportEnabled === 'false') where.exportEnabled = false
      if (canEditBuiltinConfigs === 'true') where.canEditBuiltinConfigs = true
      else if (canEditBuiltinConfigs === 'false') where.canEditBuiltinConfigs = false
      if (watermarkEnabled === 'true') where.watermarkEnabled = true
      else if (watermarkEnabled === 'false') where.watermarkEnabled = false

      const [users, total] = await Promise.all([
        fastify.db.user.findMany({
          where,
          skip,
          take: size,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            email: true,
            role: true,
            emailVerified: true,
            exportEnabled: true,
            maxVersions: true,
            maxBooks: true,
            canEditBuiltinConfigs: true,
            watermarkEnabled: true,
            disabled: true,
            createdAt: true,
            lastLoginAt: true,
          },
        }),
        fastify.db.user.count({ where }),
      ])

      return {
        data: users,
        total,
        page: pageNum,
        pageSize: size,
        totalPages: Math.ceil(total / size),
      }
    } catch (error) {
      throw error
    }
  })

  // GET /api/v1/admin/users/:id
  fastify.get('/admin/users/:id', { preHandler: authGuard({ role: 'ADMIN' }) }, async (request) => {
    try {
      const { id } = request.params as { id: string }
      const user = await fastify.db.user.findUnique({
        where: { id },
        select: {
          id: true,
          email: true,
          role: true,
          emailVerified: true,
          exportEnabled: true,
          maxVersions: true,
          maxBooks: true,
          canEditBuiltinConfigs: true,
          watermarkEnabled: true,
          createdAt: true,
          lastLoginAt: true,
          _count: { select: { dictionaries: true } },
        },
      })
      if (!user) throw notFound('User', id)

      const versionCount = await fastify.db.dictionaryVersion.count({
        where: { dictionary: { userId: id } },
      })

      return { ...user, bookCount: user._count.dictionaries, versionCount }
    } catch (error) {
      throw error
    }
  })

  // PATCH /api/v1/admin/users/:id
  fastify.patch('/admin/users/:id', { preHandler: authGuard({ role: 'ADMIN' }) }, async (request) => {
    try {
      const { id } = request.params as { id: string }
      const body = request.body as Partial<{
        role: string
        emailVerified: boolean
        exportEnabled: boolean
        maxVersions: number
        maxBooks: number
        canEditBuiltinConfigs: boolean
        watermarkEnabled: boolean
        disabled: boolean
      }>

      // Guard: cannot demote last admin
      if (body.role && body.role !== 'ADMIN') {
        const targetUser = await fastify.db.user.findUnique({ where: { id } })
        if (!targetUser) throw notFound('User', id)
        if (targetUser.role === 'ADMIN') {
          const adminCount = await fastify.db.user.count({ where: { role: 'ADMIN' } })
          if (adminCount <= 1) {
            throw badRequest('Cannot demote the last admin account.')
          }
        }
      }

      const data: Record<string, unknown> = {}
      if (body.role !== undefined) data.role = body.role
      if (body.emailVerified !== undefined) {
        data.emailVerified = body.emailVerified
        // Clear verification token when manually marking as verified
        if (body.emailVerified) {
          data.verificationToken = null
          data.verificationTokenExpiry = null
        }
      }
      if (body.exportEnabled !== undefined) data.exportEnabled = body.exportEnabled
      if (body.maxVersions !== undefined) data.maxVersions = body.maxVersions
      if (body.maxBooks !== undefined) data.maxBooks = body.maxBooks
      if (body.canEditBuiltinConfigs !== undefined) data.canEditBuiltinConfigs = body.canEditBuiltinConfigs
      if (body.watermarkEnabled !== undefined) data.watermarkEnabled = body.watermarkEnabled
      if (body.disabled !== undefined) {
        // Guard: cannot disable an admin account
        if (body.disabled) {
          const targetUser = await fastify.db.user.findUnique({ where: { id } })
          if (targetUser?.role === 'ADMIN') throw badRequest('Cannot disable an admin account')
        }
        data.disabled = body.disabled
      }

      const user = await fastify.db.user.update({
        where: { id },
        data,
        select: {
          id: true,
          email: true,
          role: true,
          emailVerified: true,
          exportEnabled: true,
          maxVersions: true,
          maxBooks: true,
          canEditBuiltinConfigs: true,
          watermarkEnabled: true,
          createdAt: true,
          lastLoginAt: true,
        },
      })

      return user
    } catch (error) {
      throw error
    }
  })

  // POST /api/v1/admin/users/:id/resend-verification
  fastify.post('/admin/users/:id/resend-verification', { preHandler: authGuard({ role: 'ADMIN' }) }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string }
      const user = await fastify.db.user.findUnique({ where: { id } })
      if (!user) throw notFound('User', id)
      if (user.emailVerified) throw badRequest('User email is already verified')
      if (!user.email) throw badRequest('User has no email address')

      const verificationToken = randomUUID()
      const verificationTokenExpiry = new Date(Date.now() + TTL_HOURS * 60 * 60 * 1000)
      await fastify.db.user.update({
        where: { id },
        data: { verificationToken, verificationTokenExpiry },
      })

      try {
        await sendVerificationEmail(user.email, verificationToken)
      } catch (err: unknown) {
        const msg = extractRootCause(err)
        throw internalError(`验证邮件发送失败：${msg}`, msg)
      }

      return { message: `验证邮件已重新发送至 ${user.email}` }
    } catch (error) {
      throw error
    }
  })

  // POST /api/v1/admin/users/:id/reset-password
  fastify.post('/admin/users/:id/reset-password', { preHandler: authGuard({ role: 'ADMIN' }) }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string }
      const user = await fastify.db.user.findUnique({ where: { id } })
      if (!user) throw notFound('User', id)
      if (user.role === 'ADMIN') throw badRequest('Cannot reset password for an admin account')

      const newHash = await bcrypt.hash(DEFAULT_PASSWORD, 12)
      await fastify.db.user.update({
        where: { id },
        data: {
          passwordHash: newHash,
          resetPasswordToken: null,
          resetPasswordTokenExpiry: null,
        },
      })

      return { message: `用户 ${user.email} 的密码已重置为默认密码` }
    } catch (error) {
      throw error
    }
  })

  // POST /api/v1/admin/watermark/lookup — identify user from watermark text
  fastify.post('/admin/watermark/lookup', { preHandler: authGuard({ role: 'ADMIN' }) }, async (request) => {
    try {
      const { text } = request.body as { text?: string }
      if (!text || !text.trim()) return { users: [] }

      // Extract candidate tokens: email-like and hex-id-like segments
      const emailMatch = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/)
      const idMatch    = text.match(/\b([0-9a-f]{8})\b/i)

      const conditions: object[] = []
      if (emailMatch) conditions.push({ email: { contains: emailMatch[0], mode: 'insensitive' } })
      if (idMatch)    conditions.push({ id: { startsWith: idMatch[1].toLowerCase() } })

      if (conditions.length === 0) return { users: [] }

      const users = await fastify.db.user.findMany({
        where: { OR: conditions },
        select: {
          id: true,
          email: true,
          role: true,
          emailVerified: true,
          exportEnabled: true,
          watermarkEnabled: true,
          createdAt: true,
        },
        take: 10,
      })

      return { users }
    } catch (error) {
      throw error
    }
  })
}

export default adminUserRoutes
