import { PrismaClient, FileType } from '@prisma/client'

type TxClient = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]
type DbClient = PrismaClient | TxClient

export interface EnsureSharedFileAssetInput {
  contentHash: string
  fileType: FileType
  originalExtension: string
  storagePath: string
  fileSize: number | bigint
  createdByTaskId?: string | null
}

export async function ensureSharedFileAsset(
  db: DbClient,
  input: EnsureSharedFileAssetInput
) {
  return db.sharedFileAsset.upsert({
    where: { contentHash: input.contentHash },
    update: {
      fileType: input.fileType,
      originalExtension: input.originalExtension,
      storagePath: input.storagePath,
      fileSize: BigInt(input.fileSize),
      lastReferencedAt: new Date(),
      createdByTaskId: input.createdByTaskId ?? undefined,
    },
    create: {
      contentHash: input.contentHash,
      hashAlgorithm: 'sha256',
      fileType: input.fileType,
      originalExtension: input.originalExtension,
      storagePath: input.storagePath,
      fileSize: BigInt(input.fileSize),
      createdByTaskId: input.createdByTaskId ?? undefined,
      lastReferencedAt: new Date(),
    },
  })
}

export async function touchSharedFileAsset(db: DbClient, sharedFileAssetId: string) {
  return db.sharedFileAsset.update({
    where: { id: sharedFileAssetId },
    data: { lastReferencedAt: new Date() },
  })
}

export async function bindSharedFileToVersion(
  db: DbClient,
  input: {
    versionId: string
    sharedFileAssetId: string
    originalFileName: string
    uploadedByUserId: string
  }
) {
  await db.versionFileReference.updateMany({
    where: { versionId: input.versionId, isActive: true },
    data: { isActive: false, detachedAt: new Date() },
  })

  await touchSharedFileAsset(db, input.sharedFileAssetId)

  return db.versionFileReference.create({
    data: {
      versionId: input.versionId,
      sharedFileAssetId: input.sharedFileAssetId,
      originalFileName: input.originalFileName,
      uploadedByUserId: input.uploadedByUserId,
      isActive: true,
    },
    include: {
      sharedFileAsset: true,
      uploadedByUser: { select: { id: true, email: true } },
    },
  })
}

export async function detachActiveVersionFileReference(db: DbClient, versionId: string) {
  return db.versionFileReference.updateMany({
    where: { versionId, isActive: true },
    data: { isActive: false, detachedAt: new Date() },
  })
}

export async function getActiveVersionFileReference(db: DbClient, versionId: string) {
  return db.versionFileReference.findFirst({
    where: { versionId, isActive: true },
    orderBy: { createdAt: 'desc' },
    include: {
      sharedFileAsset: true,
      uploadedByUser: { select: { id: true, email: true } },
    },
  })
}

export async function getActiveVersionFileContext(db: DbClient, versionId: string) {
  const reference = await getActiveVersionFileReference(db, versionId)
  if (reference) {
    const latestTask = await db.parseTask.findFirst({
      where: {
        versionId,
        sharedFileAssetId: reference.sharedFileAssetId,
      },
      orderBy: { createdAt: 'desc' },
    })

    return {
      reference,
      sharedFileAsset: reference.sharedFileAsset,
      latestTask,
      isLegacyFallback: false,
    }
  }

  const legacyTask = await db.parseTask.findFirst({
    where: {
      versionId,
      status: { in: ['COMPLETED', 'RUNNING', 'PENDING', 'FAILED'] },
    },
    orderBy: { createdAt: 'desc' },
  })
  if (!legacyTask) return null

  return {
    reference: {
      id: `legacy-${legacyTask.id}`,
      versionId,
      sharedFileAssetId: legacyTask.sharedFileAssetId ?? `legacy-${legacyTask.id}`,
      originalFileName: legacyTask.originalFileName,
      uploadedByUser: null,
      isActive: true,
      detachedAt: null,
      createdAt: legacyTask.createdAt,
    },
    sharedFileAsset: {
      id: legacyTask.sharedFileAssetId ?? `legacy-${legacyTask.id}`,
      contentHash: legacyTask.contentHash ?? '',
      hashAlgorithm: 'sha256',
      fileType: legacyTask.fileType,
      originalExtension: '',
      storagePath: legacyTask.storedFilePath,
      fileSize: BigInt(0),
      createdByTaskId: legacyTask.id,
      firstSeenAt: legacyTask.createdAt,
      lastReferencedAt: legacyTask.updatedAt,
      createdAt: legacyTask.createdAt,
      updatedAt: legacyTask.updatedAt,
    },
    latestTask: legacyTask,
    isLegacyFallback: true,
  }
}
