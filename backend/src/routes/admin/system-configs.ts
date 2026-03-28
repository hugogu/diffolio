import { FastifyPluginAsync } from 'fastify'
import { authGuard, requireSessionUser } from '../../lib/auth-guard.js'
import { validateConfig } from '../../services/config-engine.js'
import { notFound, unprocessable } from '../../lib/errors.js'

const adminSystemConfigRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/admin/system-configs
  // Paginated list of all system configs regardless of visibility.
  fastify.get('/admin/system-configs', { preHandler: authGuard({ role: 'ADMIN' }) }, async (request) => {
    const { page = '1', pageSize = '20', search } = request.query as {
      page?: string
      pageSize?: string
      search?: string
    }
    const pageNum = Math.max(1, parseInt(page, 10))
    const size = Math.min(100, Math.max(1, parseInt(pageSize, 10)))
    const skip = (pageNum - 1) * size

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: Record<string, any> = {}
    if (search) where.name = { contains: search, mode: 'insensitive' }

    const [total, configs] = await Promise.all([
      fastify.db.systemFormatConfig.count({ where }),
      fastify.db.systemFormatConfig.findMany({
        where,
        select: {
          id: true,
          name: true,
          description: true,
          validationStatus: true,
          visibility: true,
          createdAt: true,
          updatedAt: true,
          createdBy: { select: { id: true, email: true } },
        },
        orderBy: { name: 'asc' },
        skip,
        take: size,
      }),
    ])

    return { total, page: pageNum, pageSize: size, data: configs }
  })

  // POST /api/v1/admin/system-configs
  // Creates a new system config; validates configJson.
  fastify.post('/admin/system-configs', { preHandler: authGuard({ role: 'ADMIN' }) }, async (request, reply) => {
    const user = requireSessionUser(request)
    const body = request.body as {
      name: string
      description?: string
      configJson: Record<string, unknown>
      visibility?: 'ALL_USERS' | 'SPECIFIC_USERS'
    }

    const validationResult = validateConfig(body.configJson)
    if (!validationResult.isValid) {
      throw unprocessable(
        'Format config validation failed',
        { errors: validationResult.errors, warnings: validationResult.warnings }
      )
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const validationReportJson = validationResult.warnings.length > 0
      ? { errors: validationResult.errors, warnings: validationResult.warnings } as any
      : undefined

    const config = await fastify.db.systemFormatConfig.create({
      data: {
        name: body.name,
        description: body.description,
        configJson: body.configJson as any,
        visibility: body.visibility ?? 'ALL_USERS',
        createdById: user.id,
        validationStatus: 'VALID',
        validationReport: validationReportJson,
      },
    })

    reply.status(201).send(config)
  })

  // GET /api/v1/admin/system-configs/:id
  // Returns full record including allowedUsers list.
  fastify.get('/admin/system-configs/:id', { preHandler: authGuard({ role: 'ADMIN' }) }, async (request) => {
    const { id } = request.params as { id: string }

    const config = await fastify.db.systemFormatConfig.findUnique({
      where: { id },
      include: {
        allowedUsers: { include: { user: { select: { id: true, email: true } } } },
        createdBy: { select: { id: true, email: true } },
      },
    })

    if (!config) throw notFound('SystemFormatConfig', id)
    return config
  })

  // PATCH /api/v1/admin/system-configs/:id
  // Partial update; re-validates if configJson is changed.
  fastify.patch('/admin/system-configs/:id', { preHandler: authGuard({ role: 'ADMIN' }) }, async (request) => {
    const { id } = request.params as { id: string }

    const exists = await fastify.db.systemFormatConfig.findUnique({ where: { id } })
    if (!exists) throw notFound('SystemFormatConfig', id)

    const body = request.body as {
      name?: string
      description?: string
      configJson?: Record<string, unknown>
      visibility?: 'ALL_USERS' | 'SPECIFIC_USERS'
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: Record<string, any> = {}
    if (body.name !== undefined) updateData.name = body.name
    if (body.description !== undefined) updateData.description = body.description
    if (body.visibility !== undefined) updateData.visibility = body.visibility

    if (body.configJson !== undefined) {
      const validationResult = validateConfig(body.configJson)
      if (!validationResult.isValid) {
        throw unprocessable(
          'Format config validation failed',
          { errors: validationResult.errors, warnings: validationResult.warnings }
        )
      }

      updateData.configJson = body.configJson
      updateData.validationStatus = 'VALID'
      updateData.validationReport = validationResult.warnings.length > 0
        ? { errors: validationResult.errors, warnings: validationResult.warnings }
        : null
    }

    const config = await fastify.db.systemFormatConfig.update({
      where: { id },
      data: updateData,
    })

    return config
  })

  // DELETE /api/v1/admin/system-configs/:id
  // Deletes config; CASCADE deletes visibility rows.
  fastify.delete('/admin/system-configs/:id', { preHandler: authGuard({ role: 'ADMIN' }) }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const exists = await fastify.db.systemFormatConfig.findUnique({ where: { id } })
    if (!exists) throw notFound('SystemFormatConfig', id)

    await fastify.db.systemFormatConfig.delete({ where: { id } })
    reply.status(204).send()
  })

  // PUT /api/v1/admin/system-configs/:id/visibility
  // Replaces visibility setting and allowed users list atomically.
  fastify.put('/admin/system-configs/:id/visibility', { preHandler: authGuard({ role: 'ADMIN' }) }, async (request) => {
    const { id } = request.params as { id: string }
    const body = request.body as {
      visibility: 'ALL_USERS' | 'SPECIFIC_USERS'
      userIds?: string[]
    }

    const exists = await fastify.db.systemFormatConfig.findUnique({ where: { id } })
    if (!exists) throw notFound('SystemFormatConfig', id)

    // Replace visibility and allowed users in a transaction
    const config = await fastify.db.$transaction(async (tx) => {
      await tx.systemFormatConfig.update({ where: { id }, data: { visibility: body.visibility } })

      await tx.systemConfigVisibility.deleteMany({ where: { systemConfigId: id } })

      if (body.visibility === 'SPECIFIC_USERS' && body.userIds && body.userIds.length > 0) {
        await tx.systemConfigVisibility.createMany({
          data: body.userIds.map((userId) => ({ systemConfigId: id, userId })),
          skipDuplicates: true,
        })
      }

      return tx.systemFormatConfig.findUnique({
        where: { id },
        include: {
          allowedUsers: { include: { user: { select: { id: true, email: true } } } },
        },
      })
    })

    return config
  })
}

export default adminSystemConfigRoutes
