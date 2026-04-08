import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify'
import { unauthorized, forbidden } from './errors.js'

export interface SessionUser {
  id: string
  email: string
  role: 'ADMIN' | 'REGULAR' | 'READER' | 'SUBSCRIBED'
  emailVerified: boolean
  exportEnabled: boolean
  maxVersions: number
  maxBooks: number
  canEditBuiltinConfigs: boolean
  watermarkEnabled: boolean
}

interface AuthGuardOptions {
  role?: 'ADMIN' | 'REGULAR' | 'READER'
}

export function authGuard(opts: AuthGuardOptions = {}) {
  return async function (request: FastifyRequest, _reply: FastifyReply) {
    // Verify JWT — checks Authorization header first, then auth_token cookie
    try {
      await request.jwtVerify()
    } catch {
      throw unauthorized()
    }

    const user = request.user
    if (!user?.id) throw unauthorized()

    // Check DB for disabled status on every request
    const db = (request.server as FastifyInstance).db
    const dbUser = await db.user.findUnique({ where: { id: user.id }, select: { disabled: true } })
    if (!dbUser || dbUser.disabled) throw unauthorized()

    if (opts.role === 'ADMIN' && user.role !== 'ADMIN') {
      throw forbidden()
    }
  }
}

export function getSessionUser(request: FastifyRequest): SessionUser | undefined {
  return request.user
}

export function requireSessionUser(request: FastifyRequest): SessionUser {
  const user = getSessionUser(request)
  if (!user) throw unauthorized()
  return user
}

/** Enforces that the session user has exportEnabled = true */
export function checkExportEnabled() {
  return async function (request: FastifyRequest, _reply: FastifyReply) {
    const user = request.user
    if (!user) throw unauthorized()
    if (!user.exportEnabled) throw forbidden('Export and download is not enabled for your account.')
  }
}

/** Enforces that the session user has not exceeded their maxBooks limit */
export function checkMaxBooks() {
  return async function (request: FastifyRequest, _reply: FastifyReply) {
    const user = request.user
    if (!user) throw unauthorized()
    const count = await (request.server as FastifyInstance).db.dictionary.count({ where: { userId: user.id } })
    if (count >= user.maxBooks) {
      throw forbidden('You have reached the maximum number of dictionaries allowed for your account.')
    }
  }
}

/** Enforces that the session user has not exceeded their maxVersions limit */
export function checkMaxVersions() {
  return async function (request: FastifyRequest, _reply: FastifyReply) {
    const user = request.user
    if (!user) throw unauthorized()
    const count = await (request.server as FastifyInstance).db.dictionaryVersion.count({
      where: { dictionary: { userId: user.id } },
    })
    if (count >= user.maxVersions) {
      throw forbidden('You have reached the maximum number of dictionary versions allowed for your account.')
    }
  }
}

/** Enforces that the session user has canEditBuiltinConfigs = true */
export function checkCanEditBuiltinConfigs() {
  return async function (request: FastifyRequest, _reply: FastifyReply) {
    const user = request.user
    if (!user) throw unauthorized()
    if (!user.canEditBuiltinConfigs) {
      throw forbidden('You do not have permission to edit built-in format configurations.')
    }
  }
}
