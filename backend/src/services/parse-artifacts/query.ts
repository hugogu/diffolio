import { PrismaClient } from '@prisma/client'

type TxClient = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]
type DbClient = PrismaClient | TxClient

export async function findSharedParseArtifactByKey(
  db: DbClient,
  input: {
    sharedFileAssetId: string
    configVersionId: string
    parserFingerprint: string
  }
) {
  return db.sharedParseArtifact.findUnique({
    where: {
      sharedFileAssetId_configVersionId_parserFingerprint: {
        sharedFileAssetId: input.sharedFileAssetId,
        configVersionId: input.configVersionId,
        parserFingerprint: input.parserFingerprint,
      },
    },
  })
}

export async function getActiveParseArtifactReference(db: DbClient, versionId: string) {
  return db.parseArtifactReference.findFirst({
    where: { versionId, isActive: true },
    orderBy: { createdAt: 'desc' },
    include: {
      parseArtifact: true,
      user: { select: { id: true, email: true } },
    },
  })
}
