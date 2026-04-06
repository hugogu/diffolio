import { FastifyPluginAsync } from 'fastify'
import { authGuard, requireSessionUser } from '../lib/auth-guard.js'
import { assertSystemConfigVisible } from '../lib/config-ownership.js'
import { notFound } from '../lib/errors.js'
import { ensureUserConfigSnapshot, getConfigVersionDetail, listConfigVersions } from '../services/configs/snapshots.js'
import { getCurrentConfigVersion } from '../services/configs/versioning.js'
import { FormatConfigJson } from '../lib/types/shared.js'

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

    const profileIds = configs.map((config) => config.id)
    if (profileIds.length === 0) {
      return []
    }

    const [currentVersions, versionCounts] = await Promise.all([
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

  // GET /api/v1/system-configs/:id
  // Returns full config record including configJson for a visible config.
  fastify.get('/system-configs/:id', { preHandler: authGuard() }, async (request) => {
    const user = requireSessionUser(request)
    const { id } = request.params as { id: string }

    const config = await assertSystemConfigVisible(fastify.db, id, user.id)
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

  fastify.get('/system-configs/:id/versions', { preHandler: authGuard() }, async (request) => {
    const user = requireSessionUser(request)
    const { id } = request.params as { id: string }
    await assertSystemConfigVisible(fastify.db, id, user.id)

    const versions = await listConfigVersions(fastify.db, id)
    const currentVersion = versions.find((version) => version.isCurrent) ?? null

    return {
      profileId: id,
      currentVersionId: currentVersion?.id ?? null,
      data: versions,
    }
  })

  fastify.get('/system-configs/:id/versions/:versionId', { preHandler: authGuard() }, async (request) => {
    const user = requireSessionUser(request)
    const { id, versionId } = request.params as { id: string; versionId: string }
    await assertSystemConfigVisible(fastify.db, id, user.id)

    const version = await getConfigVersionDetail(fastify.db, id, versionId)
    if (!version) {
      throw notFound('ConfigVersion', versionId)
    }

    return version
  })

  // POST /api/v1/system-configs/:id/clone
  // Clones a visible system config into the current user's personal configs.
  fastify.post('/system-configs/:id/clone', { preHandler: authGuard() }, async (request, reply) => {
    const user = requireSessionUser(request)
    const { id } = request.params as { id: string }
    const body = (request.body ?? {}) as { name?: string }

    const source = await assertSystemConfigVisible(fastify.db, id, user.id)

    const clonedName = body.name ?? `${source.name}（副本）`

    const currentVersion = await getCurrentConfigVersion(fastify.db, id)
    const sourceConfigJson = (currentVersion?.configJson ?? source.configJson) as unknown as FormatConfigJson

    const newConfig = await fastify.db.$transaction(async (tx) => {
      return ensureUserConfigSnapshot(tx, {
        userId: user.id,
        name: clonedName,
        description: source.description,
        configJson: sourceConfigJson,
        clonedFromId: id,
      })
    })

    reply.status(201).send(newConfig)
  })
}

export default systemConfigRoutes
