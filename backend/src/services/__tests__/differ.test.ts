import { describe, it, expect } from 'vitest'
import { diffSenses } from '../differ.js'

type SenseInput = Parameters<typeof diffSenses>[0][number]

function makeSense(overrides: Partial<SenseInput> = {}): SenseInput {
  return {
    id: 'sense-1',
    normalizedNumber: '1',
    definition: '示例定义',
    phonetic: null,
    grammaticalCat: null,
    register: null,
    examples: [],
    ...overrides,
  }
}

describe('diffSenses punctuation-width normalization', () => {
  it('treats definition full-width vs half-width punctuation as MATCHED', () => {
    const results = diffSenses(
      [makeSense({ definition: '这个用法很常见！' })],
      [makeSense({ definition: '这个用法很常见!' })]
    )

    expect(results).toHaveLength(1)
    expect(results[0].changeType).toBe('MATCHED')
  })

  it('treats register and POS punctuation-width differences as MATCHED', () => {
    const results = diffSenses(
      [makeSense({ register: '〈方〉', grammaticalCat: '名.' })],
      [makeSense({ register: '<方>', grammaticalCat: '名．' })]
    )

    expect(results).toHaveLength(1)
    expect(results[0].changeType).toBe('MATCHED')
  })
})
