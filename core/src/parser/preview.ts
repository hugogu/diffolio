import fs from 'node:fs'
import readline from 'node:readline'
import { CompiledConfig } from '../config-engine.js'
import { normalizeHeadword, normalizeSenseNumber, normalizeText, expandSymbols, normalizePhonetic } from '../normalizer.js'
import { ParsedEntry, ParseError } from './types.js'
import { extractInlineSenses, extractPos, extractRegister, extractEtymology } from './inline-sense.js'

export interface ParsePreviewEntry {
  sourceLines: string[]
  entry: ParsedEntry
  errors: ParseError[]
}

export interface ParsePreviewResult {
  entries: ParsePreviewEntry[]
  totalLinesScanned: number
}

// Shared synchronous parse loop used by docx/doc/pdf (text already extracted)
function previewParseLines(
  lines: string[],
  config: CompiledConfig,
  maxEntries: number,
  startIndex = 0
): ParsePreviewResult {
  const results: ParsePreviewEntry[] = []
  let currentEntry: ParsedEntry | null = null
  let currentSourceLines: string[] = []
  let currentErrors: ParseError[] = []
  let lineNumber = 0
  let totalEntriesSeen = 0

  function flushEntry() {
    if (currentEntry) {
      totalEntriesSeen++
      if (totalEntriesSeen > startIndex) {
        results.push({
          sourceLines: [...currentSourceLines],
          entry: { ...currentEntry, senses: [...currentEntry.senses] },
          errors: [...currentErrors],
        })
      }
      currentEntry = null
      currentSourceLines = []
      currentErrors = []
    }
  }

  for (const line of lines) {
    lineNumber++
    if (results.length >= maxEntries && !currentEntry) break

    const trimmed = line.trim()
    if (!trimmed) continue

    let processLine = trimmed

    if (config.crossReferenceRegex) {
      const crMatch = config.crossReferenceRegex.exec(processLine)
      if (crMatch) {
        if (currentEntry) {
          const ref = (crMatch[1] ?? crMatch[0]).trim().replace(/[。.]$/, '')
          if (!currentEntry.crossReferences) currentEntry.crossReferences = []
          currentEntry.crossReferences.push(ref)
        }
        processLine = processLine.slice(0, crMatch.index).trim()
        if (!processLine) continue
      }
    }

    if (config.skipLineRegexes.length > 0 && config.skipLineRegexes.some((r) => r.test(processLine))) continue

    const hwMatch = config.headwordRegex.exec(processLine)
    if (hwMatch) {
      flushEntry()
      if (results.length >= maxEntries) break

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
      const normalizedHeadword = normalizeHeadword(rawHeadword, config.tradSimpMap, config.glyphVariants)

      let phonetic: string | undefined
      if (config.phoneticRegex) {
        const phoneticTarget = rawHeadword + processLine.slice(hwMatch[0].length)
        const pm = config.phoneticRegex.exec(phoneticTarget)
        if (pm) phonetic = normalizePhonetic((pm[1] ?? pm[0]).trim())
      }

      currentEntry = { rawHeadword, normalizedHeadword, entrySequence, phonetic, lineNumber, senses: [] }
      currentSourceLines = [line]

      let remainder = processLine.slice(hwMatch.index + hwMatch[0].length)
      if (config.headwordVariantSuffixRegex) {
        const vsm = config.headwordVariantSuffixRegex.exec(remainder)
        if (vsm && vsm.index === 0) remainder = remainder.slice(vsm[0].length)
      }
      const inlineSenses = extractInlineSenses(remainder, config, normalizedHeadword, phonetic)
      if (inlineSenses.length > 0) currentEntry.senses.push(...inlineSenses)

      continue
    }

    if (!currentEntry) continue

    currentSourceLines.push(line)

    // Check multi-line sense patterns
    let matchedSense = false
    for (const senseRegex of config.senseNumberRegexes) {
      const sm = senseRegex.exec(processLine)
      if (sm) {
        const rawNumber = sm[1] ?? sm[0]
        const rawDefinition = processLine.slice(sm[0].length).trim()
        const { register, rest: afterRegister } = extractRegister(rawDefinition, config.registerRegex)
        const { grammaticalCat, rest: afterPos } = extractPos(afterRegister, config.posRegex)
        const { etymology, rest } = extractEtymology(afterPos, config.etymologyRegex)
        currentEntry.senses.push({
          rawNumber,
          normalizedNumber: normalizeSenseNumber(rawNumber),
          rawDefinition,
          definition: normalizeText(rest),
          grammaticalCat,
          register,
          etymology,
          examples: [],
        })
        matchedSense = true
        break
      }
    }

    if (!matchedSense && config.raw.exampleSeparator && processLine.includes(config.raw.exampleSeparator)) {
      const lastSense = currentEntry.senses[currentEntry.senses.length - 1]
      if (lastSense) {
        const parts = processLine.split(config.raw.exampleSeparator).filter(Boolean)
        for (const part of parts) {
          const rawText = part.trim()
          lastSense.examples.push({
            rawText,
            normalizedText: expandSymbols(normalizeText(rawText), currentEntry.normalizedHeadword, config.substitutionRules),
          })
        }
      }
    }
  }

  flushEntry()
  return { entries: results, totalLinesScanned: lineNumber }
}

// TXT: streaming line-by-line via readline
export async function previewParseTxt(
  filePath: string,
  config: CompiledConfig,
  maxEntries: number,
  startIndex = 0
): Promise<ParsePreviewResult> {
  const fileStream = fs.createReadStream(filePath, { encoding: 'utf-8' })
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity })

  const results: ParsePreviewEntry[] = []
  let currentEntry: ParsedEntry | null = null
  let currentSourceLines: string[] = []
  let currentErrors: ParseError[] = []
  let lineNumber = 0
  let entriesSkipped = 0
  let totalEntriesSeen = 0

  function flushEntry() {
    if (currentEntry) {
      totalEntriesSeen++
      if (totalEntriesSeen <= startIndex) {
        entriesSkipped++
      } else {
        results.push({
          sourceLines: [...currentSourceLines],
          entry: { ...currentEntry, senses: [...currentEntry.senses] },
          errors: [...currentErrors],
        })
      }
      currentEntry = null
      currentSourceLines = []
      currentErrors = []
    }
  }

  for await (const line of rl) {
    lineNumber++
    if (results.length >= maxEntries && !currentEntry) break

    const trimmed = line.trim()
    if (!trimmed) continue

    let processLine = trimmed

    if (config.crossReferenceRegex) {
      const crMatch = config.crossReferenceRegex.exec(processLine)
      if (crMatch) {
        if (currentEntry) {
          const ref = (crMatch[1] ?? crMatch[0]).trim().replace(/[。.]$/, '')
          if (!currentEntry.crossReferences) currentEntry.crossReferences = []
          currentEntry.crossReferences.push(ref)
        }
        processLine = processLine.slice(0, crMatch.index).trim()
        if (!processLine) continue
      }
    }

    if (config.skipLineRegexes.length > 0 && config.skipLineRegexes.some((r) => r.test(processLine))) continue

    const hwMatch = config.headwordRegex.exec(processLine)
    if (hwMatch) {
      flushEntry()
      if (results.length >= maxEntries) break

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
      const normalizedHeadword = normalizeHeadword(rawHeadword, config.tradSimpMap, config.glyphVariants)

      let phonetic: string | undefined
      if (config.phoneticRegex) {
        const phoneticTarget = rawHeadword + processLine.slice(hwMatch[0].length)
        const pm = config.phoneticRegex.exec(phoneticTarget)
        if (pm) phonetic = normalizePhonetic((pm[1] ?? pm[0]).trim())
      }

      currentEntry = { rawHeadword, normalizedHeadword, entrySequence, phonetic, lineNumber, senses: [] }
      currentSourceLines = [line]

      let remainder = processLine.slice(hwMatch.index + hwMatch[0].length)
      if (config.headwordVariantSuffixRegex) {
        const vsm = config.headwordVariantSuffixRegex.exec(remainder)
        if (vsm && vsm.index === 0) remainder = remainder.slice(vsm[0].length)
      }
      const inlineSenses = extractInlineSenses(remainder, config, normalizedHeadword, phonetic)
      if (inlineSenses.length > 0) currentEntry.senses.push(...inlineSenses)

      continue
    }

    if (!currentEntry) continue

    currentSourceLines.push(line)

    let matchedSense = false
    for (const senseRegex of config.senseNumberRegexes) {
      const sm = senseRegex.exec(processLine)
      if (sm) {
        const rawNumber = sm[1] ?? sm[0]
        const rawDefinition = processLine.slice(sm[0].length).trim()
        const { register, rest: afterRegister } = extractRegister(rawDefinition, config.registerRegex)
        const { grammaticalCat, rest: afterPos } = extractPos(afterRegister, config.posRegex)
        const { etymology, rest } = extractEtymology(afterPos, config.etymologyRegex)
        currentEntry.senses.push({
          rawNumber,
          normalizedNumber: normalizeSenseNumber(rawNumber),
          rawDefinition,
          definition: normalizeText(rest),
          grammaticalCat,
          register,
          etymology,
          examples: [],
        })
        matchedSense = true
        break
      }
    }

    if (!matchedSense && config.raw.exampleSeparator && processLine.includes(config.raw.exampleSeparator)) {
      const lastSense = currentEntry.senses[currentEntry.senses.length - 1]
      if (lastSense) {
        const parts = processLine.split(config.raw.exampleSeparator).filter(Boolean)
        for (const part of parts) {
          const rawText = part.trim()
          lastSense.examples.push({
            rawText,
            normalizedText: expandSymbols(normalizeText(rawText), currentEntry.normalizedHeadword, config.substitutionRules),
          })
        }
      }
    }
  }

  flushEntry()
  rl.close()
  return { entries: results, totalLinesScanned: lineNumber }
}

export async function previewParseDocx(
  filePath: string,
  config: CompiledConfig,
  maxEntries: number,
  startIndex = 0
): Promise<ParsePreviewResult> {
  const { streamDocxLines } = await import('./docx-stream.js')
  const lines: string[] = []
  for await (const line of streamDocxLines(filePath)) {
    lines.push(line)
  }
  return previewParseLines(lines, config, maxEntries, startIndex)
}

export async function previewParseDoc(
  filePath: string,
  config: CompiledConfig,
  maxEntries: number,
  startIndex = 0
): Promise<ParsePreviewResult> {
  const WordExtractor = (await import('word-extractor')).default
  const extractor = new WordExtractor()
  const extracted = await extractor.extract(filePath)
  return previewParseLines(extracted.getBody().split('\n'), config, maxEntries, startIndex)
}

export async function previewParsePdf(
  filePath: string,
  config: CompiledConfig,
  maxEntries: number,
  startIndex = 0
): Promise<ParsePreviewResult> {
  const pdfParse = (await import('pdf-parse')).default
  const buffer = await fs.promises.readFile(filePath)
  const data = await pdfParse(buffer)
  return previewParseLines(data.text.split('\n'), config, maxEntries, startIndex)
}
