import { FastifyPluginAsync } from 'fastify'
import { authGuard } from '../../lib/auth-guard.js'
import { notFound, badRequest, ApiError } from '../../lib/errors.js'
import { activateSubscription, renewSubscription, creditEnergy } from '../../services/subscription/lifecycle.js'
import { SubscriptionTier } from '@prisma/client'

const adminSubscriptionManageRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/admin/users/:userId/subscription
  fastify.get(
    '/admin/users/:userId/subscription',
    { preHandler: authGuard({ role: 'ADMIN' }) },
    async (request) => {
      const { userId } = request.params as { userId: string }
      const user = await fastify.db.user.findUnique({ where: { id: userId } })
      if (!user) throw notFound('User', userId)

      const [sub, balance] = await Promise.all([
        fastify.db.userSubscription.findUnique({ where: { userId } }),
        fastify.db.energyBalance.findUnique({ where: { userId } }),
      ])

      return {
        user: { id: user.id, email: user.email },
        subscription: sub,
        energyBalance: balance,
      }
    }
  )

  // PATCH /api/v1/admin/users/:userId/subscription
  fastify.patch(
    '/admin/users/:userId/subscription',
    { preHandler: authGuard({ role: 'ADMIN' }) },
    async (request) => {
      const { userId } = request.params as { userId: string }
      const body = request.body as {
        tier?: string
        expiresAt?: string
        status?: string
      }

      const user = await fastify.db.user.findUnique({ where: { id: userId } })
      if (!user) throw notFound('User', userId)

      if (!body.tier || !body.expiresAt) {
        throw badRequest('tier and expiresAt are required')
      }

      const tier = body.tier as SubscriptionTier
      const expiresAt = new Date(body.expiresAt)
      if (isNaN(expiresAt.getTime())) throw badRequest('Invalid expiresAt date')

      // Check for slot downgrade conflict
      const existingSub = await fastify.db.userSubscription.findUnique({ where: { userId } })
      const plan = await fastify.db.subscriptionPlan.findUnique({ where: { tier } })
      if (!plan) throw notFound('SubscriptionPlan', tier)

      if (existingSub && plan.slotCount < existingSub.slotCount) {
        const dictCount = await fastify.db.dictionary.count({ where: { userId, deletedAt: null } })
        if (dictCount > plan.slotCount) {
          const dicts = await fastify.db.dictionary.findMany({
            where: { userId, deletedAt: null },
            select: { id: true, name: true, lastAccessedAt: true },
            orderBy: { lastAccessedAt: { sort: 'desc', nulls: 'last' } },
          })
          // Return 409 with dictionary list so frontend can show downgrade picker
          throw new ApiError(
            409,
            'SLOT_DOWNGRADE_CONFLICT',
            `降级方案需要先选择保留 ${plan.slotCount} 本词典（当前 ${dictCount} 本，新方案 ${plan.slotCount} 个栏位）`,
            { dicts, newSlotCount: plan.slotCount, currentDictCount: dictCount }
          )
        }
      }

      // Activate or renew
      if (!existingSub) {
        await activateSubscription(fastify.db, userId, tier, expiresAt)
      } else {
        await renewSubscription(fastify.db, userId, tier, expiresAt)
      }

      const [updatedSub, updatedBalance] = await Promise.all([
        fastify.db.userSubscription.findUnique({ where: { userId } }),
        fastify.db.energyBalance.findUnique({ where: { userId } }),
      ])

      return {
        user: { id: user.id, email: user.email },
        subscription: updatedSub,
        energyBalance: updatedBalance,
      }
    }
  )

  // DELETE /api/v1/admin/users/:userId/subscription — cancel subscription (reverts user to free tier)
  fastify.delete(
    '/admin/users/:userId/subscription',
    { preHandler: authGuard({ role: 'ADMIN' }) },
    async (request) => {
      const { userId } = request.params as { userId: string }

      const user = await fastify.db.user.findUnique({ where: { id: userId } })
      if (!user) throw notFound('User', userId)

      await fastify.db.userSubscription.deleteMany({ where: { userId } })

      // Freeze any purchased energy (set monthlyRemaining to 0, move purchased to frozen)
      const balance = await fastify.db.energyBalance.findUnique({ where: { userId } })
      if (balance) {
        await fastify.db.energyBalance.update({
          where: { userId },
          data: {
            monthlyRemaining: 0,
            frozenPurchasedRemaining: { increment: balance.purchasedRemaining },
            purchasedRemaining: 0,
          },
        })
      }

      return { userId, cancelled: true }
    }
  )

  // POST /api/v1/admin/users/:userId/subscription/slot-downgrade
  fastify.post(
    '/admin/users/:userId/subscription/slot-downgrade',
    { preHandler: authGuard({ role: 'ADMIN' }) },
    async (request) => {
      const { userId } = request.params as { userId: string }
      const body = request.body as { keepDictionaryIds: string[]; newSlotCount: number; tier: string; expiresAt: string }

      const user = await fastify.db.user.findUnique({ where: { id: userId } })
      if (!user) throw notFound('User', userId)

      if (!Array.isArray(body.keepDictionaryIds) || !body.newSlotCount) {
        throw badRequest('keepDictionaryIds array and newSlotCount are required')
      }
      if (body.keepDictionaryIds.length > body.newSlotCount) {
        throw badRequest(`keepDictionaryIds.length must equal newSlotCount (${body.newSlotCount})`)
      }

      const now = new Date()
      // Soft-delete all dictionaries NOT in keepDictionaryIds
      await fastify.db.dictionary.updateMany({
        where: { userId, deletedAt: null, id: { notIn: body.keepDictionaryIds } },
        data: { deletedAt: now },
      })

      // Proceed with subscription update
      const tier = body.tier as SubscriptionTier
      const expiresAt = new Date(body.expiresAt)
      if (isNaN(expiresAt.getTime())) throw badRequest('Invalid expiresAt')

      const existingSub = await fastify.db.userSubscription.findUnique({ where: { userId } })
      if (!existingSub) {
        await activateSubscription(fastify.db, userId, tier, expiresAt)
      } else {
        await renewSubscription(fastify.db, userId, tier, expiresAt)
      }

      const [updatedSub, updatedBalance] = await Promise.all([
        fastify.db.userSubscription.findUnique({ where: { userId } }),
        fastify.db.energyBalance.findUnique({ where: { userId } }),
      ])

      return { user: { id: user.id, email: user.email }, subscription: updatedSub, energyBalance: updatedBalance }
    }
  )

  // POST /api/v1/admin/users/:userId/energy/credit
  fastify.post(
    '/admin/users/:userId/energy/credit',
    { preHandler: authGuard({ role: 'ADMIN' }) },
    async (request) => {
      const { userId } = request.params as { userId: string }
      const body = request.body as { amount?: number; note?: string }

      const user = await fastify.db.user.findUnique({ where: { id: userId } })
      if (!user) throw notFound('User', userId)

      const amount = Number(body.amount)
      if (!amount || amount <= 0 || !Number.isInteger(amount)) {
        throw badRequest('amount must be a positive integer')
      }

      await creditEnergy(
        fastify.db,
        userId,
        amount,
        body.note || `管理员充值 ${amount} 点电量`
      )

      const balance = await fastify.db.energyBalance.findUnique({ where: { userId } })
      return { userId, credited: amount, energyBalance: balance }
    }
  )
  // GET /api/v1/admin/users/:userId/energy/events
  fastify.get(
    '/admin/users/:userId/energy/events',
    { preHandler: authGuard({ role: 'ADMIN' }) },
    async (request) => {
      const { userId } = request.params as { userId: string }
      const { from, to, page = '1', pageSize = '50' } = request.query as {
        from?: string; to?: string; page?: string; pageSize?: string
      }

      const user = await fastify.db.user.findUnique({ where: { id: userId } })
      if (!user) throw notFound('User', userId)

      const pageNum = Math.max(1, parseInt(page, 10))
      const size = Math.min(200, Math.max(1, parseInt(pageSize, 10)))
      const skip = (pageNum - 1) * size

      const where: Record<string, unknown> = { userId }
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
        fastify.db.energyEvent.findMany({ where, skip, take: size, orderBy: { createdAt: 'desc' } }),
      ])

      return { data: events, total, page: pageNum, totalPages: Math.ceil(total / size) }
    }
  )
}

export default adminSubscriptionManageRoutes
