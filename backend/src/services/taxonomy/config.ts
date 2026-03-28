import { z } from 'zod'
import safeRegex from 'safe-regex'

export interface TaxonomyFormatConfig {
  name: string
  level1Pattern: string
  level2Pattern: string
  level3Pattern: string
  level4Pattern: string
  headwordSeparator: string
  skipLinePatterns?: string[]
  tradSimpMap?: Record<string, string>
  textSanitization?: {
    enabled: boolean
    removeNullBytes?: boolean
    removeControlChars?: boolean
    customReplacements?: Array<{ pattern: string; replacement: string }>
  }
}

export interface CompiledTaxonomyConfig {
  level1Regex: RegExp
  level2Regex: RegExp
  level3Regex: RegExp
  level4Regex: RegExp
  headwordSeparator: string
  skipLineRegexes: RegExp[]
  tradSimpMap: Record<string, string>
  textSanitization: {
    enabled: boolean
    removeNullBytes: boolean
    removeControlChars: boolean
    customReplacements: Array<{ regex: RegExp; replacement: string }>
  }
  raw: TaxonomyFormatConfig
}

export interface TaxonomyConfigValidationResult {
  isValid: boolean
  errors: string[]
}

const TaxonomyFormatConfigSchema = z.object({
  name: z.string().min(1),
  level1Pattern: z.string().min(1),
  level2Pattern: z.string().min(1),
  level3Pattern: z.string().min(1),
  level4Pattern: z.string().min(1),
  headwordSeparator: z.string().min(1),
  skipLinePatterns: z.array(z.string()).optional(),
  tradSimpMap: z.record(z.string()).optional(),
  textSanitization: z.object({
    enabled: z.boolean(),
    removeNullBytes: z.boolean().optional(),
    removeControlChars: z.boolean().optional(),
    customReplacements: z.array(z.object({
      pattern: z.string(),
      replacement: z.string(),
    })).optional(),
  }).optional(),
})

export function validateTaxonomyConfig(raw: unknown): TaxonomyConfigValidationResult {
  const errors: string[] = []

  const zodResult = TaxonomyFormatConfigSchema.safeParse(raw)
  if (!zodResult.success) {
    for (const issue of zodResult.error.issues) {
      errors.push(`${issue.path.join('.')}: ${issue.message}`)
    }
    return { isValid: false, errors }
  }

  const config = zodResult.data
  const patterns: Array<{ field: string; pattern: string }> = [
    { field: 'level1Pattern', pattern: config.level1Pattern },
    { field: 'level2Pattern', pattern: config.level2Pattern },
    { field: 'level3Pattern', pattern: config.level3Pattern },
    { field: 'level4Pattern', pattern: config.level4Pattern },
    ...(config.skipLinePatterns ?? []).map((p, i) => ({ field: `skipLinePatterns[${i}]`, pattern: p })),
  ]

  for (const { field, pattern } of patterns) {
    try {
      new RegExp(pattern)
    } catch (e) {
      errors.push(`${field}: invalid regex: ${(e as Error).message}`)
      continue
    }
    if (!safeRegex(pattern)) {
      errors.push(`${field}: potentially catastrophic backtracking (ReDoS risk)`)
    }
  }

  return { isValid: errors.length === 0, errors }
}

export function compileTaxonomyConfig(raw: TaxonomyFormatConfig): CompiledTaxonomyConfig {
  const sanitization = raw.textSanitization
  const customReplacements = sanitization?.customReplacements?.map(r => ({
    regex: new RegExp(r.pattern, 'gu'),
    replacement: r.replacement,
  })) ?? []

  return {
    level1Regex: new RegExp(raw.level1Pattern, 'u'),
    level2Regex: new RegExp(raw.level2Pattern, 'u'),
    level3Regex: new RegExp(raw.level3Pattern, 'u'),
    level4Regex: new RegExp(raw.level4Pattern, 'u'),
    headwordSeparator: raw.headwordSeparator,
    skipLineRegexes: (raw.skipLinePatterns ?? []).map((p) => new RegExp(p, 'u')),
    tradSimpMap: raw.tradSimpMap ?? {},
    textSanitization: {
      enabled: sanitization?.enabled ?? true,
      removeNullBytes: sanitization?.removeNullBytes ?? true,
      removeControlChars: sanitization?.removeControlChars ?? true,
      customReplacements,
    },
    raw,
  }
}

export function normalizeHeadword(headword: string, tradSimpMap: Record<string, string>): string {
  let result = headword.trim()
  for (const [trad, simp] of Object.entries(tradSimpMap)) {
    result = result.split(trad).join(simp)
  }
  return result
}
