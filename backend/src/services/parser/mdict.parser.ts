import { htmlToText } from 'html-to-text'
import { CompiledConfig } from '../config-engine.js'
import { expandSymbols, normalizeSenseNumber, normalizeHeadword, normalizeText, normalizePhonetic } from '../normalizer.js'
import { ParsedEntry, ParsedSense, ParseError, ParseChunk } from './types.js'
import { extractInlineSenses, extractPos, extractRegister, extractEtymology, tryExtractInlineEntry } from './inline-sense.js'

const BATCH_SIZE = 200

// Dynamic import for mdict-js (CommonJS module)
async function loadMdict(): Promise<any> {
  const mdictModule = await import('mdict-js')
  // Handle the nested default export structure: { default: { default: MdictClass } }
  const MdictClass = mdictModule.default?.default || mdictModule.default || mdictModule
  return MdictClass
}

/**
 * Convert HTML definition to plain text lines
 * Preserves structure by converting block elements to newlines
 * Optimized for Chinese dictionary HTML formats (e.g., MDict XDHY7)
 */
function convertHtmlToLines(html: string): string[] {
  const text = htmlToText(html, {
    wordwrap: false,
    selectors: [
      // Remove script, style, and link elements
      { selector: 'script', format: 'skip' },
      { selector: 'style', format: 'skip' },
      { selector: 'link', format: 'skip' },
      // Skip links (cross-references) but keep their text
      { selector: 'a', format: 'skip' },
      // Convert block elements to newlines
      { selector: 'div', format: 'block' },
      { selector: 'p', format: 'block' },
      { selector: 'entry', format: 'block' },
      { selector: 'hwg', format: 'block' },
      { selector: 'def', format: 'block' },
      { selector: 'column', format: 'block' },
      // Keep inline elements inline
      { selector: 'span', format: 'inline' },
      { selector: 'sup', format: 'inline' },
      { selector: 'small', format: 'inline' },
      { selector: 'ex', format: 'inline' },
      { selector: 'note', format: 'inline' },
      { selector: 'num', format: 'inline' },
      { selector: 'ps', format: 'inline' },
      { selector: 'pinyin', format: 'inline' },
      {
        selector: 'hw',
        format: 'inline',
        options: {
          trailingLineBreaks: 0,
        },
      },
      {
        selector: 'pinyin',
        format: 'inline',
        options: {
          leadingLineBreaks: 0,
        },
      },
      // Skip unwanted sections
      { selector: 'ci', format: 'skip' },
      { selector: 'cont', format: 'skip' },
      // Handle line breaks
      { selector: 'br', format: 'inline' },
    ],
    // Preserve whitespace in preformatted content
    preserveNewlines: true,
  })

  // Split into lines and clean up
  const lines = text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)

  // Remove null characters and ensure headword/pinyin separation
  return lines.map(line => {
    // Remove null characters
    let cleaned = line.replace(/\x00/g, '')
    
    // Strategy: Find the transition point between headword and pinyin
    // Headword ends with: Chinese char, number, or specific boundary
    // Pinyin starts with: Latin letter (including tone marks)
    // Pattern: (mixed content)(space?)(pinyin starting with letter)
    
    // Match position where Latin letters with tone marks begin after Chinese/mixed content
    const pinyinStartMatch = cleaned.match(/[\u4e00-\u9fa5\u3400-\u4dbf0-9][a-zA-Zāáǎàōóǒòēéěèīíǐìūúǔùǖǘǚǜ]/u)
    if (pinyinStartMatch && pinyinStartMatch.index !== undefined) {
      const splitPos = pinyinStartMatch.index + 1
      const headword = cleaned.substring(0, splitPos).trim()
      const rest = cleaned.substring(splitPos).trim()
      // Insert a clear separator
      cleaned = `${headword} ${rest}`
    }
    
    return cleaned
  }).filter(line => line.length > 0)
}

/**
 * Process lines using the same logic as txt.parser.ts
 */
function processLines(
  lines: string[],
  config: CompiledConfig,
  entryKey: string
): { entry: ParsedEntry | null; errors: ParseError[] } {
  const errors: ParseError[] = []
  let currentEntry: ParsedEntry | null = null
  let currentSense: ParsedSense | null = null
  let inlineCharEntry: ParsedEntry | null = null
  let lineNumber = 0

  function flushSense() {
    if (currentSense && currentEntry) {
      currentEntry.senses.push(currentSense)
      currentSense = null
    }
  }

  function flushEntry() {
    flushSense()
    if (currentEntry) {
      return currentEntry
    }
    return null
  }

  for (const line of lines) {
    lineNumber++
    const trimmed = line.trim()
    if (!trimmed) continue

    let processLine = trimmed

    // Check cross-reference BEFORE headword
    if (config.crossReferenceRegex) {
      const crMatch = config.crossReferenceRegex.exec(processLine)
      if (crMatch) {
        const crTarget = inlineCharEntry ?? currentEntry
        if (crTarget) {
          const ref = (crMatch[1] ?? crMatch[0]).trim().replace(/[。.]$/, '')
          if (!crTarget.crossReferences) crTarget.crossReferences = []
          crTarget.crossReferences.push(ref)
        }
        processLine = processLine.slice(0, crMatch.index).trim()
        if (!processLine) continue
      }
    }

    // Skip lines matching skip patterns
    if (config.skipLineRegexes.length > 0 && config.skipLineRegexes.some((r) => r.test(processLine))) continue

    // Test if this line starts a new headword
    const hwMatch = config.headwordRegex.exec(processLine)
    if (hwMatch) {
      const completedEntry = flushEntry()
      if (completedEntry) {
        return { entry: completedEntry, errors }
      }
      inlineCharEntry = null

      // Strip any variant-form suffix
      let rawHeadword = hwMatch[1] ?? hwMatch[0]

      // Extract entry sequence number
      let entrySequence: number | undefined
      if (config.entrySequenceRegex) {
        const seqMatch = config.entrySequenceRegex.exec(rawHeadword)
        if (seqMatch) {
          const seqNum = parseInt(seqMatch[1], 10)
          if (!isNaN(seqNum)) {
            entrySequence = seqNum
            rawHeadword = rawHeadword.slice(0, seqMatch.index)
          }
        }
      }

      if (config.headwordVariantSuffixRegex) {
        const vsm = config.headwordVariantSuffixRegex.exec(rawHeadword)
        if (vsm) rawHeadword = rawHeadword.slice(0, vsm.index)
      }
      const normalizedHeadword = normalizeHeadword(
        rawHeadword,
        config.tradSimpMap,
        config.glyphVariants
      )

      // Extract phonetic
      let phonetic: string | undefined
      if (config.phoneticRegex) {
        const phoneticTarget = rawHeadword + processLine.slice(hwMatch[0].length)
        const phoneticMatch = config.phoneticRegex.exec(phoneticTarget)
        if (phoneticMatch) {
          phonetic = normalizePhonetic((phoneticMatch[1] ?? phoneticMatch[0]).trim())
        }
      }

      currentEntry = {
        rawHeadword,
        normalizedHeadword,
        entrySequence,
        phonetic,
        lineNumber,
        senses: [],
      }

      // Process remainder
      let remainder = processLine.slice(hwMatch.index + hwMatch[0].length)
      if (config.headwordVariantSuffixRegex) {
        const vsm = config.headwordVariantSuffixRegex.exec(remainder)
        if (vsm && vsm.index === 0) remainder = remainder.slice(vsm[0].length)
      }
      
      const inlineResult = tryExtractInlineEntry(remainder, config, phonetic)
      if (inlineResult) {
        // Push main entry and switch to sub-entry
        if (currentEntry.senses.length === 0) {
          // Only push if no senses yet (empty main entry)
        }
        inlineCharEntry = currentEntry

        const subNorm = normalizeHeadword(inlineResult.subRawHeadword, config.tradSimpMap, config.glyphVariants)
        currentEntry = {
          rawHeadword: inlineResult.subRawHeadword,
          normalizedHeadword: subNorm,
          phonetic: inlineResult.subPhonetic,
          lineNumber,
          senses: [],
        }
        const subSenses = extractInlineSenses(
          inlineResult.subRemainder, config, subNorm, inlineResult.subPhonetic
        )
        if (subSenses.length > 0) currentEntry.senses.push(...subSenses)
        continue
      }
      
      const inlineSenses = extractInlineSenses(remainder, config, normalizedHeadword, phonetic)
      if (inlineSenses.length > 0) {
        currentEntry.senses.push(...inlineSenses)
      } else if (remainder.trim()) {
        // Remove phonetic from remainder if it was extracted
        let definitionText = remainder
        if (phonetic) {
          const phoneticIndex = definitionText.indexOf(phonetic)
          if (phoneticIndex !== -1) {
            definitionText = definitionText.slice(0, phoneticIndex) + definitionText.slice(phoneticIndex + phonetic.length)
          }
        }
        definitionText = definitionText.trim()

        if (definitionText) {
          // For entries without sense numbers (e.g., 阿兰若), create a default sense from remainder
          const { register, rest: afterRegister } = extractRegister(definitionText, config.registerRegex)
          const { grammaticalCat, rest: afterPos } = extractPos(afterRegister, config.posRegex)
          const { etymology, rest } = extractEtymology(afterPos, config.etymologyRegex)

          currentEntry.senses.push({
            rawNumber: '',
            normalizedNumber: '',
            rawDefinition: definitionText,
            definition: normalizeText(rest),
            grammaticalCat,
            register,
            etymology,
            examples: [],
          })
        }
      }

      continue
    }

    if (!currentEntry) {
      // If no entry yet, try to use the MDict key as headword
      // This handles cases where the HTML doesn't contain the headword in text
      continue
    }

    // Test if this line starts a new sense
    let matchedSensePattern = false
    for (const senseRegex of config.senseNumberRegexes) {
      const senseMatch = senseRegex.exec(processLine)
      if (senseMatch) {
        flushSense()
        const rawNumber = senseMatch[1] ?? senseMatch[0]
        const rawDefinition = processLine.slice(senseMatch[0].length).trim()
        const normalizedNumber = normalizeSenseNumber(rawNumber)
        const { register, rest: afterRegister } = extractRegister(rawDefinition, config.registerRegex)
        const { grammaticalCat, rest: afterPos } = extractPos(afterRegister, config.posRegex)
        const { etymology, rest } = extractEtymology(afterPos, config.etymologyRegex)

        currentSense = {
          rawNumber,
          normalizedNumber,
          rawDefinition,
          definition: normalizeText(rest),
          grammaticalCat,
          register,
          etymology,
          examples: [],
        }
        matchedSensePattern = true
        break
      }
    }

    if (!matchedSensePattern && currentSense) {
      // This line is a continuation or example under current sense
      if (config.raw.exampleSeparator && processLine.includes(config.raw.exampleSeparator)) {
        const parts = processLine.split(config.raw.exampleSeparator).filter(Boolean)
        for (const part of parts) {
          const rawText = part.trim()
          const normalizedText = expandSymbols(
            normalizeText(rawText),
            currentEntry.normalizedHeadword,
            config.substitutionRules
          )
          currentSense.examples.push({ rawText, normalizedText })
        }
      } else if (!matchedSensePattern && !currentSense.definition) {
        errors.push({
          lineNumber,
          rawText: processLine,
          fieldName: 'sense',
          errorCode: 'PATTERN_NOT_MATCHED',
          errorDetail: 'Line did not match any headword or sense number pattern',
        })
      }
    } else if (!matchedSensePattern && !currentSense && currentEntry) {
      // For entries without sense numbers, check if line starts with POS marker
      // e.g., "名原指树林..." should create a new sense with POS="名"
      const posMatch = config.posRegex ? config.posRegex.exec(processLine) : null
      if (posMatch) {
        const pos = posMatch[1]
        const rawDefinition = processLine.slice(posMatch[0].length).trim()
        const { register, rest: afterRegister } = extractRegister(rawDefinition, config.registerRegex)
        const { etymology, rest } = extractEtymology(afterRegister, config.etymologyRegex)

        currentSense = {
          rawNumber: '',
          normalizedNumber: '',
          rawDefinition,
          definition: normalizeText(rest),
          grammaticalCat: pos,
          register,
          etymology,
          examples: [],
        }
      } else {
        // No POS marker either, create a default sense with this line as definition
        // This handles entries like 小心翼翼 that have no POS marker or sense numbers
        currentSense = {
          rawNumber: '',
          normalizedNumber: '',
          rawDefinition: processLine,
          definition: normalizeText(processLine),
          grammaticalCat: undefined,
          register: undefined,
          etymology: undefined,
          examples: [],
        }
      }
    }
  }

  flushEntry()
  return { entry: currentEntry, errors }
}

export async function* parseMdict(
  filePath: string,
  config: CompiledConfig
): AsyncGenerator<ParseChunk> {
  const Mdict = await loadMdict()
  const dict = new Mdict(filePath)

  // Get all keys (headwords) from the dictionary
  // rangeKeyWords() may not work for all mdx files, try keys() first then fallback
  let keys: string[] = []
  try {
    keys = dict.keys()
  } catch (e) {
    // Fallback to rangeKeyWords
    try {
      const keyList = dict.rangeKeyWords()
      keys = keyList.map((item: { keyText: string }) => item.keyText)
    } catch (e2) {
      // Last resort: get first 100 keys by prefix
      keys = []
    }
  }
  
  const entries: ParsedEntry[] = []
  const errors: ParseError[] = []
  let processedCount = 0
  
  for (const key of keys) {
    processedCount++
    
    try {
      // Look up the definition for this key
      const result = dict.lookup(key)
      
      if (!result || !result.definition) {
        errors.push({
          lineNumber: processedCount,
          rawText: key,
          fieldName: 'definition',
          errorCode: 'EMPTY_DEFINITION',
          errorDetail: `No definition found for key: ${key}`,
        })
        continue
      }
      
      // Convert HTML to text lines
      const lines = convertHtmlToLines(result.definition)
      
      // Ensure the first line contains the headword
      // If not, prepend it to help the parser
      if (lines.length > 0 && !config.headwordRegex.test(lines[0])) {
        lines.unshift(key)
      }
      
      // Process lines using the same logic as txt.parser.ts
      const { entry, errors: entryErrors } = processLines(lines, config, key)
      
      if (entry) {
        entries.push(entry)
      }
      
      errors.push(...entryErrors)
      
    } catch (error) {
      errors.push({
        lineNumber: processedCount,
        rawText: key,
        fieldName: 'parse',
        errorCode: 'PARSE_ERROR',
        errorDetail: error instanceof Error ? error.message : 'Unknown error',
      })
    }
    
    // Yield batch when size threshold is reached
    if (entries.length >= BATCH_SIZE) {
      yield { entries, errors }
      entries.length = 0
      errors.length = 0
    }
  }
  
  // Yield any remaining entries
  if (entries.length > 0 || errors.length > 0) {
    yield { entries, errors }
  }
}

/**
 * Preview parse for MDict files
 * Returns the first N entries for preview
 */
export async function previewParseMdict(
  filePath: string,
  config: CompiledConfig,
  maxEntries: number,
  startIndex = 0
): Promise<{ entries: ParsedEntry[]; errors: ParseError[]; totalLinesScanned: number }> {
  const Mdict = await loadMdict()
  const dict = new Mdict(filePath)

  // Get all keys (headwords) from the dictionary
  let keys: string[] = []
  try {
    keys = dict.keys()
  } catch (e) {
    // Fallback to rangeKeyWords
    try {
      const keyList = dict.rangeKeyWords()
      keys = keyList.map((item: { keyText: string }) => item.keyText)
    } catch (e2) {
      keys = []
    }
  }

  const entries: ParsedEntry[] = []
  const errors: ParseError[] = []
  let processedCount = 0
  let skippedCount = 0
  
  for (const key of keys) {
    processedCount++
    
    // Skip entries before startIndex
    if (skippedCount < startIndex) {
      skippedCount++
      continue
    }
    
    // Stop when we have enough entries
    if (entries.length >= maxEntries) {
      break
    }
    
    try {
      const result = dict.lookup(key)
      
      if (!result || !result.definition) {
        errors.push({
          lineNumber: processedCount,
          rawText: key,
          fieldName: 'definition',
          errorCode: 'EMPTY_DEFINITION',
          errorDetail: `No definition found for key: ${key}`,
        })
        continue
      }
      
      const lines = convertHtmlToLines(result.definition)
      
      // Ensure first line has headword
      if (lines.length > 0 && !config.headwordRegex.test(lines[0])) {
        lines.unshift(key)
      }
      
      const { entry, errors: entryErrors } = processLines(lines, config, key)
      
      if (entry) {
        entries.push(entry)
      }
      
      errors.push(...entryErrors)
      
    } catch (error) {
      errors.push({
        lineNumber: processedCount,
        rawText: key,
        fieldName: 'parse',
        errorCode: 'PARSE_ERROR',
        errorDetail: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }
  
  return {
    entries,
    errors,
    totalLinesScanned: processedCount,
  }
}