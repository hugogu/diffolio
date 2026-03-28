import { Worker, Queue, Job } from 'bullmq'
import IORedis from 'ioredis'
import { PrismaClient } from '@prisma/client'
import fs from 'fs/promises'
import { transitionToGrace } from '../services/subscription/lifecycle.js'
import logger from '../lib/worker-logger.js'
import { sendExpiryWarningEmail } from '../lib/email.js'

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'
const redis = new IORedis(REDIS_URL, { maxRetriesPerRequest: null })
const prisma = new PrismaClient()

export interface SubscriptionJobData {
  type: 'monthly-energy-reset' | 'daily-lifecycle-check'
}

const QUEUE_NAME = 'subscription'

async function processMonthlyEnergyReset(): Promise<void> {
  // Batch-update energy_balances for all ACTIVE subscriptions
  const batchSize = 500
  let offset = 0

  for (;;) {
    const activeSubs = await prisma.userSubscription.findMany({
      where: { status: 'ACTIVE', expiresAt: { gt: new Date() } },
      select: { userId: true, monthlyEnergyAlloc: true },
      skip: offset,
      take: batchSize,
    })
    if (activeSubs.length === 0) break

    for (const sub of activeSubs) {
      await prisma.$transaction([
        prisma.energyBalance.upsert({
          where: { userId: sub.userId },
          create: { userId: sub.userId, monthlyRemaining: sub.monthlyEnergyAlloc, lastMonthlyResetAt: new Date() },
          update: { monthlyRemaining: sub.monthlyEnergyAlloc, lastMonthlyResetAt: new Date() },
        }),
        prisma.energyEvent.create({
          data: {
            userId: sub.userId,
            eventType: 'MONTHLY_RESET',
            description: `月度电量重置，发放 ${sub.monthlyEnergyAlloc} 点电量`,
            delta: sub.monthlyEnergyAlloc,
          },
        }),
      ])
    }

    offset += activeSubs.length
    if (activeSubs.length < batchSize) break
  }

  logger.info({ count: offset }, 'Subscription: monthly energy reset completed')
}

async function processDailyLifecycleCheck(): Promise<void> {
  const now = new Date()

  // Transition expired ACTIVE subscriptions to GRACE
  const expired = await prisma.userSubscription.findMany({
    where: { status: 'ACTIVE', expiresAt: { lte: now } },
    select: { userId: true },
  })
  for (const sub of expired) {
    await transitionToGrace(prisma, sub.userId)
    logger.info({ userId: sub.userId }, 'Subscription: transitioned to GRACE')
  }

  // Mark GRACE subscriptions as EXPIRED after 30 days
  const graceExpired = await prisma.userSubscription.findMany({
    where: {
      status: 'GRACE',
      gracePeriodStartedAt: { lte: new Date(now.getTime() - 30 * 86400000) },
    },
    select: { userId: true },
  })
  for (const sub of graceExpired) {
    await prisma.userSubscription.update({
      where: { userId: sub.userId },
      data: { status: 'EXPIRED' },
    })
    logger.info({ userId: sub.userId }, 'Subscription: marked as EXPIRED')
  }

  // Send 80-day expiry warning emails to ACTIVE subs expiring in 7-8 days (not yet notified)
  const warnBefore = new Date(now.getTime() + 8 * 86400000)
  const warnAfter = new Date(now.getTime() + 6 * 86400000)
  const warningSubs = await prisma.userSubscription.findMany({
    where: {
      status: 'ACTIVE',
      expiresAt: { gte: warnAfter, lte: warnBefore },
      warningEmailSentAt: null,
    },
    include: { user: { select: { email: true } } },
  })
  for (const sub of warningSubs) {
    const daysLeft = Math.ceil((sub.expiresAt.getTime() - now.getTime()) / 86400000)
    try {
      await sendExpiryWarningEmail(sub.user.email, daysLeft, sub.expiresAt)
      await prisma.userSubscription.update({
        where: { userId: sub.userId },
        data: { warningEmailSentAt: now },
      })
      logger.info({ email: sub.user.email, daysLeft }, 'Subscription: expiry warning sent')
    } catch (err) {
      logger.error({ email: sub.user.email, err: err instanceof Error ? err.message : String(err) }, 'Subscription: failed to send expiry warning')
    }
  }

  // 90-day data cleanup: delete parse data + files for GRACE/EXPIRED subs expired 90+ days ago
  const cleanupBefore = new Date(now.getTime() - 90 * 86400000)
  const subsToCleanup = await prisma.userSubscription.findMany({
    where: {
      status: { in: ['GRACE', 'EXPIRED'] },
      expiresAt: { lte: cleanupBefore },
    },
    select: { userId: true },
  })
  for (const sub of subsToCleanup) {
    const dicts = await prisma.dictionary.findMany({
      where: { userId: sub.userId, deletedAt: null },
      include: {
        versions: {
          include: { parseTasks: { select: { storedFilePath: true } } },
        },
      },
    })
    for (const dict of dicts) {
      for (const version of dict.versions) {
        // Delete stored files from parseTasks
        for (const task of version.parseTasks) {
          if (task.storedFilePath) {
            await fs.rm(task.storedFilePath, { force: true })
          }
        }
        // Delete Entry (cascades to Sense, Example, EntryAlignment via DB)
        await prisma.entry.deleteMany({ where: { versionId: version.id } })
      }
      // Soft-delete dictionary
      await prisma.dictionary.update({ where: { id: dict.id }, data: { deletedAt: now } })
    }
    logger.info({ userId: sub.userId, dicts: dicts.length }, 'Subscription: 90-day cleanup soft-deleted dicts')
  }

  // 7-day free-tier cleanup: delete files + parse data for REGULAR users with old versions
  const freeTierCutoff = new Date(now.getTime() - 7 * 86400000)
  const oldFreeTierVersions = await prisma.dictionaryVersion.findMany({
    where: {
      createdAt: { lte: freeTierCutoff },
      dictionary: {
        user: { role: 'REGULAR' },
        deletedAt: null,
      },
    },
    include: {
      dictionary: { select: { userId: true } },
      parseTasks: { select: { storedFilePath: true } },
    },
  })
  for (const version of oldFreeTierVersions) {
    for (const task of version.parseTasks) {
      if (task.storedFilePath) {
        await fs.rm(task.storedFilePath, { force: true })
      }
    }
    await prisma.entry.deleteMany({ where: { versionId: version.id } })
    logger.info({ versionId: version.id }, 'Subscription: free-tier cleanup deleted version data')
  }

  // Hard-delete soft-deleted dictionaries older than 7 days
  const hardDeleteCutoff = new Date(now.getTime() - 7 * 86400000)
  const softDeleted = await prisma.dictionary.findMany({
    where: { deletedAt: { lte: hardDeleteCutoff } },
    include: {
      versions: { include: { parseTasks: { select: { storedFilePath: true } } } },
    },
  })
  for (const dict of softDeleted) {
    for (const version of dict.versions) {
      for (const task of version.parseTasks) {
        if (task.storedFilePath) await fs.rm(task.storedFilePath, { force: true })
      }
      await prisma.entry.deleteMany({ where: { versionId: version.id } })
    }
    await prisma.dictionary.delete({ where: { id: dict.id } })
    logger.info({ dictId: dict.id }, 'Subscription: hard-deleted dictionary')
  }

  logger.info({
    toGrace: expired.length,
    toExpired: graceExpired.length,
    warningEmails: warningSubs.length,
    cleanups90d: subsToCleanup.length,
    freeTierCleanups: oldFreeTierVersions.length,
    hardDeletes: softDeleted.length,
  }, 'Subscription: daily lifecycle check completed')
}

const worker = new Worker<SubscriptionJobData>(
  QUEUE_NAME,
  async (job: Job<SubscriptionJobData>) => {
    if (job.data.type === 'monthly-energy-reset') {
      await processMonthlyEnergyReset()
    } else if (job.data.type === 'daily-lifecycle-check') {
      await processDailyLifecycleCheck()
    }
  },
  { connection: redis, concurrency: 1 }
)

worker.on('completed', (job) => {
  logger.info({ jobId: job.id, type: job.data.type }, 'Subscription job completed')
})

worker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, 'Subscription job failed')
})

// Register repeatable cron jobs idempotently at startup
const subscriptionQueue = new Queue<SubscriptionJobData>(QUEUE_NAME, { connection: redis })

subscriptionQueue
  .add(
    'monthly-energy-reset',
    { type: 'monthly-energy-reset' },
    {
      repeat: { pattern: '0 0 1 * *' }, // 1st of every month at 00:00 UTC
      removeOnComplete: { age: 3600 },
      removeOnFail: { count: 5 },
    }
  )
  .catch((err) => logger.error({ err: err instanceof Error ? err.message : String(err) }, 'Subscription: failed to register monthly-energy-reset'))

subscriptionQueue
  .add(
    'daily-lifecycle-check',
    { type: 'daily-lifecycle-check' },
    {
      repeat: { pattern: '0 2 * * *' }, // daily at 02:00 UTC
      removeOnComplete: { age: 3600 },
      removeOnFail: { count: 5 },
    }
  )
  .catch((err) => logger.error({ err: err instanceof Error ? err.message : String(err) }, 'Subscription: failed to register daily-lifecycle-check'))

export default worker
