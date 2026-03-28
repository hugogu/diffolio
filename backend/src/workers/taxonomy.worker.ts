import { Worker, Job } from 'bullmq'
import IORedis from 'ioredis'
import { PrismaClient } from '@prisma/client'
import { parseTaxonomyFile } from '../services/taxonomy/parser.js'
import { compileTaxonomyConfig, normalizeHeadword, type TaxonomyFormatConfig } from '../services/taxonomy/config.js'
import logger from '../lib/worker-logger.js'
import { sanitizeText } from '../services/taxonomy/text-extractor.js'

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'
const redis = new IORedis(REDIS_URL, { maxRetriesPerRequest: null })
const prisma = new PrismaClient()

interface TaxonomyJobData {
  taxonomySourceId: string
  taskId: string
  filePath: string
}

async function processTaxonomyJob(job: Job<TaxonomyJobData>) {
  const { taxonomySourceId, taskId, filePath } = job.data

  await prisma.taxonomyImportTask.update({
    where: { id: taskId },
    data: { status: 'RUNNING', startedAt: new Date() },
  })

  await prisma.taxonomySource.update({
    where: { id: taxonomySourceId },
    data: { status: 'IMPORTING' },
  })

  try {
    const source = await prisma.taxonomySource.findUnique({ where: { id: taxonomySourceId } })
    if (!source) throw new Error(`TaxonomySource ${taxonomySourceId} not found`)

    const config = compileTaxonomyConfig(source.configJson as unknown as TaxonomyFormatConfig)

    let processedLines = 0
    let failedLines = 0
    const errorLog: Array<{ lineNumber: number; rawText: string; reason: string }> = []

    // nodeIdByPath maps path -> DB id for parent resolution
    const nodeIdByPath = new Map<string, string>()

    let totalEntries = 0

    for await (const chunk of parseTaxonomyFile(filePath, config)) {
      // Collect warnings
      for (const w of chunk.warnings) {
        failedLines++
        errorLog.push({
          lineNumber: w.lineNumber,
          rawText: sanitizeText(w.rawText, config.textSanitization),
          reason: sanitizeText(w.reason, config.textSanitization),
        })
      }

      for (const parsedNode of chunk.nodes) {
        processedLines++

        // Determine parentId
        let parentId: string | null = null
        if (parsedNode.level > 1) {
          const parentPathParts = parsedNode.path.split('/')
          parentPathParts.pop()
          const parentPath = parentPathParts.join('/')
          parentId = nodeIdByPath.get(parentPath) ?? null
        }

        const node = await prisma.taxonomyNode.create({
          data: {
            taxonomySourceId,
            parentId,
            level: parsedNode.level,
            label: sanitizeText(parsedNode.label, config.textSanitization),
            sequencePosition: parsedNode.sequencePosition,
            path: parsedNode.path,
          },
        })

        nodeIdByPath.set(parsedNode.path, node.id)

        // Insert leaf entries for level 4
        if (parsedNode.level === 4 && parsedNode.headwords && parsedNode.headwords.length > 0) {
          const seen = new Set<string>()
          const entries: Array<{
            nodeId: string
            taxonomySourceId: string
            headword: string
            normalizedHeadword: string
            sequencePosition: number
          }> = []

          for (let i = 0; i < parsedNode.headwords.length; i++) {
            const hw = sanitizeText(parsedNode.headwords[i], config.textSanitization)
            const normalized = sanitizeText(normalizeHeadword(hw, config.tradSimpMap), config.textSanitization)
            if (!seen.has(normalized)) {
              seen.add(normalized)
              entries.push({
                nodeId: node.id,
                taxonomySourceId,
                headword: hw,
                normalizedHeadword: normalized,
                sequencePosition: i,
              })
            }
          }

          if (entries.length > 0) {
            await prisma.taxonomyEntry.createMany({ data: entries })
            totalEntries += entries.length
          }
        }

        // Update checkpoint every 1000 processed lines
        if (processedLines % 1000 === 0) {
          await prisma.taxonomyImportTask.update({
            where: { id: taskId },
            data: { processedLines, failedLines, checkpointOffset: processedLines },
          })
        }
      }
    }

    // Final update
    await prisma.taxonomyImportTask.update({
      where: { id: taskId },
      data: {
        status: 'COMPLETED',
        processedLines,
        failedLines,
        errorLog: errorLog.length > 0 ? errorLog : undefined,
        checkpointOffset: processedLines,
        completedAt: new Date(),
      },
    })

    await prisma.taxonomySource.update({
      where: { id: taxonomySourceId },
      data: { status: 'ACTIVE', totalEntries },
    })

    await redis.publish('taxonomy:imported', JSON.stringify({ taxonomySourceId, totalEntries }))
  } catch (err) {
    await prisma.taxonomyImportTask.update({
      where: { id: taskId },
      data: { status: 'FAILED', completedAt: new Date() },
    })
    await prisma.taxonomySource.update({
      where: { id: taxonomySourceId },
      data: { status: 'FAILED' },
    })
    throw err
  }
}

const worker = new Worker<TaxonomyJobData>('taxonomy', processTaxonomyJob, {
  connection: redis,
  concurrency: 1,
})

worker.on('completed', (job) => logger.info({ jobId: job.id }, 'Taxonomy import job completed'))
worker.on('failed', (job, err) => logger.error({ jobId: job?.id, err: err.message }, 'Taxonomy import job failed'))

export default worker
