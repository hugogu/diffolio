import { PrismaClient, SubscriptionTier } from '@prisma/client'

/**
 * Activate (or re-activate) a subscription for a user.
 * Creates/updates UserSubscription + resets monthly energy.
 * Creates EnergyBalance row if missing.
 */
export async function activateSubscription(
  prisma: PrismaClient,
  userId: string,
  tier: SubscriptionTier,
  expiresAt: Date
): Promise<void> {
  const plan = await prisma.subscriptionPlan.findUniqueOrThrow({ where: { tier } })

  await prisma.$transaction(async (tx) => {
    // Ensure energy balance row exists; credit monthly energy
    await tx.energyBalance.upsert({
      where: { userId },
      create: { userId, monthlyRemaining: plan.monthlyEnergyAlloc },
      update: { monthlyRemaining: plan.monthlyEnergyAlloc, frozenPurchasedRemaining: 0 },
    })

    // Create or update subscription (snapshot plan values for grandfathering)
    await tx.userSubscription.upsert({
      where: { userId },
      create: {
        userId,
        tier,
        status: 'ACTIVE',
        expiresAt,
        monthlyEnergyAlloc: plan.monthlyEnergyAlloc,
        slotCount: plan.slotCount,
      },
      update: {
        tier,
        status: 'ACTIVE',
        expiresAt,
        monthlyEnergyAlloc: plan.monthlyEnergyAlloc,
        slotCount: plan.slotCount,
        gracePeriodStartedAt: null,
      },
    })

    await tx.energyEvent.create({
      data: {
        userId,
        eventType: 'MONTHLY_RESET',
        description: `订阅激活 (${tier})，发放 ${plan.monthlyEnergyAlloc} 点电量`,
        delta: plan.monthlyEnergyAlloc,
      },
    })
  })
}

/**
 * Transition a subscription to GRACE state.
 * Freezes purchased energy (monthly is zeroed out).
 */
export async function transitionToGrace(prisma: PrismaClient, userId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const balance = await tx.energyBalance.findUnique({ where: { userId } })
    if (!balance) return

    await tx.energyBalance.update({
      where: { userId },
      data: {
        frozenPurchasedRemaining: balance.purchasedRemaining,
        purchasedRemaining: 0,
        monthlyRemaining: 0,
      },
    })

    await tx.userSubscription.update({
      where: { userId },
      data: { status: 'GRACE', gracePeriodStartedAt: new Date() },
    })
  })
}

/**
 * Renew a subscription: set ACTIVE, thaw frozen energy, issue new monthly alloc.
 */
export async function renewSubscription(
  prisma: PrismaClient,
  userId: string,
  tier: SubscriptionTier,
  expiresAt: Date
): Promise<void> {
  const plan = await prisma.subscriptionPlan.findUniqueOrThrow({ where: { tier } })

  await prisma.$transaction(async (tx) => {
    const balance = await tx.energyBalance.findUnique({ where: { userId } })
    const frozen = balance?.frozenPurchasedRemaining ?? 0

    await tx.energyBalance.update({
      where: { userId },
      data: {
        monthlyRemaining: plan.monthlyEnergyAlloc,
        purchasedRemaining: { increment: frozen },
        frozenPurchasedRemaining: 0,
      },
    })

    await tx.userSubscription.update({
      where: { userId },
      data: {
        tier,
        status: 'ACTIVE',
        expiresAt,
        monthlyEnergyAlloc: plan.monthlyEnergyAlloc,
        slotCount: plan.slotCount,
        gracePeriodStartedAt: null,
      },
    })

    const desc =
      frozen > 0
        ? `订阅续期 (${tier})，发放 ${plan.monthlyEnergyAlloc} 点电量，恢复 ${frozen} 点冻结电量`
        : `订阅续期 (${tier})，发放 ${plan.monthlyEnergyAlloc} 点电量`

    await tx.energyEvent.create({
      data: {
        userId,
        eventType: 'MONTHLY_RESET',
        description: desc,
        delta: plan.monthlyEnergyAlloc + frozen,
      },
    })
  })
}

/**
 * Credit purchased energy to a user (admin action).
 */
export async function creditEnergy(
  prisma: PrismaClient,
  userId: string,
  amount: number,
  adminNote: string
): Promise<void> {
  await prisma.$transaction([
    prisma.energyBalance.upsert({
      where: { userId },
      create: { userId, purchasedRemaining: amount },
      update: { purchasedRemaining: { increment: amount } },
    }),
    prisma.energyEvent.create({
      data: {
        userId,
        eventType: 'ADMIN_CREDIT',
        description: adminNote || `管理员充值 ${amount} 点电量`,
        delta: amount,
      },
    }),
  ])
}
