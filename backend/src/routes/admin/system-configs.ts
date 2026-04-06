import { Prisma } from '@prisma/client'
import { FastifyPluginAsync } from 'fastify'
import { authGuard, requireSessionUser } from '../../lib/auth-guard.js'
import { validateConfig } from '../../services/config-engine.js'
import { notFound, unprocessable } from '../../lib/errors.js'
import {
  ensureSystemConfigSnapshot,
  getConfigVersionDetail,
  listConfigVersions,
} from '../../services/configs/snapshots.js'
import { appendConfigVersion, getCurrentConfigVersion } from '../../services/configs/versioning.js'
import { FormatConfigJson } from '../../lib/types/shared.js'

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

    const profileIds = configs.map((config) => config.id)
    const [currentVersions, versionCounts] = profileIds.length > 0
      ? await Promise.all([
          fastify.db.configVersion.findMany({
            where: { profileId: { in: profileIds }, isCurrent: true },
            select: { id: true, profileId: true, versionNumber: true },
          }),
          fastify.db.configVersion.groupBy({
            by: ['profileId'],
            where: { profileId: { in: profileIds } },
            _count: { _all: true },
          }),
        ])
      : [[], []]

    const currentByProfile = new Map(currentVersions.map((version) => [version.profileId, version]))
    const countByProfile = new Map(versionCounts.map((row) => [row.profileId, row._count._all]))

    return {
      total,
      page: pageNum,
      pageSize: size,
      data: configs.map((config) => ({
        ...config,
        profileId: config.id,
        currentVersionId: currentByProfile.get(config.id)?.id ?? null,
        currentVersionNumber: currentByProfile.get(config.id)?.versionNumber ?? 1,
        versionCount: countByProfile.get(config.id) ?? 0,
      })),
    }
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

    const config = await fastify.db.$transaction(async (tx) => {
      return ensureSystemConfigSnapshot(tx, {
        adminUserId: user.id,
        name: body.name,
        description: body.description,
        configJson: body.configJson as unknown as FormatConfigJson,
        visibility: body.visibility ?? 'ALL_USERS',
      })
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

    const config = await fastify.db.$transaction(async (tx) => {
      if (body.configJson !== undefined) {
        const validationResult = validateConfig(body.configJson)
        if (!validationResult.isValid) {
          throw unprocessable(
            'Format config validation failed',
            { errors: validationResult.errors, warnings: validationResult.warnings }
          )
        }

        return ensureSystemConfigSnapshot(tx, {
          id,
          adminUserId: exists.createdById,
          name: body.name ?? exists.name,
          description: body.description ?? exists.description,
          visibility: body.visibility ?? exists.visibility,
          configJson: body.configJson as unknown as FormatConfigJson,
          allowedUserIds: body.visibility === 'SPECIFIC_USERS'
            ? undefined
            : undefined,
        })
      }

      return tx.systemFormatConfig.update({
        where: { id },
        data: {
          name: body.name ?? undefined,
          description: body.description ?? undefined,
          visibility: body.visibility ?? undefined,
        },
      })
    })

    return config
  })

  // DELETE /api/v1/admin/system-configs/:id
  // Deletes config; CASCADE deletes visibility rows.
  fastify.delete('/admin/system-configs/:id', { preHandler: authGuard({ role: 'ADMIN' }) }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const exists = await fastify.db.systemFormatConfig.findUnique({ where: { id } })
    if (!exists) throw notFound('SystemFormatConfig', id)

    await fastify.db.$transaction(async (tx) => {
      await tx.systemFormatConfig.delete({ where: { id } })
      await tx.configProfile.update({
        where: { id },
        data: { archivedAt: new Date() },
      }).catch(() => null)
    })
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

  fastify.get('/admin/system-configs/:id/versions', { preHandler: authGuard({ role: 'ADMIN' }) }, async (request) => {
    const { id } = request.params as { id: string }
    const exists = await fastify.db.systemFormatConfig.findUnique({ where: { id } })
    if (!exists) throw notFound('SystemFormatConfig', id)

    const versions = await listConfigVersions(fastify.db, id)
    const currentVersion = versions.find((version) => version.isCurrent) ?? null

    return {
      profileId: id,
      currentVersionId: currentVersion?.id ?? null,
      data: versions,
    }
  })

  fastify.get('/admin/system-configs/:id/versions/:versionId', { preHandler: authGuard({ role: 'ADMIN' }) }, async (request) => {
    const { id, versionId } = request.params as { id: string; versionId: string }
    const exists = await fastify.db.systemFormatConfig.findUnique({ where: { id } })
    if (!exists) throw notFound('SystemFormatConfig', id)

    const version = await getConfigVersionDetail(fastify.db, id, versionId)
    if (!version) throw notFound('ConfigVersion', versionId)

    return version
  })

  fastify.post('/admin/system-configs/:id/versions', { preHandler: authGuard({ role: 'ADMIN' }) }, async (request, reply) => {
    const user = requireSessionUser(request)
    const { id } = request.params as { id: string }
    const exists = await fastify.db.systemFormatConfig.findUnique({ where: { id } })
    if (!exists) throw notFound('SystemFormatConfig', id)

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

      await tx.systemFormatConfig.update({
        where: { id },
        data: {
          name: body.name ?? exists.name,
          description: body.description ?? exists.description,
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
          name: body.name ?? exists.name,
          description: body.description ?? exists.description,
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
}

export default adminSystemConfigRoutes
