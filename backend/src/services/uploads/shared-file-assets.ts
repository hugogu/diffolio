import { PrismaClient, FileType } from '@prisma/client'
import {
  ensureSharedStorageFile,
  fileExists,
  getStoredFileSize,
  hashStoredFile,
} from '../../lib/storage.js'
import {
  extensionForFileType,
  extensionFromFilename,
} from '../../lib/types/shared-storage.js'

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

  const hasHistoricalReferences = await db.versionFileReference.findFirst({
    where: { versionId },
    select: { id: true },
  })
  if (hasHistoricalReferences) {
    return null
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

async function ensureSharedFileAssetForTask(
  db: DbClient,
  task: {
    id: string
    versionId: string
    fileType: FileType
    originalFileName: string
    storedFilePath: string
    sharedFileAssetId: string | null
    contentHash: string | null
  }
) {
  if (!fileExists(task.storedFilePath)) {
    throw new Error(`Stored file missing for task ${task.id}: ${task.storedFilePath}`)
  }

  const originalExtension = extensionFromFilename(task.originalFileName) || extensionForFileType(task.fileType)
  const hashed = task.contentHash
    ? { contentHash: task.contentHash, fileSize: getStoredFileSize(task.storedFilePath) }
    : await hashStoredFile(task.storedFilePath)
  const promoted = ensureSharedStorageFile(task.storedFilePath, hashed.contentHash, originalExtension)
  const asset = await ensureSharedFileAsset(db, {
    contentHash: hashed.contentHash,
    fileType: task.fileType,
    originalExtension,
    storagePath: promoted.storagePath,
    fileSize: hashed.fileSize,
    createdByTaskId: task.id,
  })

  await db.parseTask.updateMany({
    where: {
      OR: [
        { id: task.id },
        { versionId: task.versionId, storedFilePath: task.storedFilePath },
        { versionId: task.versionId, contentHash: hashed.contentHash },
      ],
    },
    data: {
      sharedFileAssetId: asset.id,
      contentHash: hashed.contentHash,
      storedFilePath: asset.storagePath,
    },
  })

  return asset
}

export async function ensureTaskSharedFileAsset(db: DbClient, taskId: string) {
  const task = await db.parseTask.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      versionId: true,
      fileType: true,
      originalFileName: true,
      storedFilePath: true,
      sharedFileAssetId: true,
      contentHash: true,
    },
  })

  if (!task) {
    return null
  }

  if (task.sharedFileAssetId) {
    const asset = await db.sharedFileAsset.findUnique({
      where: { id: task.sharedFileAssetId },
    })
    if (asset) {
      return asset
    }
  }

  return ensureSharedFileAssetForTask(db, task)
}

export async function ensureVersionActiveFileReference(
  db: DbClient,
  versionId: string,
  uploadedByUserId?: string
) {
  const existingContext = await getActiveVersionFileContext(db, versionId)
  if (existingContext && !existingContext.isLegacyFallback) {
    return existingContext
  }

  const hasHistoricalReferences = await db.versionFileReference.findFirst({
    where: { versionId },
    select: { id: true },
  })
  if (hasHistoricalReferences) {
    return null
  }

  const version = await db.dictionaryVersion.findUnique({
    where: { id: versionId },
    include: {
      dictionary: {
        select: { userId: true },
      },
    },
  })

  if (!version?.dictionary.userId) {
    return null
  }

  const legacyTask = await db.parseTask.findFirst({
    where: { versionId },
    orderBy: [{ completedAt: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      versionId: true,
      fileType: true,
      originalFileName: true,
      storedFilePath: true,
      sharedFileAssetId: true,
      contentHash: true,
    },
  })

  if (!legacyTask) {
    return null
  }

  const asset = await ensureSharedFileAssetForTask(db, legacyTask)
  const reference = await bindSharedFileToVersion(db, {
    versionId,
    sharedFileAssetId: asset.id,
    originalFileName: legacyTask.originalFileName,
    uploadedByUserId: uploadedByUserId ?? version.dictionary.userId,
  })

  const latestTask = await db.parseTask.findFirst({
    where: {
      versionId,
      sharedFileAssetId: asset.id,
    },
    orderBy: { createdAt: 'desc' },
  })

  return {
    reference,
    sharedFileAsset: asset,
    latestTask,
    isLegacyFallback: false,
  }
}
