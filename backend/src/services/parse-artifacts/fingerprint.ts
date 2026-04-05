import crypto from 'node:crypto'
import { FileType } from '@prisma/client'
import { FormatConfigJson } from '../../lib/types/shared.js'
import {
  PARSER_FINGERPRINT_VERSION,
  SHARED_FILE_HASH_ALGORITHM,
} from '../../lib/types/shared-storage.js'

function stableJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => stableJsonValue(item))
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [key, stableJsonValue(nestedValue)])
    )
  }

  return value
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(stableJsonValue(value))
}

export function hashStableContent(value: unknown): string {
  return crypto
    .createHash(SHARED_FILE_HASH_ALGORITHM)
    .update(stableStringify(value))
    .digest('hex')
}

export function createConfigContentHash(configJson: FormatConfigJson): string {
  return hashStableContent(configJson)
}

export function createParserFingerprint(input: {
  fileType: FileType
  configJson: FormatConfigJson
  parserVersion?: string
}): string {
  return hashStableContent({
    parserVersion: input.parserVersion ?? PARSER_FINGERPRINT_VERSION,
    fileType: input.fileType,
    configJson: input.configJson,
  })
}
