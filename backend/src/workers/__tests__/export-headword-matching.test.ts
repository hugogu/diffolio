import { describe, it, expect } from 'vitest'

/**
 * Test normalizedHeadword matching logic between taxonomy entries and comparison alignments.
 * 
 * The issue: comparison alignments may have normalizedHeadword with brackets like "【阿鼻地狱】",
 * while taxonomy entries have normalizedHeadword without brackets like "阿鼻地狱".
 * 
 * The export worker should match both formats.
 */

interface Alignment {
  normalizedHeadword: string
  changeType: string
}

function findAlignment(
  alignmentMap: Map<string, Alignment>,
  normalizedHeadword: string
): Alignment | undefined {
  // Try both formats: with and without 【】 brackets
  let alignment = alignmentMap.get(normalizedHeadword)
  if (!alignment) {
    // Try with brackets
    alignment = alignmentMap.get(`【${normalizedHeadword}】`)
  }
  return alignment
}

describe('normalizedHeadword matching for taxonomy export', () => {
  it('matches exact normalizedHeadword without brackets', () => {
    const alignmentMap = new Map<string, Alignment>([
      ['人', { normalizedHeadword: '人', changeType: 'MATCHED' }],
      ['人口', { normalizedHeadword: '人口', changeType: 'MATCHED' }],
    ])

    const result = findAlignment(alignmentMap, '人')
    expect(result).toBeDefined()
    expect(result?.normalizedHeadword).toBe('人')
  })

  it('matches taxonomy entry without brackets to alignment with brackets', () => {
    const alignmentMap = new Map<string, Alignment>([
      ['【阿鼻地狱】', { normalizedHeadword: '【阿鼻地狱】', changeType: 'MATCHED' }],
      ['【阿昌族】', { normalizedHeadword: '【阿昌族】', changeType: 'ADDED' }],
    ])

    // Taxonomy entry doesn't have brackets
    const result = findAlignment(alignmentMap, '阿鼻地狱')
    expect(result).toBeDefined()
    expect(result?.normalizedHeadword).toBe('【阿鼻地狱】')
  })

  it('returns undefined when no match found in either format', () => {
    const alignmentMap = new Map<string, Alignment>([
      ['【阿昌族】', { normalizedHeadword: '【阿昌族】', changeType: 'ADDED' }],
    ])

    const result = findAlignment(alignmentMap, '不存在')
    expect(result).toBeUndefined()
  })

  it('handles mixed bracket styles in same map', () => {
    const alignmentMap = new Map<string, Alignment>([
      ['人', { normalizedHeadword: '人', changeType: 'MATCHED' }],
      ['【阿昌族】', { normalizedHeadword: '【阿昌族】', changeType: 'ADDED' }],
      ['劳动力', { normalizedHeadword: '劳动力', changeType: 'DELETED' }],
    ])

    // Without brackets - matches directly
    expect(findAlignment(alignmentMap, '人')?.normalizedHeadword).toBe('人')
    expect(findAlignment(alignmentMap, '劳动力')?.normalizedHeadword).toBe('劳动力')

    // With brackets - falls back to bracketed version
    expect(findAlignment(alignmentMap, '阿昌族')?.normalizedHeadword).toBe('【阿昌族】')

    // Non-existent
    expect(findAlignment(alignmentMap, '不存在')).toBeUndefined()
  })

  it('prefers exact match over bracketed fallback', () => {
    const alignmentMap = new Map<string, Alignment>([
      ['人', { normalizedHeadword: '人', changeType: 'MATCHED' }],
      ['【人】', { normalizedHeadword: '【人】', changeType: 'ADDED' }],
    ])

    // Should prefer exact match without brackets
    const result = findAlignment(alignmentMap, '人')
    expect(result?.normalizedHeadword).toBe('人')
    expect(result?.changeType).toBe('MATCHED')
  })

  it('handles real-world taxonomy categories', () => {
    // Simulating actual data from the system
    const taxonomyEntries = [
      { headword: '人', normalizedHeadword: '人' },
      { headword: '人丁', normalizedHeadword: '人丁' },
      { headword: '人口', normalizedHeadword: '人口' },
      { headword: '阿鼻地狱', normalizedHeadword: '阿鼻地狱' },
      { headword: '阿昌族', normalizedHeadword: '阿昌族' },
    ]

    const alignmentMap = new Map<string, Alignment>([
      ['人', { normalizedHeadword: '人', changeType: 'MATCHED' }],
      ['【阿鼻地狱】', { normalizedHeadword: '【阿鼻地狱】', changeType: 'MATCHED' }],
      ['【阿昌族】', { normalizedHeadword: '【阿昌族】', changeType: 'ADDED' }],
    ])

    // All entries should find matches
    const results = taxonomyEntries.map(entry => ({
      headword: entry.headword,
      alignment: findAlignment(alignmentMap, entry.normalizedHeadword),
    }))

    expect(results[0].alignment).toBeDefined() // 人
    expect(results[1].alignment).toBeUndefined() // 人丁 (no match in alignments)
    expect(results[2].alignment).toBeUndefined() // 人口 (no match in alignments)
    expect(results[3].alignment).toBeDefined() // 阿鼻地狱 (matches 【阿鼻地狱】)
    expect(results[4].alignment).toBeDefined() // 阿昌族 (matches 【阿昌族】)
  })
})
