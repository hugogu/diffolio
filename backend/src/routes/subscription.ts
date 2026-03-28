import { FastifyPluginAsync } from 'fastify'
import { authGuard, requireSessionUser } from '../lib/auth-guard.js'
import { attachSubscriptionInfo } from '../lib/subscription-guard.js'

const subscriptionRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/subscription — current user's subscription state + energy balance
  fastify.get(
    '/subscription',
    { preHandler: authGuard() },
    async (request, reply) => {
      const user = requireSessionUser(request)
      await attachSubscriptionInfo(request, reply)

      const sub = await fastify.db.userSubscription.findUnique({ where: { userId: user.id } })
      const balance = await fastify.db.energyBalance.findUnique({ where: { userId: user.id } })

      const now = new Date()
      let effectiveStatus = 'NONE'
      let daysUntilExpiry: number | null = null
      if (sub) {
        if (sub.status === 'ACTIVE' && sub.expiresAt > now) {
          effectiveStatus = 'ACTIVE'
          daysUntilExpiry = Math.ceil((sub.expiresAt.getTime() - now.getTime()) / 86400000)
        } else if (sub.status === 'GRACE') {
          effectiveStatus = 'GRACE'
        } else {
          effectiveStatus = 'EXPIRED'
        }
      }

      return {
        hasSub: !!sub,
        effectiveStatus,
        subscription: sub
          ? {
              tier: sub.tier,
              status: sub.status,
              expiresAt: sub.expiresAt,
              monthlyEnergyAlloc: sub.monthlyEnergyAlloc,
              slotCount: sub.slotCount,
              gracePeriodStartedAt: sub.gracePeriodStartedAt,
            }
          : null,
        energyBalance: balance
          ? {
              monthlyRemaining: balance.monthlyRemaining,
              purchasedRemaining: balance.purchasedRemaining,
              frozenPurchasedRemaining: balance.frozenPurchasedRemaining,
              total: balance.monthlyRemaining + balance.purchasedRemaining,
              lifetimeUsed: balance.lifetimeUsed,
              lastMonthlyResetAt: balance.lastMonthlyResetAt,
            }
          : null,
        daysUntilExpiry,
        showRenewalReminder: daysUntilExpiry !== null && daysUntilExpiry <= 6,
      }
    }
  )

  // GET /api/v1/subscription/plans — active subscription plans (no auth required)
  fastify.get('/subscription/plans', async () => {
    const plans = await fastify.db.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: { priceYuan: 'asc' },
    })
    return {
      plans: plans.map((p) => ({
        tier: p.tier,
        monthlyEnergyAlloc: p.monthlyEnergyAlloc,
        slotCount: p.slotCount,
        priceYuan: Number(p.priceYuan),
        description: p.description,
      })),
    }
  })

  // GET /api/v1/subscription/payment-qr — active payment QR configs
  fastify.get('/subscription/payment-qr', async () => {
    const configs = await fastify.db.paymentQRConfig.findMany({
      where: { isActive: true },
    })
    return {
      channels: configs.map((c) => ({
        id: c.id,
        channel: c.channel,
        qrImagePath: c.qrImagePath,
        instructionText: c.instructionText,
      })),
    }
  })
}

export default subscriptionRoutes
