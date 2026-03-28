import { FastifyPluginAsync } from 'fastify'
import { authGuard, requireSessionUser } from '../lib/auth-guard.js'
import { assertUserConfigOwner } from '../lib/config-ownership.js'
import { unprocessable } from '../lib/errors.js'
import { validateConfig } from '../services/config-engine.js'

const userConfigRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/configs
  // Returns the current user's personal format configs ordered by updatedAt desc.
  fastify.get('/configs', { preHandler: authGuard() }, async (request) => {
    const user = requireSessionUser(request)

    const configs = await fastify.db.userFormatConfig.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        name: true,
        description: true,
        validationStatus: true,
        clonedFromId: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    })

    return configs
  })

  // GET /api/v1/configs/:id
  // Returns full config record including configJson and validationReport.
  fastify.get('/configs/:id', { preHandler: authGuard() }, async (request) => {
    const user = requireSessionUser(request)
    const { id } = request.params as { id: string }

    const config = await assertUserConfigOwner(fastify.db, id, user.id)
    return config
  })

  // POST /api/v1/configs
  // Creates a new personal config; validates configJson.
  fastify.post('/configs', { preHandler: authGuard() }, async (request, reply) => {
    const user = requireSessionUser(request)
    const body = request.body as {
      name: string
      description?: string
      configJson: Record<string, unknown>
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

    const config = await fastify.db.userFormatConfig.create({
      data: {
        userId: user.id,
        name: body.name,
        description: body.description,
        configJson: body.configJson as any,
        validationStatus: 'VALID',
        validationReport: validationReportJson,
      },
    })

    reply.status(201).send(config)
  })

  // PATCH /api/v1/configs/:id
  // Partial update; re-validates if configJson is changed.
  fastify.patch('/configs/:id', { preHandler: authGuard() }, async (request) => {
    const user = requireSessionUser(request)
    const { id } = request.params as { id: string }
    await assertUserConfigOwner(fastify.db, id, user.id)

    const body = request.body as {
      name?: string
      description?: string
      configJson?: Record<string, unknown>
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: Record<string, any> = {}
    if (body.name !== undefined) updateData.name = body.name
    if (body.description !== undefined) updateData.description = body.description

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

    const config = await fastify.db.userFormatConfig.update({
      where: { id },
      data: updateData,
    })

    return config
  })

  // DELETE /api/v1/configs/:id
  // Deletes a personal config.
  fastify.delete('/configs/:id', { preHandler: authGuard() }, async (request, reply) => {
    const user = requireSessionUser(request)
    const { id } = request.params as { id: string }
    await assertUserConfigOwner(fastify.db, id, user.id)

    await fastify.db.userFormatConfig.delete({ where: { id } })
    reply.status(204).send()
  })
}

export default userConfigRoutes
