import { FastifyRequest, FastifyReply } from 'fastify'
import { ApiError } from './errors.js'
import { requireSessionUser, SessionUser } from './auth-guard.js'
import { PrismaClient } from '@prisma/client'

export type EffectiveSubscriptionStatus = 'NONE' | 'ACTIVE' | 'GRACE' | 'EXPIRED'

export interface AttachedEnergyBalance {
  monthlyRemaining: number
  purchasedRemaining: number
  total: number
  isFrozen: boolean
}

declare module 'fastify' {
  interface FastifyRequest {
    subscriptionStatus: EffectiveSubscriptionStatus
    attachedEnergyBalance: AttachedEnergyBalance | null
  }
}

function computeStatus(
  sub: { status: string; expiresAt: Date } | null,
  now: Date
): EffectiveSubscriptionStatus {
  if (!sub) return 'NONE'
  if (sub.status === 'ACTIVE' && sub.expiresAt > now) return 'ACTIVE'
  if (sub.status === 'GRACE') return 'GRACE'
  return 'EXPIRED'
}

export async function attachSubscriptionInfo(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  const user = request.user as SessionUser | undefined
  if (!user) {
    request.subscriptionStatus = 'NONE'
    request.attachedEnergyBalance = null
    return
  }

  const db = (request.server as unknown as { db: PrismaClient }).db
  const [sub, balance] = await Promise.all([
    db.userSubscription.findUnique({ where: { userId: user.id } }),
    db.energyBalance.findUnique({ where: { userId: user.id } }),
  ])

  request.subscriptionStatus = computeStatus(sub, new Date())
  request.attachedEnergyBalance = balance
    ? {
        monthlyRemaining: balance.monthlyRemaining,
        purchasedRemaining: balance.purchasedRemaining,
        total: balance.monthlyRemaining + balance.purchasedRemaining,
        isFrozen: balance.frozenPurchasedRemaining > 0,
      }
    : null
}

/** Requires ACTIVE subscription; attaches subscription info to request. */
export function requireActiveSubscription() {
  return async function (request: FastifyRequest, reply: FastifyReply): Promise<void> {
    requireSessionUser(request)
    await attachSubscriptionInfo(request, reply)
    if (request.subscriptionStatus === 'GRACE') {
      throw new ApiError(403, 'SUBSCRIPTION_GRACE', '订阅已到期，已解锁内容仍可查看，续杯后即可继续解锁新词条')
    }
    if (request.subscriptionStatus !== 'ACTIVE') {
      throw new ApiError(403, 'SUBSCRIPTION_REQUIRED', '需要有效订阅才能使用此功能')
    }
  }
}

/** Allows ACTIVE or GRACE (read-only mode); attaches subscription info. */
export function allowGraceRead() {
  return async function (request: FastifyRequest, reply: FastifyReply): Promise<void> {
    requireSessionUser(request)
    await attachSubscriptionInfo(request, reply)
    if (request.subscriptionStatus === 'NONE' || request.subscriptionStatus === 'EXPIRED') {
      throw new ApiError(403, 'SUBSCRIPTION_REQUIRED', '需要有效订阅才能访问此内容')
    }
  }
}
