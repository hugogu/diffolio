import { FastifyPluginAsync } from 'fastify'
import fs from 'node:fs'
import { authGuard } from '../../lib/auth-guard.js'
import { notFound, badRequest } from '../../lib/errors.js'
import { deleteFile, getFileStream, fileExists } from '../../lib/storage.js'

const localPath = process.env.FILE_STORAGE_LOCAL_PATH ?? '/data/uploads'

const adminFileRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/admin/files
  fastify.get('/admin/files', { 
    preHandler: authGuard({ role: 'ADMIN' }),
  }, async (request) => {
    const { 
      page = '1', 
      pageSize = '20',
      userId,
      fileType,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = request.query as {
      page?: string
      pageSize?: string
      userId?: string
      fileType?: string
      search?: string
      sortBy?: string
      sortOrder?: string
    }

    const pageNum = Math.max(1, parseInt(page, 10))
    const size = Math.min(100, Math.max(1, parseInt(pageSize, 10)))
    const skip = (pageNum - 1) * size

    // Build where clause
    const where: Record<string, unknown> = {}
    if (userId) {
      where.version = { dictionary: { userId } }
    }
    if (fileType) where.fileType = fileType
    if (search) where.originalFileName = { contains: search, mode: 'insensitive' }

    // Get total count
    const total = await fastify.db.parseTask.count({ where })

    // Get tasks with relations
    const tasks = await fastify.db.parseTask.findMany({
      where,
      skip,
      take: size,
      orderBy: { [sortBy]: sortOrder },
      include: {
        version: {
          include: {
            dictionary: {
              include: {
                user: true,
              },
            },
          },
        },
      },
    })

    // Get file sizes from filesystem
    const files = await Promise.all(
      tasks.map(async (task) => {
        let fileSize = 0
        try {
          const stats = await fs.promises.stat(task.storedFilePath)
          fileSize = stats.size
        } catch {
          // File not found, size remains 0
        }

        return {
          id: task.id,
          originalFileName: task.originalFileName,
          userId: task.version.dictionary.user?.id ?? '',
          userEmail: task.version.dictionary.user?.email ?? 'Unknown',
          dictionaryName: task.version.dictionary.name,
          versionLabel: task.version.label,
          fileSize,
          fileType: task.fileType,
          createdAt: task.createdAt.toISOString(),
        }
      })
    )

    return {
      data: files,
      total,
      page: pageNum,
      pageSize: size,
      totalPages: Math.ceil(total / size),
    }
  })

  // GET /api/v1/admin/files/users
  fastify.get('/admin/files/users', { 
    preHandler: authGuard({ role: 'ADMIN' }),
  }, async () => {
    const users = await fastify.db.user.findMany({
      where: {
        dictionaries: {
          some: {
            versions: {
              some: {
                parseTasks: { some: {} },
              },
            },
          },
        },
      },
      select: {
        id: true,
        email: true,
      },
      orderBy: { email: 'asc' },
    })

    return { data: users }
  })

  // GET /api/v1/admin/files/stats
  fastify.get('/admin/files/stats', { 
    preHandler: authGuard({ role: 'ADMIN' }),
  }, async (request) => {
    const { sortBy = 'totalSize', sortOrder = 'desc' } = request.query as {
      sortBy?: string
      sortOrder?: string
    }

    // Get all users with their files
    const users = await fastify.db.user.findMany({
      include: {
        dictionaries: {
          include: {
            versions: {
              include: {
                parseTasks: true,
              },
            },
          },
        },
      },
    })

    // Calculate stats for each user
    const stats = await Promise.all(
      users.map(async (user) => {
        let fileCount = 0
        let totalSize = 0

        for (const dict of user.dictionaries) {
          for (const version of dict.versions) {
            for (const task of version.parseTasks) {
              fileCount++
              try {
                const stats = await fs.promises.stat(task.storedFilePath)
                totalSize += stats.size
              } catch {
                // File not found
              }
            }
          }
        }

        return {
          userId: user.id,
          userEmail: user.email,
          fileCount,
          totalSize,
        }
      })
    )

    // Filter out users with no files
    const filteredStats = stats.filter((s) => s.fileCount > 0)

    // Sort
    filteredStats.sort((a, b) => {
      let comparison = 0
      switch (sortBy) {
        case 'userEmail':
          comparison = a.userEmail.localeCompare(b.userEmail)
          break
        case 'fileCount':
          comparison = a.fileCount - b.fileCount
          break
        case 'totalSize':
        default:
          comparison = a.totalSize - b.totalSize
          break
      }
      return sortOrder === 'asc' ? comparison : -comparison
    })

    return { data: filteredStats }
  })

  // DELETE /api/v1/admin/files
  fastify.delete('/admin/files', { 
    preHandler: authGuard({ role: 'ADMIN' }),
  }, async (request) => {
    const { fileIds } = request.body as { fileIds: string[] }
    
    if (!Array.isArray(fileIds) || fileIds.length === 0) {
      throw badRequest('fileIds must be a non-empty array')
    }

    const tasks = await fastify.db.parseTask.findMany({
      where: { id: { in: fileIds } },
    })

    // Delete physical files
    for (const task of tasks) {
      deleteFile(task.storedFilePath)
    }

    // Delete database records
    await fastify.db.parseTask.deleteMany({
      where: { id: { in: fileIds } },
    })

    return { 
      deleted: tasks.length,
      fileIds: tasks.map((t) => t.id),
    }
  })

  // GET /api/v1/admin/files/:id/download
  fastify.get('/admin/files/:id/download', { 
    preHandler: authGuard({ role: 'ADMIN' }),
  }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const task = await fastify.db.parseTask.findUnique({
      where: { id },
    })

    if (!task) throw notFound('File', id)
    if (!fileExists(task.storedFilePath)) {
      throw notFound('StoredFile', task.storedFilePath)
    }

    const stream = getFileStream(task.storedFilePath)
    reply.header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(task.originalFileName)}`)
    reply.header('Content-Type', 'application/octet-stream')
    return reply.send(stream)
  })
}

export default adminFileRoutes
