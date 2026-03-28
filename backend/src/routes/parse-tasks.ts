import { FastifyPluginAsync } from 'fastify'
import { authGuard, getSessionUser } from '../lib/auth-guard.js'
import { notFound } from '../lib/errors.js'
import { paginate, decodeCursor } from '../lib/pagination.js'

const parseTaskRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/parse-tasks/:taskId
  fastify.get('/parse-tasks/:taskId', { preHandler: authGuard() }, async (request) => {
    const { taskId } = request.params as { taskId: string }
    const task = await fastify.db.parseTask.findUnique({
      where: { id: taskId },
      include: { _count: { select: { errors: true } } },
    })
    if (!task) throw notFound('ParseTask', taskId)
    return task
  })

  // DELETE /api/v1/parse-tasks/:taskId (cancel)
  fastify.delete('/parse-tasks/:taskId', { preHandler: authGuard() }, async (request, reply) => {
    const { taskId } = request.params as { taskId: string }
    const task = await fastify.db.parseTask.findUnique({ where: { id: taskId } })
    if (!task) throw notFound('ParseTask', taskId)

    // Cancel BullMQ job if running
    if (task.bullmqJobId) {
      const job = await fastify.parseQueue.getJob(task.bullmqJobId)
      if (job) {
        await job.remove()
      }
    }

    await fastify.db.parseTask.update({
      where: { id: taskId },
      data: { status: 'CANCELLED' },
    })

    reply.status(204).send()
  })

  // GET /api/v1/parse-tasks/:taskId/errors
  fastify.get('/parse-tasks/:taskId/errors', { preHandler: authGuard() }, async (request) => {
    const { taskId } = request.params as { taskId: string }
    const { cursor, limit = '20', status } = request.query as {
      cursor?: string
      limit?: string
      status?: string
    }

    const take = Math.min(parseInt(limit, 10), 100) + 1
    const where: Record<string, unknown> = { taskId }
    if (status) where.status = status
    if (cursor) where.id = { gt: decodeCursor(cursor) }

    const errors = await fastify.db.parseError.findMany({
      where,
      take,
      orderBy: { createdAt: 'asc' },
    })

    return paginate(errors, take - 1)
  })

  // PATCH /api/v1/parse-tasks/:taskId/errors/:errorId
  fastify.patch(
    '/parse-tasks/:taskId/errors/:errorId',
    { preHandler: authGuard() },
    async (request) => {
      const { errorId } = request.params as { taskId: string; errorId: string }
      const body = request.body as {
        action: 'correct' | 'dismiss' | 'commit'
        correctedText?: string
      }
      const sessionUser = getSessionUser(request)

      if (body.action === 'correct' && body.correctedText) {
        return fastify.db.parseError.update({
          where: { id: errorId },
          data: {
            status: 'CORRECTED',
            correctedText: body.correctedText,
            correctedBy: sessionUser?.id,
            correctedAt: new Date(),
          },
        })
      } else if (body.action === 'dismiss') {
        return fastify.db.parseError.update({
          where: { id: errorId },
          data: { status: 'DISMISSED' },
        })
      } else if (body.action === 'commit') {
        return fastify.db.parseError.update({
          where: { id: errorId },
          data: { status: 'COMMITTED' },
        })
      }
    }
  )

  // POST /api/v1/parse-tasks/:taskId/errors/:errorId/retry
  fastify.post(
    '/parse-tasks/:taskId/errors/:errorId/retry',
    { preHandler: authGuard() },
    async (request, reply) => {
      const { taskId, errorId } = request.params as { taskId: string; errorId: string }

      const error = await fastify.db.parseError.findUnique({ where: { id: errorId } })
      if (!error) throw notFound('ParseError', errorId)

      const task = await fastify.db.parseTask.findUnique({ where: { id: taskId } })
      if (!task) throw notFound('ParseTask', taskId)

      await fastify.parseQueue.add('parse', {
        taskId,
        versionId: task.versionId,
        filePath: task.storedFilePath,
        fileType: task.fileType,
        mode: 'retry-single',
        errorId,
      })

      await fastify.db.parseError.update({
        where: { id: errorId },
        data: { retriedAt: new Date() },
      })

      reply.status(202).send({ ok: true })
    }
  )
}

export default parseTaskRoutes
