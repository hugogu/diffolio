// Number normalization mappings
const CIRCLED_TO_ARABIC: Record<string, string> = {
  '①': '1', '②': '2', '③': '3', '④': '4', '⑤': '5',
  '⑥': '6', '⑦': '7', '⑧': '8', '⑨': '9', '⑩': '10',
  '⑪': '11', '⑫': '12', '⑬': '13', '⑭': '14', '⑮': '15',
  '⑯': '16', '⑰': '17', '⑱': '18', '⑲': '19', '⑳': '20',
}

const ROMAN_TO_ARABIC: Record<string, string> = {
  'Ⅰ': '1', 'Ⅱ': '2', 'Ⅲ': '3', 'Ⅳ': '4', 'Ⅴ': '5',
  'Ⅵ': '6', 'Ⅶ': '7', 'Ⅷ': '8', 'Ⅸ': '9', 'Ⅹ': '10',
  'ⅰ': '1', 'ⅱ': '2', 'ⅲ': '3', 'ⅳ': '4', 'ⅴ': '5',
  'ⅵ': '6', 'ⅶ': '7', 'ⅷ': '8', 'ⅸ': '9', 'ⅹ': '10',
}

const CJK_NUMBERS: Record<string, string> = {
  '一': '1', '二': '2', '三': '3', '四': '4', '五': '5',
  '六': '6', '七': '7', '八': '8', '九': '9', '十': '10',
}

/**
 * Expand symbols in text (e.g., ～ → headword)
 */
export function expandSymbols(
  text: string,
  headword: string,
  substitutionRules: Array<{ symbol: string; expandTo: string }>
): string {
  let result = text
  for (const rule of substitutionRules) {
    const replacement = rule.expandTo === 'headword' ? headword : rule.expandTo
    result = result.split(rule.symbol).join(replacement)
  }
  return result
}

/**
 * Normalize sense number to canonical arabic string
 */
export function normalizeSenseNumber(rawNum: string): string {
  const trimmed = rawNum.trim().replace(/[.、。]/g, '')

  // Check circled numbers
  if (CIRCLED_TO_ARABIC[trimmed]) return CIRCLED_TO_ARABIC[trimmed]

  // Check roman numerals
  if (ROMAN_TO_ARABIC[trimmed]) return ROMAN_TO_ARABIC[trimmed]

  // Check CJK numbers
  if (CJK_NUMBERS[trimmed]) return CJK_NUMBERS[trimmed]

  // Standard arabic (possibly with trailing dot: "1." → "1")
  const arabic = trimmed.replace(/\D/g, '')
  if (arabic) return arabic

  return trimmed
}

/**
 * Normalize headword: trad→simp lookup, glyph variant canonicalization
 */
export function normalizeHeadword(
  raw: string,
  tradSimpMap: Record<string, string>,
  glyphVariants: Array<{ canonical: string; variants: string[] }>
): string {
  let result = raw.trim()

  // Trad → simp
  result = result
    .split('')
    .map((ch) => tradSimpMap[ch] ?? ch)
    .join('')

  // Glyph variant → canonical
  for (const gv of glyphVariants) {
    for (const variant of gv.variants) {
      result = result.split(variant).join(gv.canonical)
    }
  }

  return result
}

/**
 * Normalize whitespace and punctuation in definition/example text
 */
export function normalizeText(text: string): string {
  return text.trim().replace(/\s+/g, ' ')
}

/**
 * Normalize phonetic transcription (pinyin): convert full-width ASCII characters
 * to their half-width equivalents (U+FF01–FF5E → U+0021–007E).
 */
export function normalizePhonetic(phonetic: string | undefined): string | undefined {
  if (!phonetic) return phonetic
  return phonetic.replace(/[\uff01-\uff5e]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
}

/**
 * Strip text down to a canonical form for comparison purposes only.
 * Removes all whitespace and normalizes full-width / Chinese punctuation
 * to their half-width / ASCII equivalents so that differences in
 * punctuation style between editions do not trigger false DEFINITION_CHANGED.
 *
 * Do NOT use for display — stored text is preserved as-is.
 */
export function stripForComparison(text: string): string {
  // Canonical Unicode form first (composed, e.g. é as one code point)
  let s = text.normalize('NFC')
  // Strip invisible/zero-width characters that are NOT matched by \s:
  //   U+00AD SOFT HYPHEN, U+200B ZERO WIDTH SPACE, U+200C ZERO WIDTH NON-JOINER,
  //   U+200D ZERO WIDTH JOINER, U+2060 WORD JOINER, U+FEFF BOM / ZERO WIDTH NO-BREAK SPACE
  s = s.replace(/[\u00ad\u200b\u200c\u200d\u2060\ufeff]/g, '')
  // Full-width ASCII variants (U+FF01 ！ … U+FF5E ～) → half-width ASCII
  // Covers ！＂＃＄％＆＇（）＊＋，－．／０-９：；＜＝＞？＠Ａ-Ｚ［＼］＾＿｀ａ-ｚ｛｜｝～
  s = s.replace(/[\uff01-\uff5e]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
  // Chinese-specific punctuation that has no full-width ASCII counterpart
  s = s
    .replace(/\u3001/g, ',')                      // 、enumeration comma
    .replace(/\u3002/g, '.')                      // 。period
    .replace(/\u3008/g, '<')                      // 〈
    .replace(/\u3009/g, '>')                      // 〉
    .replace(/[\u300a\u300b]/g, '"')              // 《》double angle quotes
    .replace(/[\u300c\u300d\u300e\u300f]/g, '"') // 「」『』corner brackets
    .replace(/\u3010/g, '[')                      // 【
    .replace(/\u3011/g, ']')                      // 】
    .replace(/[\u3014\u3016]/g, '(')              // 〔〖
    .replace(/[\u3015\u3017]/g, ')')              // 〕〗
    .replace(/[\u2018\u2019\u201a\u201b]/g, "'")  // ' ' ‚ ‛ curly/low single quotes
    .replace(/[\u201c\u201d\u201e\u201f\u301d\u301e\u301f]/g, '"') // " " „ ‟ 〝〞〟 curly/CJK double quotes
    .replace(/[\u2014\u2013]/g, '-')              // — em dash, – en dash
    .replace(/\u2026/g, '...')                    // … ellipsis
    .replace(/[\u00b7\u30fb\u2027]/g, '.')        // · ・ ‧ middle dots
    .replace(/\u3000/g, ' ')                      // 　ideographic space
  // Strip all whitespace (includes U+00A0, U+202F, U+2003 etc. covered by \s in ES2015+)
  s = s.replace(/\s+/g, '')
  return s
}
