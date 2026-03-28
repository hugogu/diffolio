import { describe, it, expect } from 'vitest'
import { extractInlineSenses } from '../inline-sense.js'
import type { CompiledConfig } from '../../config-engine.js'
import type { FormatConfigJson } from '../../../lib/types/shared.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(overrides: Partial<FormatConfigJson> = {}): CompiledConfig {
  const raw: FormatConfigJson = {
    name: 'test',
    headwordPattern: '^[\\u4e00-\\u9fff]{1,4}',
    senseNumberPatterns: ['(?:^|\\s)([①②③④⑤⑥⑦⑧⑨⑩])\\s*'],
    exampleSeparator: '｜',
    exampleIntroSeparator: '：',
    substitutionRules: [{ symbol: '～', expandTo: 'headword' }],
    glyphVariants: [],
    ...overrides,
  }

  const senseNumberRegexes = raw.senseNumberPatterns.map((p) => new RegExp(p, 'u'))
  const posRegex = raw.posPattern ? new RegExp(raw.posPattern, 'u') : undefined
  const registerRegex = raw.registerPattern ? new RegExp(raw.registerPattern, 'u') : undefined
  const sensePhoneticRegex = raw.sensePhoneticPattern ? new RegExp(raw.sensePhoneticPattern, 'u') : undefined
  const etymologyRegex = raw.etymologyPattern ? new RegExp(raw.etymologyPattern, 'u') : undefined

  return {
    headwordRegex: new RegExp(raw.headwordPattern, 'u'),
    senseNumberRegexes,
    skipLineRegexes: [],
    posRegex,
    registerRegex,
    sensePhoneticRegex,
    etymologyRegex,
    substitutionRules: raw.substitutionRules ?? [],
    glyphVariants: raw.glyphVariants ?? [],
    tradSimpMap: {},
    raw,
  }
}

// Config resembling xhd5 (circled sense numbers, CJK POS markers, register labels)
const xhd5Config = makeConfig({
  senseNumberPatterns: ['^([①②③④⑤⑥⑦⑧⑨⑩])\\s*'],
  posPattern: '^(动名词|名动词|动形词|形动词|区别词|名|动|形|副|数|量|代|介|连|助|叹|区别|方言)\\s*',
  registerPattern: '^(〈[^〉]{1,10}〉)\\s*',
})

// Config resembling xhd7 (（1） style sense numbers, {POS} style markers)
const xhd7Config = makeConfig({
  senseNumberPatterns: ['^（(\\d{1,2})）\\s*'],
  posPattern: '^\\{([^}]{1,10})\\}\\s*',
  registerPattern: '^(〈[^〉]{1,10}〉)\\s*',
})

// Config with no POS, no register (bare config)
const bareConfig = makeConfig({
  senseNumberPatterns: ['^([①②③④⑤⑥⑦⑧⑨⑩])\\s*'],
})

// ---------------------------------------------------------------------------
// Basic sense extraction
// ---------------------------------------------------------------------------

describe('basic numbered sense extraction', () => {
  it('extracts two circled senses', () => {
    const senses = extractInlineSenses('①义项一。②义项二。', xhd5Config, '测')
    expect(senses).toHaveLength(2)
    expect(senses[0].rawNumber).toBe('①')
    expect(senses[0].normalizedNumber).toBe('1')
    expect(senses[0].definition).toBe('义项一。')
    expect(senses[1].rawNumber).toBe('②')
    expect(senses[1].normalizedNumber).toBe('2')
    expect(senses[1].definition).toBe('义项二。')
  })

  it('extracts （1） style senses (xhd7)', () => {
    const senses = extractInlineSenses('（1）第一义。（2）第二义。', xhd7Config, '测')
    expect(senses).toHaveLength(2)
    expect(senses[0].normalizedNumber).toBe('1')
    expect(senses[0].definition).toBe('第一义。')
    expect(senses[1].normalizedNumber).toBe('2')
    expect(senses[1].definition).toBe('第二义。')
  })

  it('returns empty array for blank remainder', () => {
    const senses = extractInlineSenses('   ', xhd5Config, '测')
    expect(senses).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Implicit single-sense fallback
// ---------------------------------------------------------------------------

describe('implicit single-sense fallback', () => {
  it('treats no-marker remainder as a single unnumbered sense', () => {
    const senses = extractInlineSenses('某个词条的释义。', bareConfig, '测')
    expect(senses).toHaveLength(1)
    expect(senses[0].rawNumber).toBe('')
    expect(senses[0].normalizedNumber).toBe('1')
    expect(senses[0].definition).toBe('某个词条的释义。')
  })

  it('strips leading phonetic from implicit single sense', () => {
    const senses = extractInlineSenses('cè某个词条的释义。', bareConfig, '测', 'cè')
    expect(senses[0].definition).toBe('某个词条的释义。')
  })

  it('strips phonetic when remainder has full-width chars but phonetic is normalized (half-width)', () => {
    // Production flow: normalizePhonetic() is applied to phonetic before calling extractInlineSenses,
    // but remainder still contains the raw full-width text from the source file.
    // e.g. 【吖嗪】āｑíｎ{名}有机化合物的一类... → phonetic normalised to 'āqín', remainder unchanged
    const remainder = 'āｑíｎ{名}有机化合物的一类，呈环状结构，含有一个或几个氮原子，如吡啶、哒嗪、嘧啶等。［英 azine］'
    const phonetic = 'āqín'  // normalizePhonetic('āｑíｎ')
    const senses = extractInlineSenses(remainder, xhd7Config, '吖嗪', phonetic)
    expect(senses).toHaveLength(1)
    expect(senses[0].grammaticalCat).toBe('名')
    expect(senses[0].definition).toBe('有机化合物的一类，呈环状结构，含有一个或几个氮原子，如吡啶、哒嗪、嘧啶等。［英 azine］')
    expect(senses[0].register).toBeUndefined()
  })

  it('returns empty when remainder is only whitespace after stripping phonetic', () => {
    const senses = extractInlineSenses('cè  ', bareConfig, '测', 'cè')
    expect(senses).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Example separator splitting (｜)
// ---------------------------------------------------------------------------

describe('exampleSeparator splitting', () => {
  it('splits examples by ｜', () => {
    const senses = extractInlineSenses('①释义。｜例句甲｜例句乙', xhd5Config, '测')
    expect(senses[0].definition).toBe('释义。')
    expect(senses[0].examples).toHaveLength(2)
    expect(senses[0].examples[0].rawText).toBe('例句甲')
    expect(senses[0].examples[1].rawText).toBe('例句乙')
  })

  it('expands ～ in examples using headword', () => {
    const senses = extractInlineSenses('①释义｜～大｜～小', xhd5Config, '阿')
    expect(senses[0].examples[0].normalizedText).toBe('阿大')
    expect(senses[0].examples[1].normalizedText).toBe('阿小')
  })
})

// ---------------------------------------------------------------------------
// exampleIntroSeparator (：) — correct behaviour WITH ｜ examples
// ---------------------------------------------------------------------------

describe('exampleIntroSeparator with ｜ examples', () => {
  it('moves text after ：into the first example when ｜ examples exist', () => {
    // "①有亲昵意味：～大｜～宝｜～唐。" — colon introduces first example
    const senses = extractInlineSenses('①有亲昵的意味：～大｜～宝｜～唐。', xhd5Config, '阿')
    expect(senses[0].definition).toBe('有亲昵的意味')
    expect(senses[0].examples).toHaveLength(3)
    expect(senses[0].examples[0].normalizedText).toBe('阿大')
    expect(senses[0].examples[1].normalizedText).toBe('阿宝')
    expect(senses[0].examples[2].rawText).toBe('～唐。')
  })

  it('uses LAST ：as split point when definition contains multiple colons', () => {
    // "①说明A：说明B：例句" + ｜examples
    const senses = extractInlineSenses('①说明A：说明B：例句｜另一例', xhd5Config, '测')
    expect(senses[0].definition).toBe('说明A：说明B')
    expect(senses[0].examples[0].rawText).toBe('例句')
    expect(senses[0].examples[1].rawText).toBe('另一例')
  })
})

// ---------------------------------------------------------------------------
// exampleIntroSeparator (：) — should NOT fire when no ｜ examples
// ---------------------------------------------------------------------------

describe('exampleIntroSeparator does NOT fire without ｜ examples', () => {
  it('keeps text after ： in definition when no ｜ separator found', () => {
    // Definition legitimately contains a colon but is not followed by examples
    const senses = extractInlineSenses('①有亲昵的意味：进一步说明。', xhd5Config, '阿')
    expect(senses[0].definition).toBe('有亲昵的意味：进一步说明。')
    expect(senses[0].examples).toHaveLength(0)
  })

  it('keeps register label in definition (not moved to examples)', () => {
    // Without the fix, step 2 would fire and 〈书〉style label after ： would be misclassified
    const senses = extractInlineSenses('①有文雅的含义：〈书〉进一步解释。', xhd5Config, '测')
    // No ｜ → step 2 should NOT fire → definition includes everything after the sense marker
    expect(senses[0].definition).toBe('有文雅的含义：〈书〉进一步解释。')
    expect(senses[0].examples).toHaveLength(0)
  })

  it('implicit single-sense with colon keeps full text', () => {
    const senses = extractInlineSenses('某释义：补充说明。', bareConfig, '测')
    expect(senses[0].definition).toBe('某释义：补充说明。')
    expect(senses[0].examples).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Register extraction (〈书〉, 〈方〉, etc.)
// ---------------------------------------------------------------------------

describe('register extraction', () => {
  it('extracts register label from numbered sense', () => {
    const senses = extractInlineSenses('①〈书〉某义项。', xhd5Config, '测')
    expect(senses[0].register).toBe('〈书〉')
    expect(senses[0].definition).toBe('某义项。')
  })

  it('extracts shared register from prefix before first sense marker', () => {
    // "〈方〉①义项一。②义项二。" — 〈方〉 applies to all senses
    const senses = extractInlineSenses('〈方〉①义项一。②义项二。', xhd5Config, '测')
    expect(senses[0].register).toBe('〈方〉')
    expect(senses[1].register).toBe('〈方〉')
  })

  it('per-sense register overrides shared register', () => {
    const senses = extractInlineSenses('〈方〉①〈口〉义项一。②义项二。', xhd5Config, '测')
    expect(senses[0].register).toBe('〈口〉')
    expect(senses[1].register).toBe('〈方〉')
  })

  it('handles 〈书〉 register without mangling definition', () => {
    const senses = extractInlineSenses('①〈书〉动 某文雅义项。', xhd5Config, '测')
    expect(senses[0].register).toBe('〈书〉')
    expect(senses[0].grammaticalCat).toBe('动')
    expect(senses[0].definition).toBe('某文雅义项。')
  })
})

// ---------------------------------------------------------------------------
// POS extraction
// ---------------------------------------------------------------------------

describe('POS extraction', () => {
  it('extracts single-char POS (动)', () => {
    const senses = extractInlineSenses('①动 执行某动作。', xhd5Config, '测')
    expect(senses[0].grammaticalCat).toBe('动')
    expect(senses[0].definition).toBe('执行某动作。')
  })

  it('extracts compound POS 动名词 without leaving 名词 in definition', () => {
    const senses = extractInlineSenses('①动名词 兼具动词和名词功能。', xhd5Config, '测')
    expect(senses[0].grammaticalCat).toBe('动名词')
    expect(senses[0].definition).toBe('兼具动词和名词功能。')
    // 名词 must NOT appear at the start of the definition
    expect(senses[0].definition).not.toMatch(/^名词/)
  })

  it('extracts {POS} style markers for xhd7', () => {
    const senses = extractInlineSenses('（1）{动} 执行某操作。', xhd7Config, '测')
    expect(senses[0].grammaticalCat).toBe('动')
    expect(senses[0].definition).toBe('执行某操作。')
  })

  it('extracts shared POS from prefix', () => {
    const senses = extractInlineSenses('动①义项一。②义项二。', xhd5Config, '测')
    expect(senses[0].grammaticalCat).toBe('动')
    expect(senses[1].grammaticalCat).toBe('动')
  })
})

// ---------------------------------------------------------------------------
// Combined register + POS
// ---------------------------------------------------------------------------

describe('combined register and POS extraction', () => {
  it('extracts both register and POS from the same sense prefix', () => {
    const senses = extractInlineSenses('①〈书〉形 某形容词义项。', xhd5Config, '测')
    expect(senses[0].register).toBe('〈书〉')
    expect(senses[0].grammaticalCat).toBe('形')
    expect(senses[0].definition).toBe('某形容词义项。')
  })

  it('handles 〈书〉动名词 compound POS together', () => {
    const senses = extractInlineSenses('①〈书〉动名词 兼功能词。', xhd5Config, '测')
    expect(senses[0].register).toBe('〈书〉')
    expect(senses[0].grammaticalCat).toBe('动名词')
    expect(senses[0].definition).toBe('兼功能词。')
  })
})

// ---------------------------------------------------------------------------
// Real-world sample data: 阿飞 entry in xhd7 and xhd5 format
// ---------------------------------------------------------------------------

describe('real-world sample: 阿飞', () => {
  // xhd7 format:  【阿飞】āｆēｉ〈方〉{名}指身着奇装异服、举止轻狂、行为不端的青少年。
  //   ↑ phonetic uses full-width Latin: ｆ (U+FF46) ｅ (U+FF45) ｉ (U+FF49)
  //   The remainder passed to extractInlineSenses is everything after 【阿飞】,
  //   including the phonetic, which the implicit-sense path will strip.
  it('xhd7: extracts 〈方〉 register and {名} POS from implicit single sense', () => {
    // phonetic is the normalised form (half-width), remainder retains raw full-width chars
    const remainder = 'āｆēｉ〈方〉{名}指身着奇装异服、举止轻狂、行为不端的青少年。'
    const phonetic = 'āfēi'  // normalizePhonetic('āｆēｉ')
    const senses = extractInlineSenses(remainder, xhd7Config, '阿飞', phonetic)
    expect(senses).toHaveLength(1)
    expect(senses[0].register).toBe('〈方〉')
    expect(senses[0].grammaticalCat).toBe('名')
    expect(senses[0].definition).toBe('指身着奇装异服、举止轻狂、行为不端的青少年。')
    expect(senses[0].examples).toHaveLength(0)
  })

  // xhd5 format:  【阿飞】āfēi名指身着奇装异服、举动轻狂的青少年流氓。
  //   Bare POS marker 名 (no brackets, no register label)
  it('xhd5: extracts 名 POS from implicit single sense without register', () => {
    const remainder = 'āfēi名指身着奇装异服、举动轻狂的青少年流氓。'
    const phonetic = 'āfēi'
    const senses = extractInlineSenses(remainder, xhd5Config, '阿飞', phonetic)
    expect(senses).toHaveLength(1)
    expect(senses[0].register).toBeUndefined()
    expect(senses[0].grammaticalCat).toBe('名')
    expect(senses[0].definition).toBe('指身着奇装异服、举动轻狂的青少年流氓。')
    expect(senses[0].examples).toHaveLength(0)
  })

  // xhd7 format:  皑(皚)áｉ〈书〉洁白：～如山上雪，皎若云间月。
  //   headwordVariantSuffixPattern strips (皚) from remainder, then the updated
  //   phoneticPattern (with \) in the lookbehind) captures 'áｉ' and normalizePhonetic
  //   converts it to 'ái' (2 chars), which is stripped by extractInlineSenses.
  it('xhd7: strips variant suffix and full-width phonetic so 〈书〉 register is correctly extracted', () => {
    const remainder = 'áｉ〈书〉洁白：～如山上雪，皎若云间月。'
    const phonetic = 'ái'  // normalizePhonetic('áｉ') after phoneticPattern captures 'áｉ'
    const senses = extractInlineSenses(remainder, xhd7Config, '皑', phonetic)
    expect(senses).toHaveLength(1)
    expect(senses[0].register).toBe('〈书〉')
    expect(senses[0].grammaticalCat).toBeUndefined()
    expect(senses[0].definition).toBe('洁白：～如山上雪，皎若云间月。')
  })
})

// ---------------------------------------------------------------------------
// Etymology extraction
// ---------------------------------------------------------------------------

const ETYMOLOGY_PATTERN = '[\\[\\uff3b]([^\\]\\uff3d]{1,80})[\\]\\uff3d]\\s*$'

const xhd7EtymConfig = makeConfig({
  senseNumberPatterns: ['^（(\\d{1,2})）\\s*'],
  posPattern: '^\\{([^}]{1,10})\\}\\s*',
  registerPattern: '^(〈[^〉]{1,10}〉)\\s*',
  etymologyPattern: ETYMOLOGY_PATTERN,
})

const xhd5EtymConfig = makeConfig({
  senseNumberPatterns: ['^([①②③④⑤⑥⑦⑧⑨⑩])\\s*'],
  posPattern: '^(动名词|名动词|动形词|形动词|区别词|名|动|形|副|数|量|代|介|连|助|叹|区别|方言)\\s*',
  registerPattern: '^(〈[^〉]{1,10}〉)\\s*',
  etymologyPattern: ETYMOLOGY_PATTERN,
})

describe('etymology extraction', () => {
  // 第7版 full-width brackets: ［希伯来 mēn］
  it('xhd7: implicit sense — strips ［...　　 from end, POS={叹}', () => {
    const remainder = '{叹}犹太教、基督教祈祷时常用的结束语，"但愿如此"的意思。［希伯来 mēn］'
    const senses = extractInlineSenses(remainder, xhd7EtymConfig, '阿门')
    expect(senses).toHaveLength(1)
    expect(senses[0].grammaticalCat).toBe('叹')
    expect(senses[0].definition).toBe('犹太教、基督教祈祷时常用的结束语，"但愿如此"的意思。')
    expect(senses[0].etymology).toBe('希伯来 mēn')
  })

  // 第7版 full-width brackets with cross-ref definition
  it('xhd7: implicit sense with cross-ref — strips ［梵 arhat］', () => {
    const remainder = '{名}见860页〖罗汉〗。［梵 arhat］'
    const senses = extractInlineSenses(remainder, xhd7EtymConfig, '阿罗汉')
    expect(senses).toHaveLength(1)
    expect(senses[0].grammaticalCat).toBe('名')
    expect(senses[0].definition).toBe('见860页〖罗汉〗。')
    expect(senses[0].etymology).toBe('梵 arhat')
  })

  // 第7版 full-width brackets with full-width content: ［波斯 ｋｈūｎｄ］
  it('xhd7: implicit sense — strips ［波斯 ｋｈūｎｄ］ with full-width letters', () => {
    const remainder = '{名}我国伊斯兰教称主持清真寺教务和讲授经典的人。［波斯 ｋｈūｎｄ］'
    const senses = extractInlineSenses(remainder, xhd7EtymConfig, '阿訇')
    expect(senses).toHaveLength(1)
    expect(senses[0].grammaticalCat).toBe('名')
    expect(senses[0].definition).toBe('我国伊斯兰教称主持清真寺教务和讲授经典的人。')
    expect(senses[0].etymology).toBe('波斯 ｋｈūｎｄ')
  })

  // 第5版 half-width brackets: [波斯ākhūnd]
  it('xhd5: implicit sense — strips [波斯ākhūnd] half-width brackets', () => {
    const remainder = '名我国伊斯兰教称主持清真寺教务和讲授经典的人。[波斯ākhūnd]'
    const senses = extractInlineSenses(remainder, xhd5EtymConfig, '阿訇')
    expect(senses).toHaveLength(1)
    expect(senses[0].grammaticalCat).toBe('名')
    expect(senses[0].definition).toBe('我国伊斯兰教称主持清真寺教务和讲授经典的人。')
    expect(senses[0].etymology).toBe('波斯ākhūnd')
  })

  it('no etymology when pattern absent — definition unchanged', () => {
    const senses = extractInlineSenses('{名}某释义。', xhd7Config, '测')
    expect(senses[0].etymology).toBeUndefined()
    expect(senses[0].definition).toBe('某释义。')
  })

  it('no false match when definition has no etymology brackets', () => {
    const senses = extractInlineSenses('{名}某释义。', xhd7EtymConfig, '测')
    expect(senses[0].etymology).toBeUndefined()
    expect(senses[0].definition).toBe('某释义。')
  })
})

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('edge cases', () => {
  it('deduplicates markers at the same position (from multiple sense regexes)', () => {
    // Two patterns that would both match ① — result should still be one sense
    const config = makeConfig({
      senseNumberPatterns: [
        '^([①②③④⑤⑥⑦⑧⑨⑩])\\s*',
        '^([①②③④⑤⑥⑦⑧⑨⑩])\\s*',
      ],
    })
    const senses = extractInlineSenses('①一。②二。', config, '测')
    expect(senses).toHaveLength(2)
  })

  it('handles sense with no trailing text', () => {
    const senses = extractInlineSenses('①', xhd5Config, '测')
    expect(senses).toHaveLength(1)
    expect(senses[0].definition).toBe('')
  })
})
