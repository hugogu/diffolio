import { describe, it, expect } from 'vitest'
import { parseTxt } from '../../src/services/parser/txt.parser.js'
import { compileConfig } from '../../src/services/config-engine.js'
import type { FormatConfigJson } from '../../src/lib/types/shared.js'
import { writeFileSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const XHD5_CONFIG: FormatConfigJson = {
  name: 'xhd5-test',
  headwordPattern: '^(?:【[^】]{1,20}】|[\\u4e00-\\u9fff\\u3400-\\u4dbf]{1,4}[1-9]?|\\(([\\u4e00-\\u9fff\\u3400-\\u4dbf]{1,4})\\))',
  senseNumberPatterns: ['^([①②③④⑤⑥⑦⑧⑨⑩])\\s*'],
  phoneticPattern: '(?:】|[\\u4e00-\\u9fff\\u3400-\\u4dbf]|\\))([a-zA-Zāáǎàōóǒòēéěèīíǐìūúǔùǖǘǚǜ·\'\\u00b7 ]{1,40})',
  inlineEntryPattern: '^[\\[\\uff3b]([^\\]\\uff3d]{1,20})[\\]\\uff3d](?:\\(([^)]+)\\))?',
  registerPattern: '^(〈[^〉]{1,10}〉)\\s*',
  crossReferencePattern: '^另见(.+)',
  substitutionRules: [{ symbol: '～', expandTo: 'headword' }],
}

type Entry = {
  rawHeadword: string
  phonetic?: string
  senses: Array<{ rawNumber: string; definition: string }>
  crossReferences?: string[]
}

async function collect(gen: AsyncGenerator<{ entries: unknown[]; errors: unknown[] }>) {
  const entries: unknown[] = []
  const errors: unknown[] = []
  for await (const chunk of gen) {
    entries.push(...chunk.entries)
    errors.push(...chunk.errors)
  }
  return { entries: entries as Entry[], errors }
}

describe('txt parser — inline sub-entry', () => {
  it('splits 字头+词条 line into two entries with cross-ref on char entry', async () => {
    const input = [
      '腌ā［腌臜］(ā·zā)〈方〉①形脏；不干净。②形(心里)别扭；不痛快。③动糟践；使难堪。',
      '另见1563页yān。',
    ].join('\n')

    const tmp = join(tmpdir(), `test-inline-${Date.now()}.txt`)
    writeFileSync(tmp, input, 'utf-8')

    try {
      const config = compileConfig(XHD5_CONFIG)
      const { entries, errors } = await collect(parseTxt(tmp, config))

      expect(errors).toHaveLength(0)
      expect(entries).toHaveLength(2)

      // First entry: character headword, no senses, has cross-reference
      const charEntry = entries[0]
      expect(charEntry.rawHeadword).toBe('腌')
      expect(charEntry.senses).toHaveLength(0)
      expect(charEntry.crossReferences).toEqual(['1563页yān'])

      // Second entry: word headword, three senses, no cross-reference
      const wordEntry = entries[1]
      expect(wordEntry.rawHeadword).toBe('【腌臜】')
      expect(wordEntry.phonetic).toBe('ā·zā')
      expect(wordEntry.senses).toHaveLength(3)
      expect(wordEntry.senses[0].rawNumber).toBe('①')
      expect(wordEntry.crossReferences).toBeUndefined()
    } finally {
      unlinkSync(tmp)
    }
  })

  it('normal entries (no inline sub-entry) are unaffected', async () => {
    const input = [
      '啊ā叹①表示惊异或赞叹。②表示追问。',
      '另见7页á。',
    ].join('\n')

    const tmp = join(tmpdir(), `test-normal-${Date.now()}.txt`)
    writeFileSync(tmp, input, 'utf-8')

    try {
      const config = compileConfig(XHD5_CONFIG)
      const { entries } = await collect(parseTxt(tmp, config))

      expect(entries).toHaveLength(1)
      expect(entries[0].rawHeadword).toBe('啊')
      expect(entries[0].senses).toHaveLength(2)
      expect(entries[0].crossReferences).toEqual(['7页á'])
    } finally {
      unlinkSync(tmp)
    }
  })
})
