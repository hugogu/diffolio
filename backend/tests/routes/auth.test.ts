import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import jwt from '@fastify/jwt'
import bcrypt from 'bcryptjs'
import authRoutes from '../../src/routes/auth.js'

const TEST_JWT_SECRET = 'test-secret-32-chars-minimum-ok!'

type MockUser = {
  id: string
  email: string
  username?: string
  emailVerified: boolean
  passwordHash: string
  role: 'REGULAR' | 'ADMIN' | 'SUBSCRIBED' | 'READER'
  disabled?: boolean
  exportEnabled?: boolean
  maxVersions?: number
  maxBooks?: number
  canEditBuiltinConfigs?: boolean
  watermarkEnabled?: boolean
  verificationToken?: string | null
  verificationTokenExpiry?: Date | null
  resetPasswordToken?: string | null
  resetPasswordTokenExpiry?: Date | null
  agreedToTerms?: boolean
  termsAgreedAt?: Date | null
  lastLoginAt?: Date | null
}

function createMockDb() {
  const users = new Map<string, MockUser>()

  function findUser(where: Record<string, unknown>) {
    if (typeof where.id === 'string') {
      return users.get(where.id) ?? null
    }

    for (const user of users.values()) {
      if (typeof where.email === 'string' && user.email === where.email) return user
      if (typeof where.verificationToken === 'string' && user.verificationToken === where.verificationToken) return user
      if (typeof where.resetPasswordToken === 'string' && user.resetPasswordToken === where.resetPasswordToken) return user
    }

    return null
  }

  return {
    seed(user: MockUser) {
      users.set(user.id, user)
      return user
    },
    getUserById(id: string) {
      return users.get(id) ?? null
    },
    db: {
      user: {
        async findUnique({ where }: { where: Record<string, unknown> }) {
          return findUser(where)
        },
        async findFirst({ where }: { where: Record<string, unknown> }) {
          return findUser(where)
        },
        async update({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) {
          const user = findUser(where)
          if (!user) throw new Error('User not found')
          const updated = { ...user, ...data }
          users.set(updated.id, updated)
          return updated
        },
      },
      userSubscription: {
        async findUnique() {
          return null
        },
      },
    },
  }
}

async function buildApp(db: ReturnType<typeof createMockDb>['db']) {
  const app = Fastify()

  await app.register(cookie)
  await app.register(jwt, {
    secret: TEST_JWT_SECRET,
    sign: { expiresIn: '1h' },
    cookie: { cookieName: 'auth_token', signed: false },
  })

  app.decorate('db', db)
  await app.register(authRoutes, { prefix: '/api/v1' })

  return app
}

describe('password reset auth routes', () => {
  const mockDb = createMockDb()
  let app: Awaited<ReturnType<typeof buildApp>>

  beforeAll(async () => {
    app = await buildApp(mockDb.db)
  })

  afterAll(async () => {
    await app.close()
  })

  async function createUser(overrides: Partial<MockUser> = {}) {
    const unique = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    const user: MockUser = {
      id: `user-${unique}`,
      email: `password-reset-${unique}@example.com`,
      username: `password-reset-${unique}`,
      emailVerified: true,
      passwordHash: await bcrypt.hash('OldPassword1!', 12),
      role: 'REGULAR',
      disabled: false,
      exportEnabled: false,
      maxVersions: 2,
      maxBooks: 1,
      canEditBuiltinConfigs: false,
      watermarkEnabled: true,
      verificationToken: null,
      verificationTokenExpiry: null,
      resetPasswordToken: null,
      resetPasswordTokenExpiry: null,
      agreedToTerms: true,
      termsAgreedAt: new Date(),
      lastLoginAt: null,
      ...overrides,
    }

    mockDb.seed(user)
    return user
  }

  it('creates a reset token for verified active users', async () => {
    const user = await createUser()

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/forgot-password',
      payload: { email: user.email },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      message: '如该邮箱已注册，我们会向其发送密码重置邮件。',
    })

    const updated = mockDb.getUserById(user.id)
    expect(updated?.resetPasswordToken).toBeTruthy()
    expect(updated?.resetPasswordTokenExpiry).toBeTruthy()
  })

  it('returns the same response for unknown emails', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/forgot-password',
      payload: { email: 'missing-user@example.com' },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      message: '如该邮箱已注册，我们会向其发送密码重置邮件。',
    })
  })

  it('validates and consumes a password reset token', async () => {
    const resetToken = `valid-reset-token-${Date.now().toString(36)}`
    const user = await createUser({
      resetPasswordToken: resetToken,
      resetPasswordTokenExpiry: new Date(Date.now() + 60 * 60 * 1000),
    })

    const validateResponse = await app.inject({
      method: 'GET',
      url: `/api/v1/auth/reset-password/validate?token=${resetToken}`,
    })
    expect(validateResponse.statusCode).toBe(204)

    const resetResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/reset-password',
      payload: {
        token: resetToken,
        newPassword: 'NewPassword1!',
      },
    })

    expect(resetResponse.statusCode).toBe(200)
    expect(resetResponse.json()).toEqual({
      message: '密码已重置，您现在可以使用新密码登录。',
    })

    const updated = mockDb.getUserById(user.id)
    expect(updated?.resetPasswordToken).toBeNull()
    expect(updated?.resetPasswordTokenExpiry).toBeNull()
    expect(await bcrypt.compare('NewPassword1!', updated!.passwordHash)).toBe(true)
  })

  it('rejects expired reset tokens', async () => {
    const resetToken = `expired-reset-token-${Date.now().toString(36)}`
    await createUser({
      resetPasswordToken: resetToken,
      resetPasswordTokenExpiry: new Date(Date.now() - 60 * 1000),
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/reset-password',
      payload: {
        token: resetToken,
        newPassword: 'NewPassword1!',
      },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().message).toBe('Invalid or expired password reset link')
  })
})
