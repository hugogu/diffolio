import { Prisma } from '@prisma/client'
import { FastifyPluginAsync } from 'fastify'
import { authGuard, requireSessionUser } from '../lib/auth-guard.js'
import { assertUserConfigOwner } from '../lib/config-ownership.js'
import { notFound, unprocessable } from '../lib/errors.js'
import { validateConfig } from '../services/config-engine.js'
import { appendConfigVersion, getCurrentConfigVersion } from '../services/configs/versioning.js'
import {
  ensureUserConfigSnapshot,
  getConfigVersionDetail,
  listConfigVersions,
} from '../services/configs/snapshots.js'
import { FormatConfigJson } from '../lib/types/shared.js'

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

    const profileIds = configs.map((config) => config.id)
    if (profileIds.length === 0) {
      return []
    }

    const [currentVersions, versionCounts] = await Promise.all([
      fastify.db.configVersion.findMany({
        where: { profileId: { in: profileIds }, isCurrent: true },
        select: { id: true, profileId: true, versionNumber: true, createdAt: true },
      }),
      fastify.db.configVersion.groupBy({
        by: ['profileId'],
        where: { profileId: { in: profileIds } },
        _count: { _all: true },
      }),
    ])

    const currentByProfile = new Map(currentVersions.map((version) => [version.profileId, version]))
    const countByProfile = new Map(versionCounts.map((row) => [row.profileId, row._count._all]))

    return configs.map((config) => ({
      ...config,
      profileId: config.id,
      currentVersionId: currentByProfile.get(config.id)?.id ?? null,
      currentVersionNumber: currentByProfile.get(config.id)?.versionNumber ?? 1,
      versionCount: countByProfile.get(config.id) ?? 0,
    }))
  })

  // GET /api/v1/configs/:id
  // Returns full config record including configJson and validationReport.
  fastify.get('/configs/:id', { preHandler: authGuard() }, async (request) => {
    const user = requireSessionUser(request)
    const { id } = request.params as { id: string }

    const config = await assertUserConfigOwner(fastify.db, id, user.id)
    const currentVersion = await getCurrentConfigVersion(fastify.db, id)

    return {
      ...config,
      profileId: id,
      currentVersionId: currentVersion?.id ?? null,
      currentVersionNumber: currentVersion?.versionNumber ?? 1,
      configJson: (currentVersion?.configJson ?? config.configJson) as Record<string, unknown>,
      validationReport: (currentVersion?.validationReport ?? config.validationReport) as Record<string, unknown> | null,
    }
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

    const config = await fastify.db.$transaction(async (tx) => {
      return ensureUserConfigSnapshot(tx, {
        userId: user.id,
        name: body.name,
        description: body.description,
        configJson: body.configJson as unknown as FormatConfigJson,
      })
    })

    reply.status(201).send(config)
  })

  // PATCH /api/v1/configs/:id
  // Updates the config snapshot and appends a new immutable version when configJson changes.
  fastify.patch('/configs/:id', { preHandler: authGuard() }, async (request) => {
    const user = requireSessionUser(request)
    const { id } = request.params as { id: string }
    const existing = await assertUserConfigOwner(fastify.db, id, user.id)

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

    const config = await fastify.db.$transaction(async (tx) => {
      if (body.configJson !== undefined) {
        return ensureUserConfigSnapshot(tx, {
          id,
          userId: user.id,
          name: body.name ?? existing.name,
          description: body.description ?? existing.description,
          configJson: body.configJson as unknown as FormatConfigJson,
          clonedFromId: existing.clonedFromId,
        })
      }

      return tx.userFormatConfig.update({
        where: { id },
        data: updateData,
      })
    })

    return config
  })

  // GET /api/v1/configs/:id/versions
  fastify.get('/configs/:id/versions', { preHandler: authGuard() }, async (request) => {
    const user = requireSessionUser(request)
    const { id } = request.params as { id: string }
    await assertUserConfigOwner(fastify.db, id, user.id)

    const versions = await listConfigVersions(fastify.db, id)
    const currentVersion = versions.find((version) => version.isCurrent) ?? null

    return {
      profileId: id,
      currentVersionId: currentVersion?.id ?? null,
      data: versions,
    }
  })

  // GET /api/v1/configs/:id/versions/:versionId
  fastify.get('/configs/:id/versions/:versionId', { preHandler: authGuard() }, async (request) => {
    const user = requireSessionUser(request)
    const { id, versionId } = request.params as { id: string; versionId: string }
    await assertUserConfigOwner(fastify.db, id, user.id)

    const version = await getConfigVersionDetail(fastify.db, id, versionId)
    if (!version) {
      throw notFound('ConfigVersion', versionId)
    }

    return version
  })

  // POST /api/v1/configs/:id/versions
  fastify.post('/configs/:id/versions', { preHandler: authGuard() }, async (request, reply) => {
    const user = requireSessionUser(request)
    const { id } = request.params as { id: string }
    const existing = await assertUserConfigOwner(fastify.db, id, user.id)
    const body = request.body as {
      name?: string
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

    const result = await fastify.db.$transaction(async (tx) => {
      const version = await appendConfigVersion(tx, {
        profileId: id,
        configJson: body.configJson as unknown as FormatConfigJson,
        createdBy: user.id,
        validationStatus: 'VALID',
        validationReport: validationResult.warnings.length > 0
          ? { errors: validationResult.errors, warnings: validationResult.warnings }
          : undefined,
        markAsCurrent: true,
      })

      await tx.userFormatConfig.update({
        where: { id },
        data: {
          name: body.name ?? existing.name,
          description: body.description ?? existing.description,
          configJson: body.configJson as unknown as Prisma.InputJsonValue,
          validationStatus: 'VALID',
          validationReport: validationResult.warnings.length > 0
            ? { errors: validationResult.errors, warnings: validationResult.warnings } as Prisma.InputJsonValue
            : Prisma.JsonNull,
        },
      })

      await tx.configProfile.update({
        where: { id },
        data: {
          name: body.name ?? existing.name,
          description: body.description ?? existing.description,
        },
      })

      return version
    })

    reply.status(201).send({
      profileId: id,
      versionId: result.id,
      versionNumber: result.versionNumber,
      isCurrent: result.isCurrent,
      validationStatus: result.validationStatus,
    })
  })

  // DELETE /api/v1/configs/:id
  // Deletes a personal config.
  fastify.delete('/configs/:id', { preHandler: authGuard() }, async (request, reply) => {
    const user = requireSessionUser(request)
    const { id } = request.params as { id: string }
    await assertUserConfigOwner(fastify.db, id, user.id)

    await fastify.db.$transaction(async (tx) => {
      await tx.userFormatConfig.delete({ where: { id } })
      await tx.configProfile.update({
        where: { id },
        data: { archivedAt: new Date() },
      }).catch(() => null)
    })
    reply.status(204).send()
  })
}

export default userConfigRoutes
