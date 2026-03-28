import { FastifyPluginAsync } from 'fastify'
import { authGuard } from '../../lib/auth-guard.js'
import { notFound, badRequest } from '../../lib/errors.js'
import { SubscriptionTier } from '@prisma/client'

const adminSubscriptionPlansRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/admin/subscription-plans — all plans including inactive
  fastify.get(
    '/admin/subscription-plans',
    { preHandler: authGuard({ role: 'ADMIN' }) },
    async () => {
      const plans = await fastify.db.subscriptionPlan.findMany({
        orderBy: { priceYuan: 'asc' },
      })
      return {
        plans: plans.map((p) => ({
          tier: p.tier,
          monthlyEnergyAlloc: p.monthlyEnergyAlloc,
          slotCount: p.slotCount,
          priceYuan: Number(p.priceYuan),
          description: p.description,
          isActive: p.isActive,
          updatedAt: p.updatedAt,
        })),
      }
    }
  )

  // PATCH /api/v1/admin/subscription-plans/:tier
  // Updates plan config for NEW subscriptions only (grandfathering: existing UserSubscription rows unchanged)
  fastify.patch(
    '/admin/subscription-plans/:tier',
    { preHandler: authGuard({ role: 'ADMIN' }) },
    async (request) => {
      const { tier } = request.params as { tier: string }
      const validTiers: SubscriptionTier[] = ['BASIC', 'ADVANCED', 'PREMIUM', 'ELITE']
      if (!validTiers.includes(tier as SubscriptionTier)) {
        throw badRequest(`Invalid tier: ${tier}. Must be one of BASIC, ADVANCED, PREMIUM, ELITE`)
      }

      const plan = await fastify.db.subscriptionPlan.findUnique({ where: { tier: tier as SubscriptionTier } })
      if (!plan) throw notFound('SubscriptionPlan', tier)

      const body = request.body as {
        priceYuan?: number
        monthlyEnergyAlloc?: number
        slotCount?: number
        description?: string
        isActive?: boolean
      }

      const updated = await fastify.db.subscriptionPlan.update({
        where: { tier: tier as SubscriptionTier },
        data: {
          ...(body.priceYuan !== undefined && { priceYuan: body.priceYuan }),
          ...(body.monthlyEnergyAlloc !== undefined && { monthlyEnergyAlloc: body.monthlyEnergyAlloc }),
          ...(body.slotCount !== undefined && { slotCount: body.slotCount }),
          ...(body.description !== undefined && { description: body.description }),
          ...(body.isActive !== undefined && { isActive: body.isActive }),
        },
      })

      return {
        ...updated,
        priceYuan: Number(updated.priceYuan),
        note: '价格调整仅对新订阅生效，已有订阅不受影响',
      }
    }
  )
  // POST /api/v1/admin/subscription-plans — create a plan that doesn't exist yet (upsert)
  fastify.post(
    '/admin/subscription-plans',
    { preHandler: authGuard({ role: 'ADMIN' }) },
    async (request, reply) => {
      const body = request.body as {
        tier: string
        priceYuan: number
        monthlyEnergyAlloc: number
        slotCount: number
        description?: string
      }

      const validTiers: SubscriptionTier[] = ['BASIC', 'ADVANCED', 'PREMIUM', 'ELITE']
      if (!validTiers.includes(body.tier as SubscriptionTier)) {
        throw badRequest(`Invalid tier: ${body.tier}`)
      }
      if (body.priceYuan === undefined || body.monthlyEnergyAlloc === undefined || body.slotCount === undefined) {
        throw badRequest('priceYuan, monthlyEnergyAlloc and slotCount are required')
      }

      const plan = await fastify.db.subscriptionPlan.upsert({
        where: { tier: body.tier as SubscriptionTier },
        create: {
          tier: body.tier as SubscriptionTier,
          priceYuan: body.priceYuan,
          monthlyEnergyAlloc: body.monthlyEnergyAlloc,
          slotCount: body.slotCount,
          description: body.description ?? '',
          isActive: true,
        },
        update: {
          priceYuan: body.priceYuan,
          monthlyEnergyAlloc: body.monthlyEnergyAlloc,
          slotCount: body.slotCount,
          description: body.description ?? '',
        },
      })

      reply.status(201).send({ ...plan, priceYuan: Number(plan.priceYuan) })
    }
  )
}

export default adminSubscriptionPlansRoutes
