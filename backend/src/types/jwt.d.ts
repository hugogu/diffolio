import '@fastify/jwt'
import { SessionUser } from '../lib/auth-guard.js'

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: SessionUser
    user: SessionUser
  }
}
