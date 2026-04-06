import { Worker, Job } from 'bullmq'
import IORedis from 'ioredis'
import { PrismaClient } from '@prisma/client'
import { ComparisonJobData } from '../plugins/bullmq.js'
import { align } from '../services/aligner.js'
import logger from '../lib/worker-logger.js'
import { diffSenses } from '../services/differ.js'
import { ensureVersionEntriesMaterializedFromArtifact } from '../services/parse-artifacts/persistence.js'

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'
const redis = new IORedis(REDIS_URL, { maxRetriesPerRequest: null })
const prisma = new PrismaClient()

async function processComparisonJob(job: Job<ComparisonJobData>) {
  const { comparisonId } = job.data

  await prisma.comparison.update({
    where: { id: comparisonId },
    data: { status: 'RUNNING' },
  })

  try {
    const comparison = await prisma.comparison.findUnique({
      where: { id: comparisonId },
    })
    if (!comparison) throw new Error(`Comparison ${comparisonId} not found`)

    const { versionAId, versionBId } = comparison
    await Promise.all([
      ensureVersionEntriesMaterializedFromArtifact(prisma, versionAId),
      ensureVersionEntriesMaterializedFromArtifact(prisma, versionBId),
    ])

    // ── Step 1: Align entries ─────────────────────────────────────────────
    await redis.publish('comparison:progress', JSON.stringify({
      comparisonId, status: 'RUNNING', step: 'aligning', percentage: 10,
    }))

    const alignmentResults = await align(versionAId, versionBId, prisma)

    let matched = 0, addedInB = 0, deletedFromA = 0
    for (const r of alignmentResults) {
      if (r.changeType === 'MATCHED' || r.changeType === 'MATCHED_VARIANT') matched++
      else if (r.changeType === 'ADDED') addedInB++
      else deletedFromA++
    }

    // ── Step 2: Clear stale data + bulk insert alignments ────────────────
    await redis.publish('comparison:progress', JSON.stringify({
      comparisonId, status: 'RUNNING', step: 'inserting_alignments', percentage: 40,
    }))

    // Delete any existing data from a previous run of this comparison
    // (sense_diffs must be deleted first due to FK RESTRICT constraint)
    const existingAlignmentIds = (await prisma.entryAlignment.findMany({
      where: { comparisonId },
      select: { id: true },
    })).map((a) => a.id)
    if (existingAlignmentIds.length > 0) {
      const DEL_BATCH = 1000
      for (let i = 0; i < existingAlignmentIds.length; i += DEL_BATCH) {
        await prisma.senseDiff.deleteMany({
          where: { alignmentId: { in: existingAlignmentIds.slice(i, i + DEL_BATCH) } },
        })
      }
      await prisma.entryAlignment.deleteMany({ where: { comparisonId } })
    }

    const BATCH = 500
    for (let i = 0; i < alignmentResults.length; i += BATCH) {
      await prisma.entryAlignment.createMany({
        data: alignmentResults.slice(i, i + BATCH).map((r) => ({
          comparisonId,
          entryAId: r.entryAId,
          entryBId: r.entryBId,
          changeType: r.changeType,
          alignScore: r.alignScore,
        })),
      })
    }

    // ── Step 3: Compute and persist SenseDiffs for MATCHED entries ────────
    await redis.publish('comparison:progress', JSON.stringify({
      comparisonId, status: 'RUNNING', step: 'diffing_senses', percentage: 60,
    }))

    // Fetch matched alignment stubs (IDs + FK only) — no nested includes
    const matchedAlignmentRows = await prisma.entryAlignment.findMany({
      where: {
        comparisonId,
        changeType: { in: ['MATCHED', 'MATCHED_VARIANT'] },
        entryAId: { not: null },
        entryBId: { not: null },
      },
      select: { id: true, entryAId: true, entryBId: true },
    })

    // Process in batches to stay well under PostgreSQL's 65535-parameter limit
    // Each batch of 500 alignments → ~1000 entryIds → ~5000 senseIds → safe
    const SENSE_BATCH = 500

    const senseDiffRows: {
      alignmentId: string
      senseAId: string | null
      senseBId: string | null
      changeType: string
      diffSummary: unknown
    }[] = []

    type SenseRow = { id: string; entryId: string; normalizedNumber: string; definition: string; phonetic: string | null; grammaticalCat: string | null; register: string | null }
    type ExRow = { senseId: string; normalizedText: string }

    for (let i = 0; i < matchedAlignmentRows.length; i += SENSE_BATCH) {
      const batch = matchedAlignmentRows.slice(i, i + SENSE_BATCH)
      const entryIds = Array.from(new Set(batch.flatMap((a) => [a.entryAId!, a.entryBId!])))

      const senses: SenseRow[] = await prisma.sense.findMany({
        where: { entryId: { in: entryIds } },
        select: { id: true, entryId: true, normalizedNumber: true, definition: true, phonetic: true, grammaticalCat: true, register: true },
        orderBy: { position: 'asc' },
      })

      const senseIds = senses.map((s) => s.id)
      const examples: ExRow[] = senseIds.length > 0
        ? await prisma.example.findMany({
            where: { senseId: { in: senseIds } },
            select: { senseId: true, normalizedText: true },
            orderBy: { position: 'asc' },
          })
        : []

      const exBySenseId = new Map<string, string[]>()
      for (const ex of examples) {
        const arr = exBySenseId.get(ex.senseId) ?? []
        arr.push(ex.normalizedText)
        exBySenseId.set(ex.senseId, arr)
      }
      const sensesByEntryId = new Map<string, SenseRow[]>()
      for (const s of senses) {
        const arr = sensesByEntryId.get(s.entryId) ?? []
        arr.push(s)
        sensesByEntryId.set(s.entryId, arr)
      }

      for (const a of batch) {
        const sensesA = (sensesByEntryId.get(a.entryAId!) ?? []).map((s) => ({ ...s, examples: (exBySenseId.get(s.id) ?? []).map((t) => ({ normalizedText: t })) }))
        const sensesB = (sensesByEntryId.get(a.entryBId!) ?? []).map((s) => ({ ...s, examples: (exBySenseId.get(s.id) ?? []).map((t) => ({ normalizedText: t })) }))
        const diffs = diffSenses(sensesA, sensesB)
        for (const d of diffs) {
          senseDiffRows.push({
            alignmentId: a.id,
            senseAId: d.senseAId,
            senseBId: d.senseBId,
            changeType: d.changeType,
            diffSummary: d.diffSummary,
          })
        }
      }
    }

    // Batch insert sense diffs
    for (let i = 0; i < senseDiffRows.length; i += BATCH) {
      await prisma.senseDiff.createMany({
        data: senseDiffRows.slice(i, i + BATCH).map((r) => ({
          alignmentId: r.alignmentId,
          senseAId: r.senseAId,
          senseBId: r.senseBId,
          changeType: r.changeType as never,
          diffSummary: r.diffSummary as never,
        })),
      })
    }

    // ── Step 4: Finalize ─────────────────────────────────────────────────
    const totalA = await prisma.entry.count({ where: { versionId: versionAId } })
    const totalB = await prisma.entry.count({ where: { versionId: versionBId } })

    await prisma.comparison.update({
      where: { id: comparisonId },
      data: {
        status: 'COMPLETED',
        totalA,
        totalB,
        matched,
        addedInB,
        deletedFromA,
        completedAt: new Date(),
      },
    })

    await redis.publish('comparison:progress', JSON.stringify({
      comparisonId,
      status: 'COMPLETED',
      matched,
      addedInB,
      deletedFromA,
      percentage: 100,
      completedAt: new Date().toISOString(),
    }))
  } catch (err) {
    await prisma.comparison.update({
      where: { id: comparisonId },
      data: { status: 'FAILED' },
    })
    throw err
  }
}

const worker = new Worker<ComparisonJobData>('comparison', processComparisonJob, {
  connection: redis,
  concurrency: 1,
})

worker.on('completed', (job) => logger.info({ jobId: job.id }, 'Comparison job completed'))
worker.on('failed', (job, err) => logger.error({ jobId: job?.id, err: err.message }, 'Comparison job failed'))

export default worker
