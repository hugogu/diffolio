import { Prisma, PrismaClient, ParseArtifactStatus } from '@prisma/client'

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
  entries: Array<{
    rawHeadword: string
    normalizedHeadword: string
    entrySequence?: number | null
    phonetic?: string | null
    pageNumber?: number | null
    lineNumber?: number | null
    metadata?: Prisma.InputJsonValue | null
    senses: Array<{
      rawNumber: string
      normalizedNumber: string
      definition: string
      rawDefinition: string
      phonetic?: string | null
      grammaticalCat?: string | null
      register?: string | null
      etymology?: string | null
      position: number
      examples: Array<{
        rawText: string
        normalizedText: string
        position: number
      }>
    }>
  }>
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
    await db.artifactEntry.create({
      data: {
        parseArtifactId,
        rawHeadword: entry.rawHeadword,
        normalizedHeadword: entry.normalizedHeadword,
        entrySequence: entry.entrySequence ?? undefined,
        phonetic: entry.phonetic ?? undefined,
        pageNumber: entry.pageNumber ?? undefined,
        lineNumber: entry.lineNumber ?? undefined,
        metadata: entry.metadata ?? undefined,
        senses: {
          create: entry.senses.map((sense) => ({
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
