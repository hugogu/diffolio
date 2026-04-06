import { FastifyPluginAsync } from 'fastify'
import { Prisma } from '@prisma/client'
import { authGuard } from '../../lib/auth-guard.js'

function buildOrderBy(sortBy: string, sortOrder: 'asc' | 'desc') {
  switch (sortBy) {
    case 'status':
      return { status: sortOrder }
    case 'totalEntries':
      return { totalEntries: sortOrder }
    case 'completedAt':
      return { completedAt: sortOrder }
    default:
      return { updatedAt: sortOrder }
  }
}

const adminParseArtifactRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/admin/parse-artifacts', {
    preHandler: authGuard({ role: 'ADMIN' }),
  }, async (request) => {
    const {
      page = '1',
      pageSize = '20',
      status,
      fileType,
      search,
      sortBy = 'updatedAt',
      sortOrder = 'desc',
    } = request.query as {
      page?: string
      pageSize?: string
      status?: string
      fileType?: string
      search?: string
      sortBy?: string
      sortOrder?: 'asc' | 'desc'
    }

    const pageNum = Math.max(1, parseInt(page, 10))
    const size = Math.min(100, Math.max(1, parseInt(pageSize, 10)))
    const skip = (pageNum - 1) * size

    const where: Prisma.SharedParseArtifactWhereInput = {}
    if (status) where.status = status as never
    if (fileType) {
      where.sharedFileAsset = { fileType: fileType as never }
    }
    if (search) {
      where.OR = [
        { sharedFileAsset: { contentHash: { contains: search, mode: 'insensitive' } } },
        { configVersion: { profile: { name: { contains: search, mode: 'insensitive' } } } },
      ]
    }

    const [total, artifacts] = await Promise.all([
      fastify.db.sharedParseArtifact.count({ where }),
      fastify.db.sharedParseArtifact.findMany({
        where,
        skip,
        take: size,
        orderBy: buildOrderBy(sortBy, sortOrder),
        include: {
          sharedFileAsset: true,
          configVersion: {
            include: {
              profile: true,
            },
          },
          references: {
            include: {
              user: {
                select: { id: true, email: true },
              },
            },
          },
        },
      }),
    ])

    return {
      total,
      page: pageNum,
      pageSize: size,
      totalPages: Math.ceil(total / size),
      data: artifacts.map((artifact) => {
        const activeReferences = artifact.references.filter((reference) => reference.isActive)
        const users = new Set(activeReferences.map((reference) => reference.userId))

        return {
          id: artifact.id,
          status: artifact.status,
          totalEntries: artifact.totalEntries,
          failedEntries: artifact.failedEntries,
          parserFingerprint: artifact.parserFingerprint,
          sharedFileAssetId: artifact.sharedFileAssetId,
          sharedFileAsset: {
            id: artifact.sharedFileAsset.id,
            contentHash: artifact.sharedFileAsset.contentHash,
            fileType: artifact.sharedFileAsset.fileType,
            fileSize: Number(artifact.sharedFileAsset.fileSize),
          },
          configVersionId: artifact.configVersionId,
          configVersion: {
            id: artifact.configVersion.id,
            versionNumber: artifact.configVersion.versionNumber,
            profileId: artifact.configVersion.profileId,
            profileName: artifact.configVersion.profile.name,
          },
          referenceCount: activeReferences.length,
          userCount: users.size,
          completedAt: artifact.completedAt?.toISOString() ?? null,
          createdAt: artifact.createdAt.toISOString(),
          updatedAt: artifact.updatedAt.toISOString(),
        }
      }),
    }
  })
}

export default adminParseArtifactRoutes
