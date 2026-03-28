import { FastifyPluginAsync } from 'fastify'
import { authGuard, requireSessionUser } from '../lib/auth-guard.js'
import { notFound, badRequest, paymentRequired, extractRootCause } from '../lib/errors.js'
import { paginate } from '../lib/pagination.js'
import { deductEnergy, InsufficientEnergyError, SubscriptionRequiredError, FreeTierCapError } from '../services/subscription/energy.js'

const energyRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/energy — current user's energy balance
  fastify.get('/energy', { preHandler: authGuard() }, async (request) => {
    try {
      const user = requireSessionUser(request)
      const balance = await fastify.db.energyBalance.findUnique({ where: { userId: user.id } })
      if (!balance) {
        return {
          monthlyRemaining: 0,
          purchasedRemaining: 0,
          frozenPurchasedRemaining: 0,
          total: 0,
          lifetimeUsed: 0,
          lastMonthlyResetAt: null,
        }
      }
      return {
        monthlyRemaining: balance.monthlyRemaining,
        purchasedRemaining: balance.purchasedRemaining,
        frozenPurchasedRemaining: balance.frozenPurchasedRemaining,
        total: balance.monthlyRemaining + balance.purchasedRemaining,
        lifetimeUsed: balance.lifetimeUsed,
        lastMonthlyResetAt: balance.lastMonthlyResetAt,
      }
    } catch (error) {
      throw error
    }
  })

  // GET /api/v1/energy/events — paginated energy audit log
  fastify.get('/energy/events', { preHandler: authGuard() }, async (request) => {
    try {
      const user = requireSessionUser(request)
      const { from, to, page = '1', pageSize = '50' } = request.query as {
        from?: string
        to?: string
        page?: string
        pageSize?: string
      }

      const pageNum = Math.max(1, parseInt(page, 10))
      const size = Math.min(200, Math.max(1, parseInt(pageSize, 10)))
      const skip = (pageNum - 1) * size

      const where: Record<string, unknown> = { userId: user.id }
      if (from || to) {
        const createdAt: Record<string, Date> = {}
        if (from) createdAt.gte = new Date(from)
        if (to) {
          const toDate = new Date(to)
          toDate.setHours(23, 59, 59, 999)
          createdAt.lte = toDate
        }
        where.createdAt = createdAt
      }

      const [total, events] = await Promise.all([
        fastify.db.energyEvent.count({ where }),
        fastify.db.energyEvent.findMany({
          where,
          skip,
          take: size,
          orderBy: { createdAt: 'desc' },
        }),
      ])

      return { data: events, total, page: pageNum, totalPages: Math.ceil(total / size) }
    } catch (error) {
      throw error
    }
  })

  // GET /api/v1/dictionaries/:dictionaryId/words/:headword/unlock-state
  fastify.get(
    '/dictionaries/:dictionaryId/words/:headword/unlock-state',
    { preHandler: authGuard() },
    async (request) => {
      try {
        const user = requireSessionUser(request)
        const { dictionaryId, headword } = request.params as { dictionaryId: string; headword: string }
        const normalizedHeadword = decodeURIComponent(headword)

        const unlock = await fastify.db.wordUnlock.findUnique({
          where: {
            userId_dictionaryId_normalizedHeadword: { userId: user.id, dictionaryId, normalizedHeadword },
          },
        })

        return { unlocked: !!unlock, unlockedAt: unlock?.unlockedAt ?? null }
      } catch (error) {
        throw error
      }
    }
  )

  // GET /api/v1/dictionaries/:dictionaryId/unlock-stats
  // Returns total distinct headwords and how many the current user has already unlocked
  fastify.get(
    '/dictionaries/:dictionaryId/unlock-stats',
    { preHandler: authGuard() },
    async (request) => {
      try {
        const user = requireSessionUser(request)
        const { dictionaryId } = request.params as { dictionaryId: string }

        const dictionary = await fastify.db.dictionary.findUnique({ where: { id: dictionaryId } })
        if (!dictionary || dictionary.userId !== user.id) throw notFound('Dictionary', dictionaryId)

        const [totalHeadwords, unlockedCount] = await Promise.all([
          fastify.db.entry.findMany({
            where: { version: { dictionaryId } },
            select: { normalizedHeadword: true },
            distinct: ['normalizedHeadword'],
          }).then((rows) => rows.length),
          fastify.db.wordUnlock.count({ where: { userId: user.id, dictionaryId } }),
        ])

        return { totalHeadwords, unlockedCount, lockedCount: totalHeadwords - unlockedCount }
      } catch (error) {
        throw error
      }
    }
  )

  // POST /api/v1/dictionaries/:dictionaryId/unlock
  fastify.post(
    '/dictionaries/:dictionaryId/unlock',
    { preHandler: authGuard() },
    async (request, reply) => {
      try {
        const user = requireSessionUser(request)
        const { dictionaryId } = request.params as { dictionaryId: string }

        // Verify dictionary exists and user owns it
        const dictionary = await fastify.db.dictionary.findUnique({ where: { id: dictionaryId } })
        if (!dictionary) throw notFound('Dictionary', dictionaryId)
        if (dictionary.userId !== user.id) throw notFound('Dictionary', dictionaryId)

        const body = request.body as { headwords?: string[]; all?: boolean }

        let headwords: string[]
        if (body.all === true) {
          // Fetch all distinct normalizedHeadwords across all versions of this dictionary
          const entries = await fastify.db.entry.findMany({
            where: { version: { dictionaryId } },
            select: { normalizedHeadword: true },
            distinct: ['normalizedHeadword'],
          })
          headwords = entries.map((e) => e.normalizedHeadword)
        } else if (Array.isArray(body.headwords) && body.headwords.length > 0) {
          if (body.headwords.length > 1000) throw badRequest('Maximum 1000 headwords per request')
          headwords = body.headwords
        } else {
          throw badRequest('Provide either headwords array or all: true')
        }

        try {
          const result = await deductEnergy(fastify.db, user.id, headwords, dictionaryId)
          return result
        } catch (err) {
          if (err instanceof InsufficientEnergyError) {
            throw paymentRequired('INSUFFICIENT_ENERGY', err.message, extractRootCause(err))
          }
          if (err instanceof FreeTierCapError) {
            throw paymentRequired('FREE_TIER_CAP', err.message, extractRootCause(err))
          }
          if (err instanceof SubscriptionRequiredError) {
            throw paymentRequired('SUBSCRIPTION_REQUIRED', err.message, extractRootCause(err))
          }
          throw err
        }
      } catch (error) {
        throw error
      }
    }
  )
}

export default energyRoutes
