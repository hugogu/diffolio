import { FastifyPluginAsync } from 'fastify'
import { authGuard, requireSessionUser } from '../lib/auth-guard.js'
import { assertSystemConfigVisible } from '../lib/config-ownership.js'

const systemConfigRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/system-configs
  // Returns system configs visible to the current user:
  // ALL_USERS configs + SPECIFIC_USERS configs where user has a visibility row.
  fastify.get('/system-configs', { preHandler: authGuard() }, async (request) => {
    const user = requireSessionUser(request)

    const configs = await fastify.db.systemFormatConfig.findMany({
      where: {
        OR: [
          { visibility: 'ALL_USERS' },
          {
            visibility: 'SPECIFIC_USERS',
            allowedUsers: { some: { userId: user.id } },
          },
        ],
      },
      select: {
        id: true,
        name: true,
        description: true,
        validationStatus: true,
        visibility: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { name: 'asc' },
    })

    return configs
  })

  // GET /api/v1/system-configs/:id
  // Returns full config record including configJson for a visible config.
  fastify.get('/system-configs/:id', { preHandler: authGuard() }, async (request) => {
    const user = requireSessionUser(request)
    const { id } = request.params as { id: string }

    const config = await assertSystemConfigVisible(fastify.db, id, user.id)
    return config
  })

  // POST /api/v1/system-configs/:id/clone
  // Clones a visible system config into the current user's personal configs.
  fastify.post('/system-configs/:id/clone', { preHandler: authGuard() }, async (request, reply) => {
    const user = requireSessionUser(request)
    const { id } = request.params as { id: string }
    const body = (request.body ?? {}) as { name?: string }

    const source = await assertSystemConfigVisible(fastify.db, id, user.id)

    const clonedName = body.name ?? `${source.name}（副本）`

    const newConfig = await fastify.db.userFormatConfig.create({
      data: {
        userId: user.id,
        name: clonedName,
        description: source.description,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        configJson: source.configJson as any,
        validationStatus: source.validationStatus,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        validationReport: source.validationReport as any,
        clonedFromId: id,
      },
    })

    reply.status(201).send(newConfig)
  })
}

export default systemConfigRoutes
