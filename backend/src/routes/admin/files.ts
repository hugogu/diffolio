import { FastifyPluginAsync } from 'fastify'
import { Prisma } from '@prisma/client'
import { authGuard } from '../../lib/auth-guard.js'
import { badRequest, notFound } from '../../lib/errors.js'
import { fileExists, getFileStream, getStoredFileSize } from '../../lib/storage.js'

function buildOrderBy(sortBy: string, sortOrder: 'asc' | 'desc') {
  switch (sortBy) {
    case 'fileSize':
      return { fileSize: sortOrder }
    case 'fileType':
      return { fileType: sortOrder }
    case 'lastReferencedAt':
      return { lastReferencedAt: sortOrder }
    case 'firstSeenAt':
      return { firstSeenAt: sortOrder }
    default:
      return { lastReferencedAt: sortOrder }
  }
}

type AdminFileRow = {
  id: string
  contentHash: string
  fileType: string
  fileSize: number
  originalFileName: string | null
  referenceCount: number
  historicalReferenceCount: number
  userCount: number
  isUnreferenced: boolean
  firstSeenAt: string
  lastReferencedAt: string
}

const adminFileRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/admin/files', {
    preHandler: authGuard({ role: 'ADMIN' }),
  }, async (request) => {
    const {
      page = '1',
      pageSize = '20',
      userId,
      fileType,
      search,
      sortBy = 'lastReferencedAt',
      sortOrder = 'desc',
      unreferenced,
    } = request.query as {
      page?: string
      pageSize?: string
      userId?: string
      fileType?: string
      search?: string
      sortBy?: string
      sortOrder?: 'asc' | 'desc'
      unreferenced?: string
    }

    const pageNum = Math.max(1, parseInt(page, 10))
    const size = Math.min(100, Math.max(1, parseInt(pageSize, 10)))
    const skip = (pageNum - 1) * size

    const where: Prisma.SharedFileAssetWhereInput = {}
    if (fileType) where.fileType = fileType as never
    const versionReferenceWhere: Prisma.VersionFileReferenceWhereInput = {}
    if (search) {
      versionReferenceWhere.originalFileName = { contains: search, mode: 'insensitive' }
    }
    if (userId) {
      versionReferenceWhere.version = {
        dictionary: {
          userId,
        },
      }
    }
    if (Object.keys(versionReferenceWhere).length > 0) {
      where.versionReferences = {
        some: versionReferenceWhere,
      }
    }

    const [assets, legacyTasks] = await Promise.all([
      fastify.db.sharedFileAsset.findMany({
        where,
        orderBy: buildOrderBy(sortBy, sortOrder),
        include: {
          versionReferences: {
            include: {
              version: {
                include: {
                  dictionary: {
                    include: { user: true },
                  },
                },
              },
              uploadedByUser: {
                select: { id: true, email: true },
              },
            },
            orderBy: { createdAt: 'desc' },
          },
        },
      }),
      fastify.db.parseTask.findMany({
        where: {
          sharedFileAssetId: null,
          version: {
            fileReferences: { none: { isActive: true } },
            ...(userId ? { dictionary: { userId } } : {}),
          },
          ...(fileType ? { fileType: fileType as never } : {}),
          ...(search ? { originalFileName: { contains: search, mode: 'insensitive' } } : {}),
        },
        orderBy: { createdAt: 'desc' },
        include: {
          version: {
            include: {
              dictionary: {
                include: { user: true },
              },
            },
          },
        },
      }),
    ])

    const sharedRows: AdminFileRow[] = assets.map((asset) => {
      const activeReferences = asset.versionReferences.filter((reference) => reference.isActive)
      const referencedUsers = new Map<string, { id: string; email: string }>()

      for (const reference of activeReferences) {
        const user = reference.version.dictionary.user
        if (user) {
          referencedUsers.set(user.id, { id: user.id, email: user.email })
        }
      }

      const latestReference = asset.versionReferences[0] ?? null

      return {
        id: asset.id,
        contentHash: asset.contentHash,
        fileType: asset.fileType,
        fileSize: Number(asset.fileSize),
        originalFileName: latestReference?.originalFileName ?? null,
        referenceCount: activeReferences.length,
        historicalReferenceCount: asset.versionReferences.length,
        userCount: referencedUsers.size,
        isUnreferenced: activeReferences.length === 0,
        firstSeenAt: asset.firstSeenAt.toISOString(),
        lastReferencedAt: asset.lastReferencedAt.toISOString(),
      }
    })

    const seenLegacyVersions = new Set<string>()
    const legacyRows: AdminFileRow[] = []
    for (const task of legacyTasks) {
      if (seenLegacyVersions.has(task.versionId)) {
        continue
      }
      seenLegacyVersions.add(task.versionId)

      legacyRows.push({
        id: `legacy:${task.id}`,
        contentHash: task.contentHash ?? '',
        fileType: task.fileType,
        fileSize: fileExists(task.storedFilePath) ? getStoredFileSize(task.storedFilePath) : 0,
        originalFileName: task.originalFileName,
        referenceCount: 1,
        historicalReferenceCount: 1,
        userCount: task.version.dictionary.user ? 1 : 0,
        isUnreferenced: false,
        firstSeenAt: task.createdAt.toISOString(),
        lastReferencedAt: task.updatedAt.toISOString(),
      })
    }

    const rows = [...sharedRows, ...legacyRows].filter((row) => {
      if (unreferenced === 'true') return row.isUnreferenced
      if (unreferenced === 'false') return !row.isUnreferenced
      return true
    })
    rows.sort((left, right) => {
      const leftValue = sortBy === 'fileSize'
        ? left.fileSize
        : sortBy === 'fileType'
          ? left.fileType
          : sortBy === 'firstSeenAt'
            ? left.firstSeenAt
            : left.lastReferencedAt
      const rightValue = sortBy === 'fileSize'
        ? right.fileSize
        : sortBy === 'fileType'
          ? right.fileType
          : sortBy === 'firstSeenAt'
            ? right.firstSeenAt
            : right.lastReferencedAt

      if (leftValue === rightValue) return 0
      const comparison = leftValue > rightValue ? 1 : -1
      return sortOrder === 'asc' ? comparison : -comparison
    })
    const pagedRows = rows.slice(skip, skip + size)

    return {
      data: pagedRows,
      total: rows.length,
      page: pageNum,
      pageSize: size,
      totalPages: Math.ceil(rows.length / size),
    }
  })

  fastify.get('/admin/files/users', {
    preHandler: authGuard({ role: 'ADMIN' }),
  }, async () => {
    const users = await fastify.db.user.findMany({
      where: {
        OR: [
          {
            dictionaries: {
              some: {
                versions: {
                  some: {
                    fileReferences: { some: {} },
                  },
                },
              },
            },
          },
          {
            dictionaries: {
              some: {
                versions: {
                  some: {
                    parseTasks: {
                      some: { sharedFileAssetId: null },
                    },
                  },
                },
              },
            },
          },
        ],
      },
      select: {
        id: true,
        email: true,
      },
      orderBy: { email: 'asc' },
    })

    return { data: users }
  })

  fastify.get('/admin/files/stats', {
    preHandler: authGuard({ role: 'ADMIN' }),
  }, async (request) => {
    const { sortBy = 'totalSize', sortOrder = 'desc' } = request.query as {
      sortBy?: string
      sortOrder?: 'asc' | 'desc'
    }

    const users = await fastify.db.user.findMany({
      include: {
        dictionaries: {
          include: {
            versions: {
              include: {
                fileReferences: {
                  where: { isActive: true },
                  include: { sharedFileAsset: true },
                },
                parseTasks: {
                  where: { sharedFileAssetId: null },
                  orderBy: { createdAt: 'desc' },
                },
              },
            },
          },
        },
      },
    })

    const stats = users.map((user) => {
      const assets = new Map<string, number>()

      for (const dictionary of user.dictionaries) {
        for (const version of dictionary.versions) {
          for (const reference of version.fileReferences) {
            assets.set(reference.sharedFileAssetId, Number(reference.sharedFileAsset.fileSize))
          }
          const legacyTask = version.parseTasks[0]
          if (legacyTask) {
            assets.set(`legacy:${legacyTask.id}`, fileExists(legacyTask.storedFilePath) ? getStoredFileSize(legacyTask.storedFilePath) : 0)
          }
        }
      }

      return {
        userId: user.id,
        userEmail: user.email,
        fileCount: assets.size,
        totalSize: Array.from(assets.values()).reduce((sum, value) => sum + value, 0),
      }
    }).filter((item) => item.fileCount > 0)

    stats.sort((left, right) => {
      let comparison = 0
      switch (sortBy) {
        case 'userEmail':
          comparison = left.userEmail.localeCompare(right.userEmail)
          break
        case 'fileCount':
          comparison = left.fileCount - right.fileCount
          break
        case 'totalSize':
        default:
          comparison = left.totalSize - right.totalSize
          break
      }
      return sortOrder === 'asc' ? comparison : -comparison
    })

    return { data: stats }
  })

  // Admin "delete" detaches active version references; shared assets remain retained.
  fastify.delete('/admin/files', {
    preHandler: authGuard({ role: 'ADMIN' }),
  }, async (request) => {
    const { fileIds } = request.body as { fileIds: string[] }
    if (!Array.isArray(fileIds) || fileIds.length === 0) {
      throw badRequest('fileIds must be a non-empty array')
    }

    const detached = await fastify.db.versionFileReference.updateMany({
      where: {
        sharedFileAssetId: { in: fileIds },
        isActive: true,
      },
      data: {
        isActive: false,
        detachedAt: new Date(),
      },
    })

    return {
      deleted: detached.count,
      fileIds,
    }
  })

  fastify.get('/admin/files/:id/download', {
    preHandler: authGuard({ role: 'ADMIN' }),
  }, async (request, reply) => {
    const { id } = request.params as { id: string }

    if (id.startsWith('legacy:')) {
      const taskId = id.slice('legacy:'.length)
      const task = await fastify.db.parseTask.findUnique({
        where: { id: taskId },
      })

      if (!task) throw notFound('ParseTask', taskId)
      if (!fileExists(task.storedFilePath)) {
        throw notFound('StoredFile', task.storedFilePath)
      }

      reply.header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(task.originalFileName)}`)
      reply.header('Content-Type', 'application/octet-stream')
      return reply.send(getFileStream(task.storedFilePath))
    }

    const asset = await fastify.db.sharedFileAsset.findUnique({
      where: { id },
      include: {
        versionReferences: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    })

    if (!asset) throw notFound('SharedFileAsset', id)
    if (!fileExists(asset.storagePath)) {
      throw notFound('StoredFile', asset.storagePath)
    }

    const filename = asset.versionReferences[0]?.originalFileName ?? `${asset.contentHash}.${asset.originalExtension}`
    reply.header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`)
    reply.header('Content-Type', 'application/octet-stream')
    return reply.send(getFileStream(asset.storagePath))
  })
}

export default adminFileRoutes
