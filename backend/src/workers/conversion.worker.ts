// workers/conversion.worker.ts

import { Worker } from 'bullmq'
import { PrismaClient } from '@prisma/client'
import IORedis from 'ioredis'
import { createLogger } from '../lib/logger.js'
import { ensureDefaultConvertersRegistered, registry } from '../services/converter/index.js'

const logger = createLogger({ name: 'conversion-worker' })
const prisma = new PrismaClient()

// Create redis connection (same pattern as other workers)
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'
const redis = new IORedis(REDIS_URL, { maxRetriesPerRequest: null })

ensureDefaultConvertersRegistered()

const worker = new Worker('conversion', async (job) => {
  const { taskId, inputPath, outputPath, inputFormat, outputFormat } = job.data

  logger.info({ taskId, inputFormat, outputFormat }, 'Starting conversion job')

  const converter = registry.get(inputFormat, outputFormat)
  if (!converter) {
    throw new Error(`No converter found for ${inputFormat} → ${outputFormat}`)
  }

  // Update status to RUNNING
  await prisma.conversionTask.update({
    where: { id: taskId },
    data: { status: 'RUNNING', updatedAt: new Date() }
  })

  try {
    await converter.convert({
      inputPath,
      outputPath,
      inputFormat,
      outputFormat,
      onProgress: async (progress) => {
        await job.updateProgress(progress)
        if (progress % 10 === 0) {
          await prisma.conversionTask.update({
            where: { id: taskId },
            data: { progress, updatedAt: new Date() }
          })
        }
      }
    })

    // Update status to COMPLETED
    const completedAt = new Date()
    const expiresAt = new Date(completedAt.getTime() + 7 * 24 * 60 * 60 * 1000) // 7 days

    await prisma.conversionTask.update({
      where: { id: taskId },
      data: {
        status: 'COMPLETED',
        progress: 100,
        outputFilePath: outputPath,
        completedAt,
        expiresAt,
        updatedAt: new Date()
      }
    })

    logger.info({ taskId }, 'Conversion job completed successfully')

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    await prisma.conversionTask.update({
      where: { id: taskId },
      data: {
        status: 'FAILED',
        errorMessage,
        updatedAt: new Date()
      }
    })

    logger.error({ taskId, error: errorMessage }, 'Conversion job failed')
    throw error
  }
}, {
  connection: redis,
  concurrency: 3 // Limit concurrent conversions
})

worker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'Job completed')
})

worker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, error: err.message }, 'Job failed')
})

logger.info('Conversion worker started')

export default worker
