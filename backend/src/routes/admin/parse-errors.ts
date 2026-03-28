import { FastifyPluginAsync } from 'fastify'
import { authGuard } from '../../lib/auth-guard.js'
import { paginate, decodeCursor } from '../../lib/pagination.js'

const adminParseErrorRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/admin/parse-errors
  fastify.get(
    '/admin/parse-errors',
    { preHandler: authGuard({ role: 'ADMIN' }) },
    async (request) => {
      const {
        cursor,
        limit = '50',
        status,
        errorCode,
      } = request.query as {
        cursor?: string
        limit?: string
        status?: string
        errorCode?: string
      }

      const take = Math.min(parseInt(limit, 10), 200) + 1
      const where: Record<string, unknown> = {}
      if (status) where.status = status
      if (errorCode) where.errorCode = errorCode
      if (cursor) where.id = { gt: decodeCursor(cursor) }

      const errors = await fastify.db.parseError.findMany({
        where,
        take,
        orderBy: { createdAt: 'asc' },
        include: {
          task: {
            select: {
              id: true,
              originalFileName: true,
              fileType: true,
              version: {
                select: {
                  id: true,
                  label: true,
                  dictionary: {
                    select: {
                      id: true,
                      name: true,
                      user: { select: { id: true, email: true } },
                    },
                  },
                },
              },
            },
          },
        },
      })

      return paginate(errors, take - 1)
    }
  )
}

export default adminParseErrorRoutes
