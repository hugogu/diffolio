import { MigrationKind, PrismaClient } from '@prisma/client'
import { FormatConfigJson } from '../lib/types/shared.js'
import { ensureVersionConfigLinks } from '../services/configs/bootstrap.js'
import {
  ensureSystemConfigSnapshot,
  ensureUserConfigSnapshot,
} from '../services/configs/snapshots.js'
import { createParserFingerprint } from '../services/parse-artifacts/fingerprint.js'
import {
  bindParseArtifactToVersion,
  ensureSharedParseArtifact,
  replaceArtifactEntryTree,
} from '../services/parse-artifacts/persistence.js'
import { getActiveVersionFileContext } from '../services/uploads/shared-file-assets.js'
import {
  ensureTaskSharedFileAsset,
  ensureVersionActiveFileReference,
} from '../services/uploads/shared-file-assets.js'

type JsonRecord = Record<string, unknown>

type CursorState = {
  stage?: string
  lastId?: string | null
}

type BatchNotes = {
  dryRun: boolean
  stage?: string
  errors?: Array<{ stage: string; id: string; message: string }>
}

function parseArgs(argv: string[]) {
  const args = new Map<string, string | boolean>()

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index]
    if (!current.startsWith('--')) continue

    const key = current.slice(2)
    const next = argv[index + 1]
    if (!next || next.startsWith('--')) {
      args.set(key, true)
      continue
    }

    args.set(key, next)
    index += 1
  }

  return args
}

function parseKinds(rawKinds: string): MigrationKind[] {
  return rawKinds
    .split(',')
    .map((value) => value.trim().toUpperCase())
    .filter((value): value is MigrationKind => value in MigrationKind)
}

function asCursor(value: unknown): CursorState {
  if (!value || typeof value !== 'object') {
    return {}
  }
  const record = value as JsonRecord
  return {
    stage: typeof record.stage === 'string' ? record.stage : undefined,
    lastId: typeof record.lastId === 'string' ? record.lastId : null,
  }
}

function asNotes(value: unknown, dryRun: boolean): BatchNotes {
  if (!value || typeof value !== 'object') {
    return { dryRun, errors: [] }
  }
  const record = value as JsonRecord
  const rawErrors = Array.isArray(record.errors) ? record.errors : []
  return {
    dryRun: Boolean(record.dryRun ?? dryRun),
    stage: typeof record.stage === 'string' ? record.stage : undefined,
    errors: rawErrors
      .filter((item): item is JsonRecord => Boolean(item) && typeof item === 'object')
      .map((item) => ({
        stage: typeof item.stage === 'string' ? item.stage : 'unknown',
        id: typeof item.id === 'string' ? item.id : 'unknown',
        message: typeof item.message === 'string' ? item.message : 'Unknown error',
      })),
  }
}

async function claimBatch(prisma: PrismaClient, kind: MigrationKind) {
  const existing = await prisma.migrationBatch.findFirst({
    where: { kind, status: { in: ['PENDING', 'RUNNING', 'FAILED'] } },
    orderBy: { createdAt: 'desc' },
  })

  if (existing) {
    return prisma.migrationBatch.update({
      where: { id: existing.id },
      data: {
        status: 'RUNNING',
        startedAt: existing.startedAt ?? new Date(),
      },
    })
  }

  return prisma.migrationBatch.create({
    data: {
      kind,
      status: 'RUNNING',
      startedAt: new Date(),
      cursor: {},
      notes: {},
    },
  })
}

async function updateBatchProgress(
  prisma: PrismaClient,
  batchId: string,
  input: {
    processedIncrement?: number
    errorIncrement?: number
    cursor?: CursorState
    notes?: BatchNotes
  }
) {
  const batch = await prisma.migrationBatch.findUnique({
    where: { id: batchId },
  })
  if (!batch) return

  const currentNotes = asNotes(batch.notes, false)
  const mergedNotes: BatchNotes = input.notes
    ? {
        ...currentNotes,
        ...input.notes,
        errors: input.notes.errors ?? currentNotes.errors ?? [],
      }
    : currentNotes

  await prisma.migrationBatch.update({
    where: { id: batchId },
    data: {
      processedCount: batch.processedCount + (input.processedIncrement ?? 0),
      errorCount: batch.errorCount + (input.errorIncrement ?? 0),
      cursor: (input.cursor ?? batch.cursor ?? {}) as object,
      notes: mergedNotes as object,
    },
  })
}

async function appendBatchError(
  prisma: PrismaClient,
  batchId: string,
  input: { stage: string; id: string; message: string }
) {
  const batch = await prisma.migrationBatch.findUnique({ where: { id: batchId } })
  if (!batch) return

  const notes = asNotes(batch.notes, false)
  const errors = [...(notes.errors ?? []), input].slice(-100)

  await prisma.migrationBatch.update({
    where: { id: batchId },
    data: {
      errorCount: batch.errorCount + 1,
      notes: {
        ...notes,
        stage: input.stage,
        errors,
      } as object,
    },
  })
}

async function completeBatch(
  prisma: PrismaClient,
  batchId: string,
  input: { cursor?: CursorState; notes?: BatchNotes }
) {
  const batch = await prisma.migrationBatch.findUnique({
    where: { id: batchId },
  })
  if (!batch) return

  const notes = {
    ...asNotes(batch.notes, false),
    ...(input.notes ?? {}),
  }

  await prisma.migrationBatch.update({
    where: { id: batchId },
    data: {
      status: 'COMPLETED',
      cursor: (input.cursor ?? batch.cursor ?? {}) as object,
      notes: notes as object,
      completedAt: new Date(),
    },
  })
}

async function failBatch(prisma: PrismaClient, batchId: string, error: unknown) {
  const batch = await prisma.migrationBatch.findUnique({ where: { id: batchId } })
  const notes = asNotes(batch?.notes, false)

  await prisma.migrationBatch.update({
    where: { id: batchId },
    data: {
      status: 'FAILED',
      completedAt: new Date(),
      notes: {
        ...notes,
        lastFailure: error instanceof Error ? error.message : String(error),
      } as object,
    },
  })
}

function buildParsedEntriesFromRows(
  entries: Array<{
    rawHeadword: string
    normalizedHeadword: string
    entrySequence: number | null
    phonetic: string | null
    pageNumber: number | null
    lineNumber: number | null
    metadata: unknown
    senses: Array<{
      rawNumber: string
      normalizedNumber: string
      definition: string
      rawDefinition: string
      phonetic: string | null
      grammaticalCat: string | null
      register: string | null
      etymology: string | null
      examples: Array<{
        rawText: string
        normalizedText: string
      }>
    }>
  }>
) {
  return entries.map((entry) => ({
    rawHeadword: entry.rawHeadword,
    normalizedHeadword: entry.normalizedHeadword,
    entrySequence: entry.entrySequence ?? undefined,
    phonetic: entry.phonetic ?? undefined,
    pageNumber: entry.pageNumber ?? undefined,
    lineNumber: entry.lineNumber ?? undefined,
    crossReferences: (entry.metadata as { crossReferences?: string[] } | null)?.crossReferences ?? [],
    senses: entry.senses.map((sense) => ({
      rawNumber: sense.rawNumber,
      normalizedNumber: sense.normalizedNumber,
      definition: sense.definition,
      rawDefinition: sense.rawDefinition,
      phonetic: sense.phonetic ?? undefined,
      grammaticalCat: sense.grammaticalCat ?? undefined,
      register: sense.register ?? undefined,
      etymology: sense.etymology ?? undefined,
      examples: sense.examples.map((example) => ({
        rawText: example.rawText,
        normalizedText: example.normalizedText,
      })),
    })),
  }))
}

async function processConfigPhase(
  prisma: PrismaClient,
  batchId: string,
  dryRun: boolean,
  batchSize: number
) {
  const batch = await prisma.migrationBatch.findUnique({ where: { id: batchId } })
  let cursor = asCursor(batch?.cursor)
  let stage = cursor.stage ?? 'system'

  while (stage !== 'done') {
    if (stage === 'system') {
      const configs = await prisma.systemFormatConfig.findMany({
        where: cursor.lastId ? { id: { gt: cursor.lastId } } : undefined,
        orderBy: { id: 'asc' },
        take: batchSize,
        include: { allowedUsers: { select: { userId: true } } },
      })

      if (configs.length === 0) {
        stage = 'user'
        cursor = { stage, lastId: null }
        await updateBatchProgress(prisma, batchId, {
          cursor,
          notes: { dryRun, stage },
        })
        continue
      }

      for (const config of configs) {
        try {
          if (!dryRun) {
            await ensureSystemConfigSnapshot(prisma, {
              id: config.id,
              adminUserId: config.createdById,
              name: config.name,
              description: config.description,
              visibility: config.visibility,
              configJson: config.configJson as unknown as FormatConfigJson,
              allowedUserIds: config.allowedUsers.map((item) => item.userId),
            })
          }
          await updateBatchProgress(prisma, batchId, { processedIncrement: 1 })
        } catch (error) {
          await appendBatchError(prisma, batchId, {
            stage,
            id: config.id,
            message: error instanceof Error ? error.message : String(error),
          })
        }
      }

      cursor = { stage, lastId: configs[configs.length - 1]?.id ?? null }
      await updateBatchProgress(prisma, batchId, {
        cursor,
        notes: { dryRun, stage },
      })
      continue
    }

    if (stage === 'user') {
      const configs = await prisma.userFormatConfig.findMany({
        where: cursor.lastId ? { id: { gt: cursor.lastId } } : undefined,
        orderBy: { id: 'asc' },
        take: batchSize,
      })

      if (configs.length === 0) {
        stage = 'format'
        cursor = { stage, lastId: null }
        await updateBatchProgress(prisma, batchId, {
          cursor,
          notes: { dryRun, stage },
        })
        continue
      }

      for (const config of configs) {
        try {
          if (!dryRun) {
            await ensureUserConfigSnapshot(prisma, {
              id: config.id,
              userId: config.userId,
              name: config.name,
              description: config.description,
              configJson: config.configJson as unknown as FormatConfigJson,
              clonedFromId: config.clonedFromId,
            })
          }
          await updateBatchProgress(prisma, batchId, { processedIncrement: 1 })
        } catch (error) {
          await appendBatchError(prisma, batchId, {
            stage,
            id: config.id,
            message: error instanceof Error ? error.message : String(error),
          })
        }
      }

      cursor = { stage, lastId: configs[configs.length - 1]?.id ?? null }
      await updateBatchProgress(prisma, batchId, {
        cursor,
        notes: { dryRun, stage },
      })
      continue
    }

    const formatConfigs = await prisma.formatConfig.findMany({
      where: cursor.lastId ? { id: { gt: cursor.lastId } } : undefined,
      orderBy: { id: 'asc' },
      take: batchSize,
      select: { id: true, versionId: true },
    })

    if (formatConfigs.length === 0) {
      stage = 'done'
      cursor = { stage, lastId: null }
      await updateBatchProgress(prisma, batchId, {
        cursor,
        notes: { dryRun, stage },
      })
      break
    }

    for (const formatConfig of formatConfigs) {
      try {
        if (!dryRun) {
          await ensureVersionConfigLinks(prisma, formatConfig.versionId)
        }
        await updateBatchProgress(prisma, batchId, { processedIncrement: 1 })
      } catch (error) {
        await appendBatchError(prisma, batchId, {
          stage,
          id: formatConfig.id,
          message: error instanceof Error ? error.message : String(error),
        })
      }
    }

    cursor = { stage, lastId: formatConfigs[formatConfigs.length - 1]?.id ?? null }
    await updateBatchProgress(prisma, batchId, {
      cursor,
      notes: { dryRun, stage },
    })
  }
}

async function processFilesPhase(
  prisma: PrismaClient,
  batchId: string,
  dryRun: boolean,
  batchSize: number
) {
  const batch = await prisma.migrationBatch.findUnique({ where: { id: batchId } })
  let cursor = asCursor(batch?.cursor)
  let stage = cursor.stage ?? 'tasks'

  while (stage !== 'done') {
    if (stage === 'tasks') {
      const tasks = await prisma.parseTask.findMany({
        where: cursor.lastId
          ? { id: { gt: cursor.lastId }, storedFilePath: { not: '' } }
          : { storedFilePath: { not: '' } },
        orderBy: { id: 'asc' },
        take: batchSize,
        select: { id: true },
      })

      if (tasks.length === 0) {
        stage = 'versions'
        cursor = { stage, lastId: null }
        await updateBatchProgress(prisma, batchId, {
          cursor,
          notes: { dryRun, stage },
        })
        continue
      }

      for (const task of tasks) {
        try {
          if (!dryRun) {
            await ensureTaskSharedFileAsset(prisma, task.id)
          }
          await updateBatchProgress(prisma, batchId, { processedIncrement: 1 })
        } catch (error) {
          await appendBatchError(prisma, batchId, {
            stage,
            id: task.id,
            message: error instanceof Error ? error.message : String(error),
          })
        }
      }

      cursor = { stage, lastId: tasks[tasks.length - 1]?.id ?? null }
      await updateBatchProgress(prisma, batchId, {
        cursor,
        notes: { dryRun, stage },
      })
      continue
    }

    const versions = await prisma.dictionaryVersion.findMany({
      where: cursor.lastId
        ? {
            id: { gt: cursor.lastId },
            parseTasks: { some: {} },
            fileReferences: { none: { isActive: true } },
          }
        : {
            parseTasks: { some: {} },
            fileReferences: { none: { isActive: true } },
          },
      orderBy: { id: 'asc' },
      take: batchSize,
      select: {
        id: true,
        dictionary: { select: { userId: true } },
      },
    })

    if (versions.length === 0) {
      stage = 'done'
      cursor = { stage, lastId: null }
      await updateBatchProgress(prisma, batchId, {
        cursor,
        notes: { dryRun, stage },
      })
      break
    }

    for (const version of versions) {
      try {
        if (!dryRun) {
          await ensureVersionActiveFileReference(prisma, version.id, version.dictionary.userId ?? undefined)
        }
        await updateBatchProgress(prisma, batchId, { processedIncrement: 1 })
      } catch (error) {
        await appendBatchError(prisma, batchId, {
          stage,
          id: version.id,
          message: error instanceof Error ? error.message : String(error),
        })
      }
    }

    cursor = { stage, lastId: versions[versions.length - 1]?.id ?? null }
    await updateBatchProgress(prisma, batchId, {
      cursor,
      notes: { dryRun, stage },
    })
  }
}

async function processArtifactVersion(prisma: PrismaClient, versionId: string) {
  const version = await prisma.dictionaryVersion.findUnique({
    where: { id: versionId },
    include: {
      dictionary: { select: { userId: true } },
      formatConfig: true,
    },
  })

  if (!version?.formatConfig || !version.dictionary.userId) {
    return
  }

  const configLink = await ensureVersionConfigLinks(prisma, versionId)
  const fileContext = await ensureVersionActiveFileReference(prisma, versionId, version.dictionary.userId)
    ?? await getActiveVersionFileContext(prisma, versionId)

  if (!configLink?.configVersionId || !fileContext?.latestTask) {
    return
  }

  const parserFingerprint = createParserFingerprint({
    fileType: fileContext.latestTask.fileType,
    configJson: version.formatConfig.configJson as unknown as FormatConfigJson,
  })

  const artifact = await ensureSharedParseArtifact(prisma, {
    sharedFileAssetId: fileContext.sharedFileAsset.id,
    configVersionId: configLink.configVersionId,
    parserFingerprint,
    status: 'READY',
    builtFromTaskId: fileContext.latestTask.id,
  })

  const hasEntries = await prisma.artifactEntry.findFirst({
    where: { parseArtifactId: artifact.id },
    select: { id: true },
  })

  if (!hasEntries) {
    const versionEntries = await prisma.entry.findMany({
      where: { versionId },
      orderBy: [{ lineNumber: 'asc' }, { createdAt: 'asc' }],
      include: {
        senses: {
          orderBy: { position: 'asc' },
          include: {
            examples: { orderBy: { position: 'asc' } },
          },
        },
      },
    })

    await replaceArtifactEntryTree(prisma, artifact.id, buildParsedEntriesFromRows(versionEntries))
  }

  const totalEntries = await prisma.entry.count({ where: { versionId } })
  const failedEntries = await prisma.parseError.count({
    where: {
      taskId: fileContext.latestTask.id,
    },
  })

  await prisma.sharedParseArtifact.update({
    where: { id: artifact.id },
    data: {
      status: 'READY',
      totalEntries,
      failedEntries,
      completedAt: fileContext.latestTask.completedAt ?? fileContext.latestTask.updatedAt,
      builtFromTaskId: fileContext.latestTask.id,
    },
  })

  await prisma.parseTask.updateMany({
    where: {
      versionId,
      OR: [
        { id: fileContext.latestTask.id },
        { sharedFileAssetId: fileContext.sharedFileAsset.id, status: 'COMPLETED' },
      ],
    },
    data: {
      parseArtifactId: artifact.id,
      sharedFileAssetId: fileContext.sharedFileAsset.id,
      contentHash: fileContext.sharedFileAsset.contentHash,
    },
  })

  await bindParseArtifactToVersion(prisma, {
    parseArtifactId: artifact.id,
    versionId,
    parseTaskId: fileContext.latestTask.id,
    userId: version.dictionary.userId,
  })
}

async function processArtifactsPhase(
  prisma: PrismaClient,
  batchId: string,
  dryRun: boolean,
  batchSize: number
) {
  const batch = await prisma.migrationBatch.findUnique({ where: { id: batchId } })
  let cursor = asCursor(batch?.cursor)
  const stage = 'versions'

  while (true) {
    const versions = await prisma.dictionaryVersion.findMany({
      where: cursor.lastId
        ? { id: { gt: cursor.lastId }, entries: { some: {} } }
        : { entries: { some: {} } },
      orderBy: { id: 'asc' },
      take: batchSize,
      select: { id: true },
    })

    if (versions.length === 0) {
      cursor = { stage: 'done', lastId: null }
      await updateBatchProgress(prisma, batchId, {
        cursor,
        notes: { dryRun, stage: 'done' },
      })
      break
    }

    for (const version of versions) {
      try {
        if (!dryRun) {
          await processArtifactVersion(prisma, version.id)
        }
        await updateBatchProgress(prisma, batchId, { processedIncrement: 1 })
      } catch (error) {
        await appendBatchError(prisma, batchId, {
          stage,
          id: version.id,
          message: error instanceof Error ? error.message : String(error),
        })
      }
    }

    cursor = { stage, lastId: versions[versions.length - 1]?.id ?? null }
    await updateBatchProgress(prisma, batchId, {
      cursor,
      notes: { dryRun, stage },
    })
  }
}

async function processLinksPhase(
  prisma: PrismaClient,
  batchId: string,
  dryRun: boolean,
  batchSize: number
) {
  const batch = await prisma.migrationBatch.findUnique({ where: { id: batchId } })
  let cursor = asCursor(batch?.cursor)
  const stage = 'versions'

  while (true) {
    const versions = await prisma.dictionaryVersion.findMany({
      where: cursor.lastId
        ? {
            id: { gt: cursor.lastId },
            OR: [
              { fileReferences: { none: { isActive: true } }, parseTasks: { some: {} } },
              { parseArtifactReferences: { none: { isActive: true } }, entries: { some: {} } },
            ],
          }
        : {
            OR: [
              { fileReferences: { none: { isActive: true } }, parseTasks: { some: {} } },
              { parseArtifactReferences: { none: { isActive: true } }, entries: { some: {} } },
            ],
          },
      orderBy: { id: 'asc' },
      take: batchSize,
      select: {
        id: true,
        dictionary: { select: { userId: true } },
      },
    })

    if (versions.length === 0) {
      cursor = { stage: 'done', lastId: null }
      await updateBatchProgress(prisma, batchId, {
        cursor,
        notes: { dryRun, stage: 'done' },
      })
      break
    }

    for (const version of versions) {
      try {
        if (!dryRun) {
          await ensureVersionActiveFileReference(prisma, version.id, version.dictionary.userId ?? undefined)
          await processArtifactVersion(prisma, version.id)
        }
        await updateBatchProgress(prisma, batchId, { processedIncrement: 1 })
      } catch (error) {
        await appendBatchError(prisma, batchId, {
          stage,
          id: version.id,
          message: error instanceof Error ? error.message : String(error),
        })
      }
    }

    cursor = { stage, lastId: versions[versions.length - 1]?.id ?? null }
    await updateBatchProgress(prisma, batchId, {
      cursor,
      notes: { dryRun, stage },
    })
  }
}

async function runPhase(
  prisma: PrismaClient,
  kind: MigrationKind,
  dryRun: boolean,
  batchSize: number
) {
  const batch = await claimBatch(prisma, kind)

  try {
    if (kind === 'CONFIGS') {
      await processConfigPhase(prisma, batch.id, dryRun, batchSize)
    } else if (kind === 'FILES') {
      await processFilesPhase(prisma, batch.id, dryRun, batchSize)
    } else if (kind === 'ARTIFACTS') {
      await processArtifactsPhase(prisma, batch.id, dryRun, batchSize)
    } else if (kind === 'LINKS') {
      await processLinksPhase(prisma, batch.id, dryRun, batchSize)
    }

    await completeBatch(prisma, batch.id, {
      notes: { dryRun, stage: 'done' },
      cursor: { stage: 'done', lastId: null },
    })
  } catch (error) {
    await failBatch(prisma, batch.id, error)
    throw error
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const requestedKinds = parseKinds(String(args.get('kind') ?? 'CONFIGS,FILES,ARTIFACTS,LINKS'))
  const dryRun = Boolean(args.get('dry-run'))
  const batchSize = Math.max(1, parseInt(String(args.get('batch-size') ?? '100'), 10))

  const prisma = new PrismaClient()

  try {
    for (const kind of requestedKinds) {
      await runPhase(prisma, kind, dryRun, batchSize)
    }
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
