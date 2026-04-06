import { Prisma, PrismaClient, ParseArtifactStatus } from '@prisma/client'
import { ParsedEntry } from '../parser/types.js'

type TxClient = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]
type DbClient = PrismaClient | TxClient

export async function ensureSharedParseArtifact(
  db: DbClient,
  input: {
    sharedFileAssetId: string
    configVersionId: string
    parserFingerprint: string
    status?: ParseArtifactStatus
    builtFromTaskId?: string | null
  }
) {
  return db.sharedParseArtifact.upsert({
    where: {
      sharedFileAssetId_configVersionId_parserFingerprint: {
        sharedFileAssetId: input.sharedFileAssetId,
        configVersionId: input.configVersionId,
        parserFingerprint: input.parserFingerprint,
      },
    },
    update: {
      status: input.status ?? 'BUILDING',
      builtFromTaskId: input.builtFromTaskId ?? undefined,
    },
    create: {
      sharedFileAssetId: input.sharedFileAssetId,
      configVersionId: input.configVersionId,
      parserFingerprint: input.parserFingerprint,
      status: input.status ?? 'BUILDING',
      builtFromTaskId: input.builtFromTaskId ?? undefined,
    },
  })
}

export async function bindParseArtifactToVersion(
  db: DbClient,
  input: {
    parseArtifactId: string
    versionId: string
    parseTaskId?: string | null
    userId: string
  }
) {
  await db.parseArtifactReference.updateMany({
    where: { versionId: input.versionId, isActive: true },
    data: { isActive: false, detachedAt: new Date() },
  })

  return db.parseArtifactReference.create({
    data: {
      parseArtifactId: input.parseArtifactId,
      versionId: input.versionId,
      parseTaskId: input.parseTaskId ?? undefined,
      userId: input.userId,
      isActive: true,
    },
  })
}

export async function detachActiveParseArtifactReference(db: DbClient, versionId: string) {
  return db.parseArtifactReference.updateMany({
    where: { versionId, isActive: true },
    data: { isActive: false, detachedAt: new Date() },
  })
}

export async function replaceArtifactEntryTree(
  db: DbClient,
  parseArtifactId: string,
  entries: ParsedEntry[]
) {
  await db.artifactExample.deleteMany({
    where: { artifactSense: { artifactEntry: { parseArtifactId } } },
  })
  await db.artifactSense.deleteMany({
    where: { artifactEntry: { parseArtifactId } },
  })
  await db.artifactEntry.deleteMany({
    where: { parseArtifactId },
  })

  for (const entry of entries) {
    const metadata = entry.crossReferences?.length
      ? { crossReferences: entry.crossReferences }
      : undefined

    await db.artifactEntry.create({
      data: {
        parseArtifactId,
        rawHeadword: entry.rawHeadword,
        normalizedHeadword: entry.normalizedHeadword,
        entrySequence: entry.entrySequence ?? undefined,
        phonetic: entry.phonetic ?? undefined,
        pageNumber: entry.pageNumber ?? undefined,
        lineNumber: entry.lineNumber ?? undefined,
        metadata: metadata as Prisma.InputJsonValue | undefined,
        senses: {
          create: entry.senses.map((sense, senseIndex) => ({
            rawNumber: sense.rawNumber,
            normalizedNumber: sense.normalizedNumber,
            definition: sense.definition,
            rawDefinition: sense.rawDefinition,
            phonetic: sense.phonetic ?? undefined,
            grammaticalCat: sense.grammaticalCat ?? undefined,
            register: sense.register ?? undefined,
            etymology: sense.etymology ?? undefined,
            position: senseIndex,
            examples: {
              create: sense.examples.map((example, exampleIndex) => ({
                rawText: example.rawText,
                normalizedText: example.normalizedText,
                position: exampleIndex,
              })),
            },
          })),
        },
      },
    })
  }
}

export async function appendArtifactEntries(
  db: DbClient,
  parseArtifactId: string,
  entries: ParsedEntry[]
) {
  if (entries.length === 0) {
    return
  }

  for (const entry of entries) {
    const metadata = entry.crossReferences?.length
      ? { crossReferences: entry.crossReferences }
      : undefined

    await db.artifactEntry.create({
      data: {
        parseArtifactId,
        rawHeadword: entry.rawHeadword,
        normalizedHeadword: entry.normalizedHeadword,
        entrySequence: entry.entrySequence ?? undefined,
        phonetic: entry.phonetic ?? undefined,
        pageNumber: entry.pageNumber ?? undefined,
        lineNumber: entry.lineNumber ?? undefined,
        metadata: metadata as Prisma.InputJsonValue | undefined,
        senses: {
          create: entry.senses.map((sense, senseIndex) => ({
            rawNumber: sense.rawNumber,
            normalizedNumber: sense.normalizedNumber,
            definition: sense.definition,
            rawDefinition: sense.rawDefinition,
            phonetic: sense.phonetic ?? undefined,
            grammaticalCat: sense.grammaticalCat ?? undefined,
            register: sense.register ?? undefined,
            etymology: sense.etymology ?? undefined,
            position: senseIndex,
            examples: {
              create: sense.examples.map((example, exampleIndex) => ({
                rawText: example.rawText,
                normalizedText: example.normalizedText,
                position: exampleIndex,
              })),
            },
          })),
        },
      },
    })
  }
}

export async function materializeParseArtifactToVersion(
  db: DbClient,
  input: {
    parseArtifactId: string
    versionId: string
    taskId?: string | null
  }
) {
  const artifactEntries = await db.artifactEntry.findMany({
    where: { parseArtifactId: input.parseArtifactId },
    orderBy: [{ pageNumber: 'asc' }, { lineNumber: 'asc' }, { createdAt: 'asc' }],
    include: {
      senses: {
        orderBy: { position: 'asc' },
        include: {
          examples: { orderBy: { position: 'asc' } },
        },
      },
    },
  })

  for (const artifactEntry of artifactEntries) {
    await db.entry.create({
      data: {
        versionId: input.versionId,
        taskId: input.taskId ?? undefined,
        rawHeadword: artifactEntry.rawHeadword,
        normalizedHeadword: artifactEntry.normalizedHeadword,
        entrySequence: artifactEntry.entrySequence ?? undefined,
        phonetic: artifactEntry.phonetic ?? undefined,
        pageNumber: artifactEntry.pageNumber ?? undefined,
        lineNumber: artifactEntry.lineNumber ?? undefined,
        metadata: artifactEntry.metadata ?? undefined,
        senses: {
          create: artifactEntry.senses.map((sense) => ({
            rawNumber: sense.rawNumber,
            normalizedNumber: sense.normalizedNumber,
            definition: sense.definition,
            rawDefinition: sense.rawDefinition,
            phonetic: sense.phonetic ?? undefined,
            grammaticalCat: sense.grammaticalCat ?? undefined,
            register: sense.register ?? undefined,
            etymology: sense.etymology ?? undefined,
            position: sense.position,
            examples: {
              create: sense.examples.map((example) => ({
                rawText: example.rawText,
                normalizedText: example.normalizedText,
                position: example.position,
              })),
            },
          })),
        },
      },
    })
  }
}

export async function ensureVersionEntriesMaterializedFromArtifact(
  db: DbClient,
  versionId: string
) {
  const existingEntry = await db.entry.findFirst({
    where: { versionId },
    select: { id: true },
  })
  if (existingEntry) {
    return false
  }

  const activeReference = await db.parseArtifactReference.findFirst({
    where: { versionId, isActive: true, parseArtifact: { status: 'READY' } },
    orderBy: { createdAt: 'desc' },
    select: {
      parseArtifactId: true,
      parseTaskId: true,
    },
  })

  if (!activeReference) {
    return false
  }

  await materializeParseArtifactToVersion(db, {
    parseArtifactId: activeReference.parseArtifactId,
    versionId,
    taskId: activeReference.parseTaskId ?? undefined,
  })

  return true
}
