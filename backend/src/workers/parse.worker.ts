import { Worker, Job } from 'bullmq'
import IORedis from 'ioredis'
import { PrismaClient } from '@prisma/client'
import { ParseJobData } from '../plugins/bullmq.js'
import { compileConfig } from '../services/config-engine.js'
import { createParserFingerprint } from '../services/parse-artifacts/fingerprint.js'
import { findSharedParseArtifactByKey } from '../services/parse-artifacts/query.js'
import {
  appendArtifactEntries,
  bindParseArtifactToVersion,
  ensureSharedParseArtifact,
  materializeParseArtifactToVersion,
  replaceArtifactEntryTree,
} from '../services/parse-artifacts/persistence.js'
import { ensureVersionConfigLinks } from '../services/configs/bootstrap.js'
import { ensureTaskSharedFileAsset } from '../services/uploads/shared-file-assets.js'
import { parseTxt } from '../services/parser/txt.parser.js'
import { parseDoc } from '../services/parser/doc.parser.js'
import { parseDocx } from '../services/parser/docx.parser.js'
import { parsePdf } from '../services/parser/pdf.parser.js'
import { parseMdict } from '../services/parser/mdict.parser.js'
import { FormatConfigJson } from '../lib/types/shared.js'
import logger from '../lib/worker-logger.js'

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'
const PRISMA_TRANSACTION_TIMEOUT_MS = parseInt(process.env.PRISMA_TRANSACTION_TIMEOUT_MS ?? '30000', 10)
const redis = new IORedis(REDIS_URL, { maxRetriesPerRequest: null })
const prisma = new PrismaClient()

async function publishProgress(data: Record<string, unknown>) {
  await redis.publish('parse:progress', JSON.stringify(data))
}

async function processParseJob(job: Job<ParseJobData>) {
  const { taskId, versionId, filePath, fileType } = job.data

  // Mark running
  await prisma.parseTask.update({
    where: { id: taskId },
    data: { status: 'RUNNING', startedAt: new Date() },
  })

  // Load FormatConfig
  const version = await prisma.dictionaryVersion.findUnique({
    where: { id: versionId },
    include: {
      formatConfig: true,
      dictionary: { select: { id: true, userId: true } },
    },
  })

  if (!version?.formatConfig) {
    throw new Error(`No valid FormatConfig found for version ${versionId}`)
  }
  if (!version.dictionary.userId) {
    throw new Error(`No owning user found for version ${versionId}`)
  }

  const configLink = await ensureVersionConfigLinks(prisma, versionId)

  // Resolve config inheritance if needed
  let configJson = version.formatConfig.configJson as unknown as FormatConfigJson
  if (version.formatConfig.parentConfigId) {
    const parentConfig = await prisma.formatConfig.findUnique({
      where: { id: version.formatConfig.parentConfigId },
    })
    if (parentConfig) {
      const { resolveInheritance } = await import('../services/config-engine.js')
      const resolved = resolveInheritance(
        configJson as unknown as Record<string, unknown>,
        parentConfig.configJson as Record<string, unknown>
      )
      configJson = resolved as unknown as FormatConfigJson
    }
  }

  const compiled = compileConfig(configJson)
  const parserFingerprint = createParserFingerprint({ fileType, configJson })
  const configVersionId = configLink?.configVersionId ?? version.formatConfig.configVersionId
  const sharedFileAssetId = (await ensureTaskSharedFileAsset(prisma, taskId))?.id

  if (!sharedFileAssetId || !configVersionId) {
    throw new Error(`Shared parse reuse requires sharedFileAssetId and configVersionId for task ${taskId}`)
  }

  const existingArtifact = await findSharedParseArtifactByKey(prisma, {
    sharedFileAssetId,
    configVersionId,
    parserFingerprint,
  })

  if (existingArtifact?.status === 'READY') {
    await materializeParseArtifactToVersion(prisma, {
      parseArtifactId: existingArtifact.id,
      versionId,
      taskId,
    })

    await bindParseArtifactToVersion(prisma, {
      parseArtifactId: existingArtifact.id,
      versionId,
      parseTaskId: taskId,
      userId: version.dictionary.userId,
    })

    await prisma.parseTask.update({
      where: { id: taskId },
      data: {
        parseArtifactId: existingArtifact.id,
        cacheHit: true,
        status: 'COMPLETED',
        processedEntries: existingArtifact.totalEntries,
        totalEntries: existingArtifact.totalEntries,
        failedEntries: existingArtifact.failedEntries,
        checkpointOffset: existingArtifact.totalEntries,
        completedAt: new Date(),
      },
    })

    await redis.publish('parse:completed', JSON.stringify({
      taskId,
      status: 'COMPLETED',
      processedEntries: existingArtifact.totalEntries,
      failedEntries: existingArtifact.failedEntries,
      cacheHit: true,
      parseArtifactId: existingArtifact.id,
      completedAt: new Date().toISOString(),
    }))

    return { processedEntries: existingArtifact.totalEntries, failedEntries: existingArtifact.failedEntries, cacheHit: true }
  }

  const parseArtifact = await ensureSharedParseArtifact(prisma, {
    sharedFileAssetId,
    configVersionId,
    parserFingerprint,
    status: 'BUILDING',
    builtFromTaskId: taskId,
  })

  await replaceArtifactEntryTree(prisma, parseArtifact.id, [])
  await prisma.parseTask.update({
    where: { id: taskId },
    data: {
      parseArtifactId: parseArtifact.id,
      cacheHit: false,
    },
  })

  // Choose parser
  type ChunkGenerator = ReturnType<typeof parseTxt>
  let gen: ChunkGenerator
  if (fileType === 'TXT') {
    gen = parseTxt(filePath, compiled)
  } else if (fileType === 'DOC') {
    gen = parseDoc(filePath, compiled) as unknown as ChunkGenerator
  } else if (fileType === 'DOCX') {
    gen = parseDocx(filePath, compiled) as unknown as ChunkGenerator
  } else if (fileType === 'PDF') {
    gen = parsePdf(filePath, compiled) as unknown as ChunkGenerator
  } else if (fileType === 'MDX') {
    gen = parseMdict(filePath, compiled) as unknown as ChunkGenerator
  } else {
    throw new Error(`Unknown file type: ${fileType}`)
  }

  let processedEntries = 0
  let failedEntries = 0
  let chunkIndex = 0
  const EMIT_EVERY = 1000 // emit progress every N entries
  let lastEmit = Date.now()

  for await (const chunk of gen) {
    chunkIndex++

    // Extend the BullMQ lock before each potentially long DB operation so
    // the job is not marked stalled while we're mid-transaction.
    await job.extendLock(job.token ?? '', 300000)

    // Abort if the task was cancelled externally (e.g. reparse overriding this job).
    const currentTask = await prisma.parseTask.findUnique({
      where: { id: taskId },
      select: { status: true },
    })
    if (currentTask?.status !== 'RUNNING') {
      logger.warn({ taskId }, 'Parse task no longer RUNNING — aborting job')
      return { processedEntries, failedEntries, aborted: true }
    }

    // Bulk insert entries in a transaction
    if (chunk.entries.length > 0) {
      await prisma.$transaction(async (tx) => {
        for (const entry of chunk.entries) {
          const dbEntry = await tx.entry.create({
            data: {
              versionId,
              taskId,
              rawHeadword: entry.rawHeadword,
              normalizedHeadword: entry.normalizedHeadword,
              entrySequence: entry.entrySequence,
              phonetic: entry.phonetic,
              pageNumber: entry.pageNumber,
              lineNumber: entry.lineNumber,
              metadata: entry.crossReferences?.length
                ? { crossReferences: entry.crossReferences }
                : undefined,
              senses: {
                create: entry.senses.map((sense, senseIdx) => ({
                  rawNumber: sense.rawNumber,
                  normalizedNumber: sense.normalizedNumber,
                  rawDefinition: sense.rawDefinition,
                  definition: sense.definition,
                  phonetic: sense.phonetic,
                  grammaticalCat: sense.grammaticalCat,
                  register: sense.register,
                  etymology: sense.etymology,
                  position: senseIdx,
                  examples: {
                    create: sense.examples.map((ex, exIdx) => ({
                      rawText: ex.rawText,
                      normalizedText: ex.normalizedText,
                      position: exIdx,
                    })),
                  },
                })),
              },
            },
          })
          void dbEntry // suppress unused warning
        }

        await appendArtifactEntries(tx, parseArtifact.id, chunk.entries)
      }, {
        maxWait: PRISMA_TRANSACTION_TIMEOUT_MS,
        timeout: PRISMA_TRANSACTION_TIMEOUT_MS,
      })
    }

    // Record parse errors
    if (chunk.errors.length > 0) {
      await prisma.parseError.createMany({
        data: chunk.errors.map((e) => ({
          taskId,
          pageNumber: e.pageNumber,
          lineNumber: e.lineNumber,
          rawText: e.rawText,
          fieldName: e.fieldName,
          errorCode: e.errorCode,
          errorDetail: e.errorDetail,
        })),
      })
      failedEntries += chunk.errors.length
    }

    processedEntries += chunk.entries.length

    // Update checkpoint in DB
    await prisma.parseTask.update({
      where: { id: taskId },
      data: {
        processedEntries,
        failedEntries,
        checkpointOffset: chunkIndex,
      },
    })

    // Publish progress (throttled)
    const now = Date.now()
    if (processedEntries % EMIT_EVERY === 0 || now - lastEmit > 2000) {
      await publishProgress({
        taskId,
        status: 'RUNNING',
        processedEntries,
        failedEntries,
        checkpointOffset: chunkIndex,
      })
      await job.updateProgress({ processedEntries, failedEntries, checkpoint: chunkIndex })
      lastEmit = now
    }
  }

  // Mark completed
  await prisma.sharedParseArtifact.update({
    where: { id: parseArtifact.id },
    data: {
      status: 'READY',
      totalEntries: processedEntries,
      failedEntries,
      completedAt: new Date(),
      builtFromTaskId: taskId,
    },
  })

  await bindParseArtifactToVersion(prisma, {
    parseArtifactId: parseArtifact.id,
    versionId,
    parseTaskId: taskId,
    userId: version.dictionary.userId,
  })

  await prisma.parseTask.update({
    where: { id: taskId },
    data: {
      parseArtifactId: parseArtifact.id,
      status: 'COMPLETED',
      processedEntries,
      failedEntries,
      totalEntries: processedEntries,
      completedAt: new Date(),
    },
  })

  await redis.publish('parse:completed', JSON.stringify({
    taskId,
    status: 'COMPLETED',
    processedEntries,
    failedEntries,
    completedAt: new Date().toISOString(),
  }))

  return { processedEntries, failedEntries }
}

const worker = new Worker<ParseJobData>('parse', processParseJob, {
  connection: redis,
  concurrency: 1,
  lockDuration: 300000, // 5 minutes — large file transactions can run long
  maxStalledCount: 1,   // allow one stall-retry before failing permanently
})

worker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'Parse job completed')
})

worker.on('failed', async (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, 'Parse job failed')
  if (job?.data?.taskId) {
    const task = await prisma.parseTask.update({
      where: { id: job.data.taskId },
      data: { status: 'FAILED' },
      select: { parseArtifactId: true },
    }).catch((e: Error) => {
      logger.error({ err: e.message }, 'Failed to update task status to FAILED')
      return null
    })

    if (task?.parseArtifactId) {
      await prisma.sharedParseArtifact.update({
        where: { id: task.parseArtifactId },
        data: { status: 'FAILED' },
      }).catch((e: Error) => logger.error({ err: e.message }, 'Failed to update artifact status to FAILED'))
    }

    // Persist a ParseError record so the errors page shows what went wrong.
    await prisma.parseError.create({
      data: {
        taskId: job.data.taskId,
        rawText: '',
        fieldName: 'worker',
        errorCode: 'WORKER_ERROR',
        errorDetail: err.message,
      },
    }).catch((e: Error) => logger.error({ err: e.message }, 'Failed to persist ParseError'))

    await redis.publish('parse:failed', JSON.stringify({
      taskId: job.data.taskId,
      status: 'FAILED',
      errorCode: 'WORKER_ERROR',
      message: err.message,
      recoverable: true,
    })).catch((e: Error) => logger.error({ err: e.message }, 'Failed to publish parse:failed event'))
  }
})

logger.info('BullMQ worker ready')

export default worker
