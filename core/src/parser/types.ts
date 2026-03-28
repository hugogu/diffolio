export interface ParsedSense {
  rawNumber: string
  normalizedNumber: string
  rawDefinition: string
  definition: string
  phonetic?: string
  grammaticalCat?: string
  register?: string
  etymology?: string
  examples: Array<{ rawText: string; normalizedText: string }>
}

export interface ParsedEntry {
  rawHeadword: string
  normalizedHeadword: string
  entrySequence?: number
  phonetic?: string
  pageNumber?: number
  lineNumber?: number
  crossReferences?: string[]
  senses: ParsedSense[]
}

export interface ParseError {
  pageNumber?: number
  lineNumber?: number
  rawText: string
  fieldName: string
  errorCode: string
  errorDetail: string
}

export type ParseChunk = {
  entries: ParsedEntry[]
  errors: ParseError[]
  pageNumber?: number
}
