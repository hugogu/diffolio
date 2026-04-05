import path from 'node:path'
import { FileType } from '@prisma/client'

export const SHARED_FILE_HASH_ALGORITHM = 'sha256'
export const SHARED_STORAGE_NAMESPACE = 'shared'
export const STAGED_UPLOAD_NAMESPACE = '_incoming'
export const PARSER_FINGERPRINT_VERSION = 'shared-parse-v1'

export const FILE_TYPE_EXTENSIONS: Record<FileType, string> = {
  TXT: '.txt',
  DOC: '.doc',
  DOCX: '.docx',
  PDF: '.pdf',
  MDX: '.mdx',
}

export function normalizeFileExtension(extension?: string | null): string {
  if (!extension) return '.bin'
  const trimmed = extension.trim().toLowerCase()
  if (!trimmed) return '.bin'
  return trimmed.startsWith('.') ? trimmed : `.${trimmed}`
}

export function extensionFromFilename(filename: string): string {
  return normalizeFileExtension(path.extname(filename))
}

export function extensionForFileType(fileType: FileType): string {
  return FILE_TYPE_EXTENSIONS[fileType]
}
