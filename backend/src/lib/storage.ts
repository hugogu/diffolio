import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { randomUUID } from 'node:crypto'
import {
  SHARED_FILE_HASH_ALGORITHM,
  SHARED_STORAGE_NAMESPACE,
  STAGED_UPLOAD_NAMESPACE,
  normalizeFileExtension,
} from './types/shared-storage.js'

const storageType = process.env.FILE_STORAGE_TYPE ?? 'local'
const localPath = process.env.FILE_STORAGE_LOCAL_PATH ?? '/data/uploads'

export interface StagedSharedUpload {
  tempFilePath: string
  contentHash: string
  fileSize: number
  originalExtension: string
  canonicalStoragePath: string
}

function ensureLocalDirectory(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true })
}

function assertLocalStorage(): void {
  if (storageType !== 'local') {
    throw new Error(`Storage type '${storageType}' not implemented`)
  }
}

export function resolveStorageRoot(): string {
  assertLocalStorage()
  ensureLocalDirectory(localPath)
  return localPath
}

export function resolveLegacyUploadPath(filename: string): string {
  return path.join(resolveStorageRoot(), filename)
}

export function resolveSharedStoragePath(contentHash: string, originalExtension?: string): string {
  const ext = normalizeFileExtension(originalExtension)
  return path.join(
    resolveStorageRoot(),
    SHARED_STORAGE_NAMESPACE,
    contentHash.slice(0, 2),
    contentHash.slice(2, 4),
    `${contentHash}${ext}`
  )
}

export async function stageSharedUpload(
  stream: Readable,
  filename: string
): Promise<StagedSharedUpload> {
  const storageRoot = resolveStorageRoot()
  const incomingDir = path.join(storageRoot, STAGED_UPLOAD_NAMESPACE)
  ensureLocalDirectory(incomingDir)

  const tempFilePath = path.join(incomingDir, `${Date.now()}-${randomUUID()}.upload`)
  const hash = crypto.createHash(SHARED_FILE_HASH_ALGORITHM)
  const out = fs.createWriteStream(tempFilePath)
  let fileSize = 0

  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    hash.update(buffer)
    fileSize += buffer.length

    if (!out.write(buffer)) {
      await new Promise<void>((resolve, reject) => {
        out.once('drain', resolve)
        out.once('error', reject)
      })
    }
  }

  await new Promise<void>((resolve, reject) => {
    out.once('finish', resolve)
    out.once('error', reject)
    out.end()
  })

  const originalExtension = path.extname(filename)
  const contentHash = hash.digest('hex')

  return {
    tempFilePath,
    contentHash,
    fileSize,
    originalExtension,
    canonicalStoragePath: resolveSharedStoragePath(contentHash, originalExtension),
  }
}

export async function promoteStagedSharedUpload(
  stagedUpload: StagedSharedUpload
): Promise<{ storagePath: string; reusedExistingAsset: boolean }> {
  const { tempFilePath, canonicalStoragePath } = stagedUpload
  ensureLocalDirectory(path.dirname(canonicalStoragePath))

  if (fileExists(canonicalStoragePath)) {
    fs.unlinkSync(tempFilePath)
    return { storagePath: canonicalStoragePath, reusedExistingAsset: true }
  }

  fs.renameSync(tempFilePath, canonicalStoragePath)
  return { storagePath: canonicalStoragePath, reusedExistingAsset: false }
}

export function discardStagedUpload(tempFilePath: string): void {
  if (fileExists(tempFilePath)) {
    fs.unlinkSync(tempFilePath)
  }
}

export async function saveFile(
  stream: Readable,
  filename: string
): Promise<string> {
  if (storageType === 'local') {
    const dest = resolveLegacyUploadPath(filename)
    const out = fs.createWriteStream(dest)
    await pipeline(stream, out)
    return dest
  }
  throw new Error(`Storage type '${storageType}' not implemented`)
}

export function getFileStream(filePath: string): fs.ReadStream {
  if (storageType === 'local') {
    return fs.createReadStream(filePath)
  }
  throw new Error(`Storage type '${storageType}' not implemented`)
}

export function fileExists(filePath: string): boolean {
  try {
    fs.accessSync(filePath)
    return true
  } catch {
    return false
  }
}

export function deleteFile(filePath: string): boolean {
  try {
    fs.unlinkSync(filePath)
    return true
  } catch {
    return false
  }
}
