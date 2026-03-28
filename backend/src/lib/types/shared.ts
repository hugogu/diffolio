// Shared TypeScript types matching contracts/openapi.yaml schemas

export interface Pagination {
  items: unknown[]
  nextCursor: string | null
  hasMore: boolean
  total?: number
}

export interface PaginatedResponse<T> {
  items: T[]
  nextCursor: string | null
  hasMore: boolean
  total?: number
}

// Auth
export interface UserSummary {
  id: string
  username: string
  role: 'ADMIN' | 'READER'
}

// Dictionary
export interface DictionaryDto {
  id: string
  name: string
  publisher: string
  language: string
  encodingScheme: string
  description?: string | null
  createdAt: string
  updatedAt: string
  versionCount?: number
}

export interface CreateDictionaryInput {
  name: string
  publisher: string
  language?: string
  encodingScheme: string
  description?: string
}

// DictionaryVersion
export interface DictionaryVersionDto {
  id: string
  dictionaryId: string
  label: string
  publishedYear?: number | null
  notes?: string | null
  createdAt: string
  updatedAt: string
  formatConfigStatus?: 'PENDING' | 'VALID' | 'INVALID' | null
}

export interface CreateVersionInput {
  label: string
  publishedYear?: number
  notes?: string
}

// FormatConfig
export interface FormatConfigSummary {
  id: string
  versionId: string
  name: string
  validationStatus: 'PENDING' | 'VALID' | 'INVALID'
  validationReport?: unknown
  createdAt: string
  updatedAt: string
}

// FormatConfig JSON structure
export interface SubstitutionRule {
  symbol: string
  expandTo: string  // e.g. "headword" to expand ～ → headword
}

export interface GlyphVariant {
  canonical: string
  variants: string[]
}

export interface FormatConfigJson {
  name: string
  headwordPattern: string
  senseNumberPatterns: string[]
  phoneticPattern?: string
  /** Regex with one capture group matching the POS marker at the start of a sense definition.
   *  e.g. "^(名|动|形|副)\\s*" for bare markers, or "^\\{([^}]+)\\}\\s*" for {名} style. */
  posPattern?: string
  /** Regex with one capture group matching a sense-level phonetic that appears at the start of an
   *  individual sense segment (after any register label), e.g. "^\\(([^)]+)\\)\\s*" for "(Gē)" style.
   *  Stripped before POS extraction; stored as a separate `phonetic` field on the sense. */
  sensePhoneticPattern?: string
  /** Regex matching a variant-form annotation that immediately follows the headword, e.g. "\\([^)]+\\)"
   *  matches both "(呵)" (5th edition) and "(*強、*彊)" (7th edition, * marks each variant).
   *  When matched at the start of the remainder after headword extraction, the suffix is silently
   *  skipped so that phonetic stripping and POS/sense extraction work correctly.
   *  Also stripped from rawHeadword when the headword regex embeds the suffix in its full match. */
  headwordVariantSuffixPattern?: string
  /** Regex with one capture group matching the entry sequence number at the end of the headword,
   *  e.g. "\\d+$" for "蔼1", "蔼2", "埃1", "埃2" style used in 现代汉语词典 5th/7th editions.
   *  The captured number is stored as entrySequence field to distinguish homograph entries. */
  entrySequencePattern?: string
  exampleSeparator?: string
  /** Character (or short string) that separates the definition text from the first
   *  inline example, e.g. "：" in "有亲昵的意味：～大｜～宝｜～唐".
   *  When set, the parser splits rawDefinition at the last occurrence of this string
   *  and moves the post-separator fragment to the front of the examples list. */
  exampleIntroSeparator?: string
  /** Lines matching any of these patterns are silently skipped (e.g. phonetic section headers like "á(丫)"). */
  skipLinePatterns?: string[]
  /** Regex with one capture group for cross-reference ("另见") lines. The capture becomes a crossReferences entry on the entry. */
  crossReferencePattern?: string
  /** Regex with one capture group matching a usage/register label at the start of a sense definition (e.g. "〈方〉", "〈口〉").
   *  Stripped before POS extraction; stored as a separate `register` field on the sense. */
  registerPattern?: string
  /** Regex with one capture group matching an etymology note at the END of a sense definition,
   *  e.g. "[\\[\\uff3b]([^\\]\\uff3d]{1,80})[\\]\\uff3d]\\s*$" matches both "［梵 arhat］" and "[波斯 ākhūnd]".
   *  Stripped from the definition and stored as a separate `etymology` field on the sense. */
  etymologyPattern?: string
  /** Regex with two capture groups, matched against the remainder of a headword line
   *  **after** the main entry's phonetic has been stripped.
   *  Group 1: sub-entry headword text (e.g. "腌臜").
   *  Group 2 (optional): sub-entry phonetic in ASCII parentheses (e.g. "ā·zā").
   *    Note: ASCII `(...)` for phonetic is safe alongside `headwordVariantSuffixPattern`
   *    because that pattern additionally requires CJK content inside the parentheses.
   *  When matched, the text following the full match becomes the sub-entry's sense content.
   *  The main (character) entry is emitted with no senses; the sub-entry becomes the new
   *  current entry and its senses are parsed normally.
   *  Note: the pattern is applied only to headword-line remainders, not to sense definition
   *  text, so it does not conflict with `etymologyPattern` (which is end-anchored on
   *  definition text). The caller is responsible for ensuring the pattern only matches
   *  genuine sub-entry brackets in the headword line format.
   *  If the pattern has no second capture group, `match[2]` will be `undefined` and no
   *  sub-entry phonetic is stored (treated as an entry with unknown phonetic). */
  inlineEntryPattern?: string
  substitutionRules?: SubstitutionRule[]
  glyphVariants?: GlyphVariant[]
  tradSimpMap?: Record<string, string>
  parentConfigId?: string
}

// ParseTask
export interface ParseTaskDto {
  id: string
  versionId: string
  status: 'PENDING' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'FAILED' | 'CANCELLED'
  fileType: 'TXT' | 'DOC' | 'DOCX' | 'PDF' | 'MDX'
  originalFileName: string
  totalPages?: number | null
  totalEntries?: number | null
  processedPages: number
  processedEntries: number
  failedEntries: number
  checkpointOffset: number
  startedAt?: string | null
  completedAt?: string | null
  createdAt: string
  updatedAt: string
}

// ParseError
export interface ParseErrorDto {
  id: string
  taskId: string
  pageNumber?: number | null
  lineNumber?: number | null
  rawText: string
  fieldName: string
  errorCode: string
  errorDetail: string
  status: 'PENDING' | 'CORRECTED' | 'COMMITTED' | 'DISMISSED'
  correctedText?: string | null
  correctedAt?: string | null
  createdAt: string
}

// Entry
export interface SenseDto {
  id: string
  rawNumber: string
  normalizedNumber: string
  definition: string
  rawDefinition: string
  grammaticalCat?: string | null
  register?: string | null
  position: number
  examples: ExampleDto[]
}

export interface ExampleDto {
  id: string
  rawText: string
  normalizedText: string
  position: number
}

export interface EntryDto {
  id: string
  versionId: string
  rawHeadword: string
  normalizedHeadword: string
  phonetic?: string | null
  pageNumber?: number | null
  lineNumber?: number | null
  crossReferences?: string[] | null
  senses: SenseDto[]
}

// Comparison
export interface ComparisonDto {
  id: string
  versionAId: string
  versionBId: string
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED'
  totalA?: number | null
  totalB?: number | null
  matched?: number | null
  addedInB?: number | null
  deletedFromA?: number | null
  definitionChanged?: number | null
  createdAt: string
  completedAt?: string | null
}

export interface EntryAlignmentDto {
  id: string
  comparisonId: string
  changeType: 'MATCHED' | 'ADDED' | 'DELETED' | 'MATCHED_VARIANT'
  alignScore?: number | null
  entryA?: EntryDto | null
  entryB?: EntryDto | null
  senseDiffs?: SenseDiffSummary[]
}

export interface SenseDiffSummary {
  id: string
  senseAId?: string | null
  senseBId?: string | null
  changeType: 'MATCHED' | 'DEFINITION_CHANGED' | 'POS_CHANGED' | 'EXAMPLE_CHANGED' | 'RENUMBERED' | 'SPLIT' | 'MERGED' | 'ADDED' | 'DELETED'
  diffSummary?: unknown
}

// Search
export interface HeadwordTimelineEntry {
  dictionaryId: string
  dictionaryName: string
  versionId: string
  versionLabel: string
  publishedYear?: number | null
  entry: EntryDto
}

// Batch diff
export interface BatchDiffRequest {
  headwords: string[]
  versionAId: string
  versionBId: string
}

export interface BatchDiffResponse {
  headword: string
  foundInA: boolean
  foundInB: boolean
  diff?: EntryAlignmentDto | null
}

// Export
export interface ExportJobDto {
  id: string
  comparisonId: string
  format: 'EXCEL'
  status: 'PENDING' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'FAILED' | 'CANCELLED'
  downloadUrl?: string | null
  expiresAt?: string | null
  createdAt: string
  completedAt?: string | null
}

// API error
export interface ApiErrorResponse {
  code: string
  message: string
  details?: unknown
}
