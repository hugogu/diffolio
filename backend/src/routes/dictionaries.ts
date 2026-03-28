import { FastifyPluginAsync } from 'fastify'
import { authGuard, requireSessionUser } from '../lib/auth-guard.js'
import { assertDictionaryOwner } from '../lib/ownership.js'
import { paginate } from '../lib/pagination.js'
import { notFound, paymentRequired, extractRootCause } from '../lib/errors.js'

const dictionaryRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/dictionaries — scoped to session user
  fastify.get('/dictionaries', { preHandler: authGuard() }, async (request) => {
    try {
      const user = requireSessionUser(request)
      const { cursor, limit = '20' } = request.query as { cursor?: string; limit?: string }
      const take = Math.min(parseInt(limit, 10), 100) + 1

      const where: Record<string, unknown> = { userId: user.id, deletedAt: null }
      if (cursor) where.id = { gt: decodeCursor(cursor) }

      const dictionaries = await fastify.db.dictionary.findMany({
        where,
        take,
        orderBy: { createdAt: 'asc' },
        include: { _count: { select: { versions: true } } },
      })

      const result = paginate(dictionaries as (typeof dictionaries[0] & { id: string })[], take - 1)
      return {
        ...result,
        items: result.items.map((d) => ({
          id: d.id,
          name: d.name,
          publisher: d.publisher,
          language: d.language,
          encodingScheme: d.encodingScheme,
          description: d.description,
          createdAt: d.createdAt,
          updatedAt: d.updatedAt,
          versionCount: d._count.versions,
        })),
      }
    } catch (error) {
      throw error
    }
  })

  // POST /api/v1/dictionaries
  fastify.post('/dictionaries', { preHandler: authGuard() }, async (request, reply) => {
    try {
      const user = requireSessionUser(request)

      // Check subscription slot limit (replaces generic maxBooks check)
      const sub = await fastify.db.userSubscription.findUnique({ where: { userId: user.id } })
      const dictCount = await fastify.db.dictionary.count({ where: { userId: user.id, deletedAt: null } })

      if (!sub || sub.status !== 'ACTIVE') {
        // Free-tier: 1 slot
        if (dictCount >= 1) {
          throw paymentRequired('FREE_TIER_SLOT', '体验栏位已满，订阅后可存放更多词典')
        }
      } else {
        // Subscriber: slot count from subscription
        if (dictCount >= sub.slotCount) {
          throw paymentRequired('SLOT_LIMIT_REACHED', `书籍栏位已满（${sub.slotCount} 个），请升级订阅以获取更多栏位`)
        }
      }
      const body = request.body as {
        name: string
        publisher?: string
        language?: string
        encodingScheme?: string
        description?: string
      }

      const dictionary = await fastify.db.dictionary.create({
        data: {
          name: body.name,
          publisher: body.publisher ?? '',
          language: body.language ?? 'zh',
          encodingScheme: body.encodingScheme ?? 'Unicode',
          description: body.description,
          userId: user.id,
        },
      })

      reply.status(201).send(dictionary)
    } catch (error) {
      throw error
    }
  })

  // GET /api/v1/dictionaries/:id
  fastify.get('/dictionaries/:id', { preHandler: authGuard() }, async (request) => {
    try {
      const user = requireSessionUser(request)
      const { id } = request.params as { id: string }
      await assertDictionaryOwner(fastify.db, id, user.id)

      const dictionary = await fastify.db.dictionary.findUnique({
        where: { id },
        include: {
          versions: {
            orderBy: { publishedYear: 'asc' },
            include: {
              formatConfig: { select: { validationStatus: true } },
              _count: { select: { entries: true } },
              parseTasks: { where: { status: 'COMPLETED' }, select: { id: true }, take: 1 },
            },
          },
        },
      })

      if (!dictionary) throw notFound('Dictionary', id)

      return {
        ...dictionary,
        versions: dictionary.versions.map((v) => ({
          ...v,
          entryCount: v.parseTasks.length > 0 ? v._count.entries : null,
          _count: undefined,
          parseTasks: undefined,
        })),
      }
    } catch (error) {
      throw error
    }
  })

  // PATCH /api/v1/dictionaries/:id
  fastify.patch('/dictionaries/:id', { preHandler: authGuard() }, async (request) => {
    try {
      const user = requireSessionUser(request)
      const { id } = request.params as { id: string }
      await assertDictionaryOwner(fastify.db, id, user.id)

      const body = request.body as Partial<{
        name: string
        publisher: string
        language: string
        encodingScheme: string
        description: string
      }>

      const dictionary = await fastify.db.dictionary.update({
        where: { id },
        data: body,
      })

      return dictionary
    } catch (error) {
      throw error
    }
  })
}

export default dictionaryRoutes

function decodeCursor(cursor: string): string {
  try {
    return Buffer.from(cursor, 'base64').toString('utf-8')
  } catch {
    return cursor
  }
}
