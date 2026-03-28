import { z } from 'zod'
import safeRegex from 'safe-regex'
import deepmerge from 'deepmerge'
import { FormatConfigJson } from '../lib/types/shared.js'

// Zod schema for FormatConfig JSON
const SubstitutionRuleSchema = z.object({
  symbol: z.string(),
  expandTo: z.string(),
})

const GlyphVariantSchema = z.object({
  canonical: z.string(),
  variants: z.array(z.string()),
})

const FormatConfigSchema = z.object({
  name: z.string().min(1),
  headwordPattern: z.string().min(1),
  senseNumberPatterns: z.array(z.string()).min(1),
  phoneticPattern: z.string().optional(),
  posPattern: z.string().optional(),
  sensePhoneticPattern: z.string().optional(),
  headwordVariantSuffixPattern: z.string().optional(),
  entrySequencePattern: z.string().optional(),
  exampleSeparator: z.string().optional(),
  exampleIntroSeparator: z.string().optional(),
  skipLinePatterns: z.array(z.string()).optional(),
  crossReferencePattern: z.string().optional(),
  registerPattern: z.string().optional(),
  etymologyPattern: z.string().optional(),
  inlineEntryPattern: z.string().optional(),
  substitutionRules: z.array(SubstitutionRuleSchema).optional(),
  glyphVariants: z.array(GlyphVariantSchema).optional(),
  tradSimpMap: z.record(z.string()).optional(),
  parentConfigId: z.string().uuid().optional(),
})

export interface ConfigValidationResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
}

export interface CompiledConfig {
  headwordRegex: RegExp
  senseNumberRegexes: RegExp[]
  phoneticRegex?: RegExp
  posRegex?: RegExp
  sensePhoneticRegex?: RegExp
  headwordVariantSuffixRegex?: RegExp
  entrySequenceRegex?: RegExp
  skipLineRegexes: RegExp[]
  crossReferenceRegex?: RegExp
  registerRegex?: RegExp
  etymologyRegex?: RegExp
  inlineEntryRegex?: RegExp
  substitutionRules: Array<{ symbol: string; expandTo: string }>
  glyphVariants: Array<{ canonical: string; variants: string[] }>
  tradSimpMap: Record<string, string>
  raw: FormatConfigJson
}

// Cache for compiled configs
const compileCache = new Map<string, CompiledConfig>()

function cacheKey(configJson: FormatConfigJson): string {
  return JSON.stringify(configJson)
}

export function validateConfig(raw: unknown): ConfigValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // Zod validation
  const zodResult = FormatConfigSchema.safeParse(raw)
  if (!zodResult.success) {
    for (const issue of zodResult.error.issues) {
      errors.push(`${issue.path.join('.')}: ${issue.message}`)
    }
    return { isValid: false, errors, warnings }
  }

  const config = zodResult.data

  // ReDoS check on all regex patterns
  const patterns: Array<{ field: string; pattern: string }> = [
    { field: 'headwordPattern', pattern: config.headwordPattern },
    ...config.senseNumberPatterns.map((p, i) => ({
      field: `senseNumberPatterns[${i}]`,
      pattern: p,
    })),
  ]

  if (config.phoneticPattern) {
    patterns.push({ field: 'phoneticPattern', pattern: config.phoneticPattern })
  }
  if (config.posPattern) {
    patterns.push({ field: 'posPattern', pattern: config.posPattern })
  }
  if (config.sensePhoneticPattern) {
    patterns.push({ field: 'sensePhoneticPattern', pattern: config.sensePhoneticPattern })
  }
  if (config.headwordVariantSuffixPattern) {
    patterns.push({ field: 'headwordVariantSuffixPattern', pattern: config.headwordVariantSuffixPattern })
  }
  if (config.crossReferencePattern) {
    patterns.push({ field: 'crossReferencePattern', pattern: config.crossReferencePattern })
  }
  if (config.registerPattern) {
    patterns.push({ field: 'registerPattern', pattern: config.registerPattern })
  }
  if (config.etymologyPattern) {
    patterns.push({ field: 'etymologyPattern', pattern: config.etymologyPattern })
  }
  if (config.inlineEntryPattern) {
    patterns.push({ field: 'inlineEntryPattern', pattern: config.inlineEntryPattern })
  }
  for (const [i, p] of (config.skipLinePatterns ?? []).entries()) {
    patterns.push({ field: `skipLinePatterns[${i}]`, pattern: p })
  }

  for (const { field, pattern } of patterns) {
    // Test regex is valid
    try {
      new RegExp(pattern)
    } catch (e) {
      errors.push(`${field}: invalid regex: ${(e as Error).message}`)
      continue
    }

    // Check for ReDoS
    if (!safeRegex(pattern)) {
      errors.push(`${field}: potentially catastrophic backtracking (ReDoS risk) — simplify the pattern`)
    }
  }

  return { isValid: errors.length === 0, errors, warnings }
}

export function resolveInheritance(
  childConfig: Record<string, unknown>,
  parentConfigJson: Record<string, unknown>
): Record<string, unknown> {
  // Deep merge: child values override parent
  return deepmerge(parentConfigJson, childConfig, {
    arrayMerge: (_dest, source) => source, // child arrays fully replace parent arrays
  })
}

export function compileConfig(configJson: FormatConfigJson): CompiledConfig {
  const key = cacheKey(configJson)
  if (compileCache.has(key)) {
    return compileCache.get(key)!
  }

  const headwordRegex = new RegExp(configJson.headwordPattern, 'u')
  const senseNumberRegexes = configJson.senseNumberPatterns.map((p) => new RegExp(p, 'u'))
  const phoneticRegex = configJson.phoneticPattern ? new RegExp(configJson.phoneticPattern, 'u') : undefined
  const posRegex = configJson.posPattern ? new RegExp(configJson.posPattern, 'u') : undefined
  const sensePhoneticRegex = configJson.sensePhoneticPattern
    ? new RegExp(configJson.sensePhoneticPattern, 'u')
    : undefined
  const headwordVariantSuffixRegex = configJson.headwordVariantSuffixPattern
    ? new RegExp(configJson.headwordVariantSuffixPattern, 'u')
    : undefined
  const entrySequenceRegex = configJson.entrySequencePattern
    ? new RegExp(configJson.entrySequencePattern, 'u')
    : undefined
  const skipLineRegexes = (configJson.skipLinePatterns ?? []).map((p) => new RegExp(p, 'u'))
  const crossReferenceRegex = configJson.crossReferencePattern
    ? new RegExp(configJson.crossReferencePattern, 'u')
    : undefined
  const registerRegex = configJson.registerPattern
    ? new RegExp(configJson.registerPattern, 'u')
    : undefined
  const etymologyRegex = configJson.etymologyPattern
    ? new RegExp(configJson.etymologyPattern, 'u')
    : undefined
  const inlineEntryRegex = configJson.inlineEntryPattern
    ? new RegExp(configJson.inlineEntryPattern, 'u')
    : undefined

  const compiled: CompiledConfig = {
    headwordRegex,
    senseNumberRegexes,
    phoneticRegex,
    sensePhoneticRegex,
    posRegex,
    headwordVariantSuffixRegex,
    entrySequenceRegex,
    skipLineRegexes,
    crossReferenceRegex,
    registerRegex,
    etymologyRegex,
    inlineEntryRegex,
    substitutionRules: configJson.substitutionRules ?? [],
    glyphVariants: configJson.glyphVariants ?? [],
    tradSimpMap: configJson.tradSimpMap ?? {},
    raw: configJson,
  }

  compileCache.set(key, compiled)
  return compiled
}
