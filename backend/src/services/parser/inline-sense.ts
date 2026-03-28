import { CompiledConfig } from '../config-engine.js'
import { normalizeSenseNumber, normalizeText, expandSymbols, normalizePhonetic } from '../normalizer.js'
import { ParsedSense } from './types.js'

/** Strip a register/usage label from the start of a definition string (e.g. "〈方〉", "〈口〉").
 *  Returns the captured label and the remaining text. */
export function extractRegister(text: string, registerRegex?: RegExp): { register?: string; rest: string } {
  if (!registerRegex) return { rest: text }
  const m = registerRegex.exec(text)
  if (!m) return { rest: text }
  return { register: (m[1] ?? m[0]).trim(), rest: text.slice(m[0].length) }
}

/** Strip a sense-level phonetic from the start of a definition string (e.g. "(Gē)" style).
 *  Returns the captured phonetic and the remaining text. */
export function extractSensePhonetic(text: string, sensePhoneticRegex?: RegExp): { phonetic?: string; rest: string } {
  if (!sensePhoneticRegex) return { rest: text }
  const m = sensePhoneticRegex.exec(text)
  if (!m) return { rest: text }
  return { phonetic: normalizePhonetic((m[1] ?? m[0]).trim()), rest: text.slice(m[0].length).trimStart() }
}

/** Strip an etymology note from the END of a definition string (e.g. "［梵 arhat］", "[波斯 ākhūnd]").
 *  Returns the captured etymology and the remaining text with the bracket stripped. */
export function extractEtymology(text: string, etymologyRegex?: RegExp): { etymology?: string; rest: string } {
  if (!etymologyRegex) return { rest: text }
  const m = etymologyRegex.exec(text)
  if (!m) return { rest: text }
  return { etymology: (m[1] ?? m[0]).trim(), rest: text.slice(0, m.index).trimEnd() }
}

export interface InlineEntryResult {
  subRawHeadword: string
  subPhonetic?: string
  subRemainder: string
}

/**
 * Checks whether the remainder of a headword line encodes an inline sub-entry
 * (e.g. "ā［腌臜］(ā·zā)〈方〉①...").
 *
 * Steps:
 *  1. Strips the main entry's phonetic prefix from the remainder using a length-based
 *     slice (same approach as extractInlineSenses — full-width→half-width is 1:1 in
 *     character count so phonetic.length equals the chars to skip). Known limitation:
 *     if the remainder has inconsistent normalization the strip may silently not apply
 *     and the function returns null.
 *  2. Tries matching config.inlineEntryRegex from the start of the stripped remainder.
 *     The pattern must be anchored with `^`; without it, exec() may match mid-string.
 *  3. Returns subRawHeadword (group 1), subPhonetic (group 2, optional), and the text
 *     after the match as subRemainder.
 *
 * Returns null when inlineEntryRegex is not configured or does not match.
 */
export function tryExtractInlineEntry(
  remainder: string,
  config: CompiledConfig,
  phonetic?: string
): InlineEntryResult | null {
  if (!config.inlineEntryRegex) return null

  let stripped = remainder.trimStart()
  if (phonetic && normalizePhonetic(stripped.slice(0, phonetic.length)) === phonetic) {
    stripped = stripped.slice(phonetic.length).trimStart()
  }

  const m = config.inlineEntryRegex.exec(stripped)
  if (!m) return null

  // Wrap sub-headword in 【】 to match the format of regular entries parsed by
  // headwordPattern (e.g. "【阿】"). Without these brackets, comparison fails
  // because normalizedHeadword won't match between inline and regular entries.
  return {
    subRawHeadword: '【' + m[1].trim() + '】',
    subPhonetic: m[2] ? normalizePhonetic(m[2].trim()) : undefined,
    subRemainder: stripped.slice(m[0].length).trimStart(),
  }
}

/** Strip a POS marker from the start of a definition string.
 *  Returns the captured POS label and the remaining definition text. */
export function extractPos(text: string, posRegex?: RegExp): { grammaticalCat?: string; rest: string } {
  if (!posRegex) return { rest: text }
  const m = posRegex.exec(text)
  if (!m) return { rest: text }
  return { grammaticalCat: (m[1] ?? m[0]).trim(), rest: text.slice(m[0].length) }
}

interface SenseMarker {
  index: number
  matchLength: number
  rawNumber: string
}

/**
 * Extracts inline senses from the remainder of a headword line.
 *
 * Handles two cases:
 *
 * 1. Numbered senses on same line (e.g. 紧凑格式 single-char entries):
 *      阿ā〈方〉前缀。①用在排行...②专用于...
 *    Scans for sense number markers and slices between them.
 *
 * 2. Single implicit sense (e.g. 紧凑格式 compound entries 词头 with no marker):
 *      【阿鼻地狱】ābídìyù佛教指最深层的地狱...
 *    When no markers found, strips the leading phonetic string (if known)
 *    and treats the remaining text as a single unnumbered sense.
 *
 * @param phonetic  The phonetic string already extracted from this entry.
 *                  Used to skip past it when falling back to implicit single sense.
 */
export function extractInlineSenses(
  remainder: string,
  config: CompiledConfig,
  normalizedHeadword: string,
  phonetic?: string
): ParsedSense[] {
  if (!remainder.trim()) return []

  const markers: SenseMarker[] = []

  for (const senseRegex of config.senseNumberRegexes) {
    // Strip leading ^ anchor — these patterns are designed for line-start matching,
    // but here we scan anywhere within the remainder of a headword line.
    const source = senseRegex.source.replace(/^\^/, '')
    const globalFlags = senseRegex.flags.includes('g')
      ? senseRegex.flags
      : senseRegex.flags + 'g'
    const globalRegex = new RegExp(source, globalFlags)

    let m: RegExpExecArray | null
    while ((m = globalRegex.exec(remainder)) !== null) {
      markers.push({
        index: m.index,
        matchLength: m[0].length,
        rawNumber: m[1] ?? m[0],
      })
    }
  }

  // Fallback: no sense number markers found — treat remainder as an implicit single sense.
  // Strip the leading phonetic string first so it isn't included in the definition.
  if (markers.length === 0) {
    let defText = remainder.trimStart()
    // Compare normalized forms: phonetic has already been normalized (half-width),
    // but the remainder still carries the raw full-width characters.
    // Full-width→half-width is a 1:1 char mapping so the slice length is identical.
    if (phonetic && normalizePhonetic(defText.slice(0, phonetic.length)) === phonetic) {
      defText = defText.slice(phonetic.length).trimStart()
    }
    if (!defText.trim()) return []

    const rawDefinition = defText.trim()
    const { register, rest: afterRegister } = extractRegister(rawDefinition, config.registerRegex)
    const { phonetic: sensePhonetic, rest: afterPhonetic } = extractSensePhonetic(afterRegister, config.sensePhoneticRegex)
    const { grammaticalCat, rest: afterPos } = extractPos(afterPhonetic, config.posRegex)
    const { etymology, rest } = extractEtymology(afterPos, config.etymologyRegex)
    return [{
      rawNumber: '',
      normalizedNumber: '1',
      rawDefinition,
      definition: normalizeText(rest),
      phonetic: sensePhonetic,
      grammaticalCat,
      register,
      etymology,
      examples: [],
    }]
  }

  // Sort by position in string, remove duplicates (same position from multiple regexes)
  markers.sort((a, b) => a.index - b.index)
  const deduped = markers.filter((m, i) => i === 0 || m.index !== markers[i - 1].index)

  // Extract shared register/POS from the prefix before the first sense marker.
  // e.g. "āɡōnɡ〈方〉名①..." — after stripping phonetic the prefix is "〈方〉名",
  // which provides a shared register and grammaticalCat for all numbered senses.
  let sharedRegister: string | undefined
  let sharedGrammaticalCat: string | undefined
  {
    let prefix = remainder.slice(0, deduped[0].index).trimStart()
    if (phonetic && normalizePhonetic(prefix.slice(0, phonetic.length)) === phonetic) {
      prefix = prefix.slice(phonetic.length).trimStart()
    }
    if (prefix) {
      const { register: r, rest: afterReg } = extractRegister(prefix, config.registerRegex)
      if (r) sharedRegister = r
      const { grammaticalCat: g } = extractPos(afterReg, config.posRegex)
      if (g) sharedGrammaticalCat = g
    }
  }

  return deduped.map((marker, i) => {
    const nextStart = deduped[i + 1]?.index ?? remainder.length
    const segment = remainder.slice(marker.index + marker.matchLength, nextStart).trim()

    const examples: Array<{ rawText: string; normalizedText: string }> = []
    let rawDefinition = segment

    // Step 1: split examples off the segment using the inter-example separator (e.g. ｜)
    let exParts: string[] = []
    if (config.raw.exampleSeparator && segment.includes(config.raw.exampleSeparator)) {
      const parts = segment.split(config.raw.exampleSeparator).filter(Boolean)
      rawDefinition = parts[0].trim()
      exParts = parts.slice(1).map((p) => p.trim()).filter(Boolean)
    }

    // Step 2: if an intro separator is configured (e.g. "："), split rawDefinition at its
    // last occurrence — the text after it is the first example (placed before the ｜-split ones).
    // Handles "释义：首例｜次例" where the colon introduces examples, not just separates them.
    // Only applies when ｜-separated examples were already found (exParts.length > 0), to avoid
    // incorrectly splitting definitions that contain "：" as punctuation but have no examples.
    if (exParts.length > 0 && config.raw.exampleIntroSeparator && rawDefinition.includes(config.raw.exampleIntroSeparator)) {
      const introSep = config.raw.exampleIntroSeparator
      const idx = rawDefinition.lastIndexOf(introSep)
      const firstEx = rawDefinition.slice(idx + introSep.length).trim()
      if (firstEx) {
        rawDefinition = rawDefinition.slice(0, idx).trim()
        exParts.unshift(firstEx)
      }
    }

    for (const rawText of exParts) {
      const normalizedText = expandSymbols(
        normalizeText(rawText),
        normalizedHeadword,
        config.substitutionRules
      )
      examples.push({ rawText, normalizedText })
    }

    const { register: senseRegister, rest: afterRegister } = extractRegister(rawDefinition, config.registerRegex)
    const { phonetic: sensePhonetic, rest: afterPhonetic } = extractSensePhonetic(afterRegister, config.sensePhoneticRegex)
    const { grammaticalCat: senseGrammaticalCat, rest: afterPos } = extractPos(afterPhonetic, config.posRegex)
    const { etymology, rest } = extractEtymology(afterPos, config.etymologyRegex)
    return {
      rawNumber: marker.rawNumber,
      normalizedNumber: normalizeSenseNumber(marker.rawNumber),
      rawDefinition,
      definition: normalizeText(rest),
      phonetic: sensePhonetic,
      grammaticalCat: senseGrammaticalCat ?? sharedGrammaticalCat,
      register: senseRegister ?? sharedRegister,
      etymology,
      examples,
    }
  })
}
