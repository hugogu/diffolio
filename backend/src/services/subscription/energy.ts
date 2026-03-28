import { PrismaClient } from '@prisma/client'
import { ApiError } from '../../lib/errors.js'

// ─── Parse & Comparison energy helpers ──────────────────────────────────────

const getParseEnergyCost = (fileType: string) => {
  const base = parseInt(process.env.PARSE_ENERGY_COST ?? '1000', 10)
  const pdfSurcharge = parseInt(process.env.SCANNED_PDF_ENERGY_COST ?? '5000', 10)
  return fileType === 'PDF' ? base + pdfSurcharge : base
}

const getCompareEnergyCost = () => parseInt(process.env.COMPARE_ENERGY_COST ?? '500', 10)

type TxClient = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]

async function atomicDeductBalance(tx: TxClient, userId: string, cost: number): Promise<boolean> {
  const updated = await tx.$executeRaw`
    UPDATE energy_balances
    SET
      monthly_remaining = GREATEST(0, monthly_remaining - LEAST(${cost}::int, monthly_remaining)),
      purchased_remaining = GREATEST(0, purchased_remaining - GREATEST(0, ${cost}::int - monthly_remaining)),
      lifetime_used = lifetime_used + ${cost}::int,
      updated_at = now()
    WHERE user_id = ${userId}
      AND (monthly_remaining + purchased_remaining) >= ${cost}::int
  `
  return updated > 0
}

/**
 * Charge energy for parsing a version. Idempotent: same versionId is never charged twice.
 * Only charges subscribers (ACTIVE subscription). Free-tier users are not charged.
 * On re-upload, call invalidateVersionParseCharge first to reset idempotency.
 */
export async function chargeVersionParseEnergy(
  prisma: PrismaClient,
  userId: string,
  versionId: string,
  fileType: string
): Promise<void> {
  const cost = getParseEnergyCost(fileType)
  if (cost <= 0) return

  await prisma.$transaction(async (tx) => {
    const sub = await tx.userSubscription.findUnique({ where: { userId } })
    if (!sub || sub.status !== 'ACTIVE') return // free tier: no parse charge

    // Idempotency: skip if already charged for this version
    const existing = await tx.energyEvent.findFirst({
      where: { userId, eventType: 'PARSE_DEDUCTION', referenceId: versionId },
    })
    if (existing) return

    const ok = await atomicDeductBalance(tx, userId, cost)
    if (!ok) {
      const balance = await tx.energyBalance.findUnique({ where: { userId } })
      const available = (balance?.monthlyRemaining ?? 0) + (balance?.purchasedRemaining ?? 0)
      throw new InsufficientEnergyError(cost, available)
    }

    await tx.energyEvent.create({
      data: {
        userId,
        eventType: 'PARSE_DEDUCTION',
        referenceId: versionId,
        description: `解析版本（${fileType}），扣除 ${cost} 点电量`,
        delta: -cost,
      },
    })
  })
}

/**
 * Remove the parse charge tracking for a version.
 * Call before re-uploading a new file to the same version so it can be charged again.
 * Does NOT refund the energy — the previous parse work was performed.
 */
export async function invalidateVersionParseCharge(
  prisma: PrismaClient,
  userId: string,
  versionId: string
): Promise<void> {
  await prisma.energyEvent.deleteMany({
    where: { userId, eventType: 'PARSE_DEDUCTION', referenceId: versionId },
  })
}

/**
 * Charge energy for running a comparison. Idempotent: same comparisonId is never charged twice.
 * Only charges subscribers (ACTIVE subscription).
 */
export async function chargeComparisonEnergy(
  prisma: PrismaClient,
  userId: string,
  comparisonId: string
): Promise<void> {
  const cost = getCompareEnergyCost()
  if (cost <= 0) return

  await prisma.$transaction(async (tx) => {
    const sub = await tx.userSubscription.findUnique({ where: { userId } })
    if (!sub || sub.status !== 'ACTIVE') return // free tier: no compare charge

    // Idempotency: skip if already charged for this comparison
    const existing = await tx.energyEvent.findFirst({
      where: { userId, eventType: 'COMPARE_DEDUCTION', referenceId: comparisonId },
    })
    if (existing) return

    const ok = await atomicDeductBalance(tx, userId, cost)
    if (!ok) {
      const balance = await tx.energyBalance.findUnique({ where: { userId } })
      const available = (balance?.monthlyRemaining ?? 0) + (balance?.purchasedRemaining ?? 0)
      throw new InsufficientEnergyError(cost, available)
    }

    await tx.energyEvent.create({
      data: {
        userId,
        eventType: 'COMPARE_DEDUCTION',
        referenceId: comparisonId,
        description: `运行对比任务，扣除 ${cost} 点电量`,
        delta: -cost,
      },
    })
  })
}

export class InsufficientEnergyError extends ApiError {
  constructor(
    public required: number,
    public available: number
  ) {
    super(
      402,
      'INSUFFICIENT_ENERGY',
      `电量不足，还差 ${required - available} 点，可购买快充包或等待下月刷新`
    )
    this.name = 'InsufficientEnergyError'
  }
}

export class SubscriptionRequiredError extends ApiError {
  constructor() {
    super(403, 'SUBSCRIPTION_REQUIRED', '需要有效订阅才能解锁新词条')
    this.name = 'SubscriptionRequiredError'
  }
}

export class FreeTierCapError extends ApiError {
  constructor() {
    super(402, 'FREE_TIER_CAP', '免费体验额度已用完，订阅后可继续解锁更多词条')
    this.name = 'FreeTierCapError'
  }
}

export class FreeTierSlotError extends ApiError {
  constructor() {
    super(402, 'FREE_TIER_SLOT', '体验栏位已满，订阅后可存放更多词典')
    this.name = 'FreeTierSlotError'
  }
}

interface DeductResult {
  unlocked: number
  alreadyUnlocked: number
  energyDeducted: number
  remainingBalance: number
}

const getFreeTierCap = () => parseInt(process.env.FREE_TIER_WORD_CAP ?? '100', 10)

// Postgres limit: 32767 bind variables per statement.
// createMany with N rows × 3 cols must stay under that → max ~10 000 rows per chunk.
const INSERT_CHUNK = 10_000

/**
 * Insert headwords in chunks to avoid the 32 767 bind-variable limit.
 * Uses skipDuplicates so re-inserting already-unlocked words is harmless.
 */
async function insertUnlocks(
  tx: Parameters<Parameters<PrismaClient['$transaction']>[0]>[0],
  userId: string,
  dictionaryId: string,
  headwords: string[]
): Promise<void> {
  for (let i = 0; i < headwords.length; i += INSERT_CHUNK) {
    await tx.wordUnlock.createMany({
      data: headwords.slice(i, i + INSERT_CHUNK).map((hw) => ({
        userId,
        dictionaryId,
        normalizedHeadword: hw,
      })),
      skipDuplicates: true,
    })
  }
}

/**
 * Atomically deducts energy and creates WordUnlock records.
 * Handles both free-tier (lifetime cap) and subscriber (two-pool) paths.
 */
export async function deductEnergy(
  prisma: PrismaClient,
  userId: string,
  headwords: string[],
  dictionaryId: string,
  overrideCost?: number
): Promise<DeductResult> {
  const FREE_TIER_CAP = getFreeTierCap()

  return prisma.$transaction(async (tx) => {
    const sub = await tx.userSubscription.findUnique({ where: { userId } })

    // GRACE/EXPIRED subscriptions cannot unlock new words
    if (sub && sub.status !== 'ACTIVE') {
      throw new SubscriptionRequiredError()
    }

    // Pre-count already-unlocked words.
    // For small batches use findMany IN (safe under 32 767 limit).
    // For large batches (e.g. "unlock all") use COUNT — every word in the
    // dictionary is in `headwords`, so COUNT gives the exact already-unlocked
    // figure without an IN clause. Deduplication at insert time is handled by
    // createMany skipDuplicates.
    let alreadyUnlockedCount: number
    let newHeadwords: string[]

    if (headwords.length <= 500) {
      const existing = await tx.wordUnlock.findMany({
        where: { userId, dictionaryId, normalizedHeadword: { in: headwords } },
        select: { normalizedHeadword: true },
      })
      alreadyUnlockedCount = existing.length
      const alreadySet = new Set(existing.map((e) => e.normalizedHeadword))
      newHeadwords = headwords.filter((h) => !alreadySet.has(h))
    } else {
      alreadyUnlockedCount = await tx.wordUnlock.count({ where: { userId, dictionaryId } })
      newHeadwords = headwords // insertUnlocks uses skipDuplicates for dedup
    }

    // Effective new-word count (what we charge energy for)
    const newCount = headwords.length <= 500
      ? newHeadwords.length
      : headwords.length - alreadyUnlockedCount

    // ─── Free-tier path (no active subscription) ────────────────────────────
    if (!sub) {
      const balance = await tx.energyBalance.findUnique({ where: { userId } })
      const lifetimeUsed = balance?.lifetimeUsed ?? 0

      if (lifetimeUsed >= FREE_TIER_CAP) throw new FreeTierCapError()

      const freeRemaining = FREE_TIER_CAP - lifetimeUsed
      newHeadwords = newHeadwords.slice(0, freeRemaining)
      const cost = newHeadwords.length

      if (cost === 0) {
        return {
          unlocked: 0,
          alreadyUnlocked: alreadyUnlockedCount,
          energyDeducted: 0,
          remainingBalance: freeRemaining,
        }
      }

      await insertUnlocks(tx, userId, dictionaryId, newHeadwords)

      await tx.energyBalance.upsert({
        where: { userId },
        create: { userId, lifetimeUsed: cost },
        update: { lifetimeUsed: { increment: cost } },
      })

      await tx.energyEvent.create({
        data: {
          userId,
          eventType: 'WORD_UNLOCK',
          description: `解锁 ${cost} 个词条（免费体验）`,
          delta: -cost,
        },
      })

      return {
        unlocked: cost,
        alreadyUnlocked: alreadyUnlockedCount,
        energyDeducted: 0,
        remainingBalance: Math.max(0, freeRemaining - cost),
      }
    }

    // ─── Subscriber path (ACTIVE subscription) ──────────────────────────────
    const cost = overrideCost ?? newCount

    if (cost === 0) {
      const balance = await tx.energyBalance.findUniqueOrThrow({ where: { userId } })
      return {
        unlocked: 0,
        alreadyUnlocked: alreadyUnlockedCount,
        energyDeducted: 0,
        remainingBalance: balance.monthlyRemaining + balance.purchasedRemaining,
      }
    }

    // Atomic two-pool deduction: monthly first, then purchased
    const updated = await tx.$executeRaw`
      UPDATE energy_balances
      SET
        monthly_remaining = GREATEST(0, monthly_remaining - LEAST(${cost}::int, monthly_remaining)),
        purchased_remaining = GREATEST(0, purchased_remaining - GREATEST(0, ${cost}::int - monthly_remaining)),
        lifetime_used = lifetime_used + ${cost}::int,
        updated_at = now()
      WHERE user_id = ${userId}
        AND (monthly_remaining + purchased_remaining) >= ${cost}::int
    `

    if (updated === 0) {
      const balance = await tx.energyBalance.findUnique({ where: { userId } })
      const available = (balance?.monthlyRemaining ?? 0) + (balance?.purchasedRemaining ?? 0)
      throw new InsufficientEnergyError(cost, available)
    }

    await insertUnlocks(tx, userId, dictionaryId, newHeadwords)

    await tx.energyEvent.create({
      data: {
        userId,
        eventType: overrideCost ? 'UPLOAD_DEDUCTION' : 'WORD_UNLOCK',
        description: overrideCost ? `扫描版PDF上传，预扣 ${cost} 点电量` : `解锁 ${cost} 个词条`,
        delta: -cost,
      },
    })

    const newBalance = await tx.energyBalance.findUniqueOrThrow({ where: { userId } })
    return {
      unlocked: cost,
      alreadyUnlocked: alreadyUnlockedCount,
      energyDeducted: cost,
      remainingBalance: newBalance.monthlyRemaining + newBalance.purchasedRemaining,
    }
  })
}
