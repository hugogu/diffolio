import { describe, it, expect } from 'vitest'
import { tryExtractInlineEntry } from '../../src/services/parser/inline-sense.js'
import { compileConfig } from '../../src/services/config-engine.js'
import type { FormatConfigJson } from '../../src/lib/types/shared.js'

const BASE_CONFIG: FormatConfigJson = {
  name: 'test',
  headwordPattern: '^([\\u4e00-\\u9fff]{1,4})',
  senseNumberPatterns: ['^([①②③④⑤])\\s*'],
  inlineEntryPattern: '^[\\[\\uff3b]([^\\]\\uff3d]{1,20})[\\]\\uff3d](?:\\(([^)]+)\\))?',
}

const config = compileConfig(BASE_CONFIG)

describe('tryExtractInlineEntry', () => {
  it('returns null when inlineEntryRegex is not configured', () => {
    const noInlineConfig = compileConfig({ ...BASE_CONFIG, inlineEntryPattern: undefined })
    expect(tryExtractInlineEntry('ā［腌臜］(ā·zā)〈方〉①形脏', noInlineConfig, 'ā')).toBeNull()
  })

  it('returns null when remainder has no bracketed sub-entry', () => {
    expect(tryExtractInlineEntry('ā〈方〉①形脏', config, 'ā')).toBeNull()
  })

  it('detects fullwidth bracket sub-entry with phonetic', () => {
    const result = tryExtractInlineEntry('ā［腌臜］(ā·zā)〈方〉①形脏', config, 'ā')
    expect(result).not.toBeNull()
    expect(result!.subRawHeadword).toBe('【腌臜】')
    expect(result!.subPhonetic).toBe('ā·zā')
    expect(result!.subRemainder).toBe('〈方〉①形脏')
  })

  it('detects ASCII bracket sub-entry with phonetic', () => {
    const result = tryExtractInlineEntry('ā[腌臜](ā·zā)〈方〉①形脏', config, 'ā')
    expect(result).not.toBeNull()
    expect(result!.subRawHeadword).toBe('【腌臜】')
    expect(result!.subPhonetic).toBe('ā·zā')
  })

  it('detects sub-entry without phonetic', () => {
    const result = tryExtractInlineEntry('ā［腌臜］〈方〉①形脏', config, 'ā')
    expect(result).not.toBeNull()
    expect(result!.subRawHeadword).toBe('【腌臜】')
    expect(result!.subPhonetic).toBeUndefined()
    expect(result!.subRemainder).toBe('〈方〉①形脏')
  })

  it('returns null when non-bracket content follows phonetic', () => {
    expect(tryExtractInlineEntry('ā别的内容', config, 'ā')).toBeNull()
  })

  it('handles missing phonetic parameter — bracket at start of remainder', () => {
    const result = tryExtractInlineEntry('［腌臜］(ā·zā)①形脏', config, undefined)
    expect(result).not.toBeNull()
    expect(result!.subRawHeadword).toBe('【腌臜】')
  })

  it('returns null when phonetic absent and bracket not at start', () => {
    // Content before bracket, no phonetic to strip — should not match
    expect(tryExtractInlineEntry('其他内容［腌臜］', config, undefined)).toBeNull()
  })

  it('matches bracket content even when it looks like a cross-reference note', () => {
    // The pattern does not distinguish between sub-entry headwords and other bracket
    // content — callers rely on the format guarantee that brackets in headword-line
    // remainders are always sub-entries in configs that set inlineEntryPattern.
    const result = tryExtractInlineEntry('ā［见腌臜］', config, 'ā')
    expect(result).not.toBeNull()
    expect(result!.subRawHeadword).toBe('【见腌臜】')
    // This is expected/acceptable behavior for this format
  })
})