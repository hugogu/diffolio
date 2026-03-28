import { apiFetch } from './client'

export interface ParsedExample {
  rawText: string
  normalizedText: string
}

export interface ParsedSense {
  rawNumber: string
  normalizedNumber: string
  rawDefinition: string
  definition: string
  grammaticalCat?: string
  register?: string
  examples: ParsedExample[]
}

export interface ParsedEntry {
  rawHeadword: string
  normalizedHeadword: string
  entrySequence?: number
  phonetic?: string
  lineNumber?: number
  crossReferences?: string[]
  senses: ParsedSense[]
}

export interface ParsePreviewError {
  rawText: string
  fieldName: string
  errorCode: string
  errorDetail: string
  lineNumber?: number
}

export interface ParsePreviewEntry {
  sourceLines: string[]
  entry: ParsedEntry
  errors: ParsePreviewError[]
}

export interface ParsePreviewResult {
  versionLabel: string
  fileName: string
  fileType: string
  totalLinesScanned: number
  entries: ParsePreviewEntry[]
}

export async function getParsePreview(
  versionId: string,
  maxEntries = 30,
  startIndex = 0
): Promise<ParsePreviewResult> {
  return apiFetch<ParsePreviewResult>(`/api/v1/versions/${versionId}/parse-preview`, {
    method: 'POST',
    body: JSON.stringify({ maxEntries, startIndex }),
  })
}
