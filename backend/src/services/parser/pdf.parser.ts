import fs from 'node:fs'
import pdfParse from 'pdf-parse'
import { CompiledConfig } from '../config-engine.js'
import { expandSymbols, normalizeSenseNumber, normalizeHeadword, normalizeText, normalizePhonetic } from '../normalizer.js'
import { ParsedEntry, ParsedSense, ParseError, ParseChunk } from './types.js'
import { extractInlineSenses, extractPos, extractRegister, extractEtymology, tryExtractInlineEntry } from './inline-sense.js'

const BATCH_SIZE = 200

export async function* parsePdf(
  filePath: string,
  config: CompiledConfig
): AsyncGenerator<ParseChunk> {
  const buffer = fs.readFileSync(filePath)

  // pdf-parse extracts all text; we process page by page
  let pageIndex = 0
  const allEntries: ParsedEntry[] = []
  const allErrors: ParseError[] = []

  await pdfParse(buffer, {
    pagerender(pageData: { pageIndex: number; getTextContent(): Promise<{ items: Array<{ str: string; transform: number[] }> }> }) {
      pageIndex = pageData.pageIndex + 1
      return pageData.getTextContent().then((textContent) => {
        const items = textContent.items as Array<{ str: string; transform: number[] }>

        if (items.length === 0) {
          allErrors.push({
            pageNumber: pageIndex,
            rawText: '',
            fieldName: 'page',
            errorCode: 'PAGE_NEEDS_OCR',
            errorDetail: `Page ${pageIndex} returned 0 characters — may need OCR`,
          })
          return ''
        }

        // Group items by y-coordinate to reconstruct lines
        const lineMap = new Map<number, string[]>()
        for (const item of items) {
          const y = Math.round(item.transform[5])
          if (!lineMap.has(y)) lineMap.set(y, [])
          lineMap.get(y)!.push(item.str)
        }

        // Sort by y descending (top of page first in PDF coordinates)
        const sortedY = [...lineMap.keys()].sort((a, b) => b - a)
        return sortedY.map((y) => lineMap.get(y)!.join('')).join('\n')
      })
    },
  })

  // Now parse the reconstructed text lines
  const text = (await pdfParse(buffer)).text
  const lines = text.split('\n')

  let currentEntry: ParsedEntry | null = null
  let currentSense: ParsedSense | null = null
  let inlineCharEntry: ParsedEntry | null = null
  let lineNumber = 0
  let entryBatch: ParsedEntry[] = []
  let errorBatch: ParseError[] = []

  function flushSense() {
    if (currentSense && currentEntry) {
      currentEntry.senses.push(currentSense)
      currentSense = null
    }
  }

  function flushEntry() {
    flushSense()
    if (currentEntry) {
      entryBatch.push(currentEntry)
      currentEntry = null
    }
  }

  for (const line of lines) {
    lineNumber++
    const trimmed = line.trim()
    if (!trimmed) continue

    let processLine = trimmed

    if (config.crossReferenceRegex) {
      const crMatch = config.crossReferenceRegex.exec(processLine)
      if (crMatch) {
        // Route to inlineCharEntry if set: cross-ref belongs to the char entry,
        // not to the sub-entry that is now currentEntry.
        // Note: this routing only applies to cross-references on subsequent lines.
        // A cross-reference on the same headword line as the inline entry would be
        // processed here before inlineCharEntry is set (that happens later in the
        // hwMatch block). In practice, 另见 always appears on its own line.
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

    if (config.skipLineRegexes.length > 0 && config.skipLineRegexes.some((r) => r.test(processLine))) continue

    const hwMatch = config.headwordRegex.exec(processLine)
    if (hwMatch) {
      flushEntry()
      inlineCharEntry = null

      let rawHeadword = hwMatch[1] ?? hwMatch[0]
      if (config.headwordVariantSuffixRegex) {
        const vsm = config.headwordVariantSuffixRegex.exec(rawHeadword)
        if (vsm) rawHeadword = rawHeadword.slice(0, vsm.index)
      }
      const normalizedHeadword = normalizeHeadword(rawHeadword, config.tradSimpMap, config.glyphVariants)

      let phonetic: string | undefined
      if (config.phoneticRegex) {
        const pm = config.phoneticRegex.exec(processLine)
        if (pm) phonetic = normalizePhonetic((pm[1] ?? pm[0]).trim())
      }

      currentEntry = { rawHeadword, normalizedHeadword, phonetic, lineNumber, senses: [] }

      let remainder = processLine.slice(hwMatch.index + hwMatch[0].length)
      if (config.headwordVariantSuffixRegex) {
        const vsm = config.headwordVariantSuffixRegex.exec(remainder)
        if (vsm && vsm.index === 0) remainder = remainder.slice(vsm[0].length)
      }
      const inlineResult = tryExtractInlineEntry(remainder, config, phonetic)
      if (inlineResult) {
        // Safe to push directly (not via flushEntry): flushEntry() was called at the top
        // of this hwMatch block; currentEntry was just constructed with an empty senses array.
        entryBatch.push(currentEntry)
        inlineCharEntry = currentEntry  // keep reference for cross-reference routing

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
      if (inlineSenses.length > 0) currentEntry.senses.push(...inlineSenses)

      continue
    }

    if (!currentEntry) continue

    let matchedSense = false
    for (const senseRegex of config.senseNumberRegexes) {
      const sm = senseRegex.exec(processLine)
      if (sm) {
        flushSense()
        const rawNumber = sm[1] ?? sm[0]
        const rawDefinition = processLine.slice(sm[0].length).trim()
        const { register, rest: afterRegister } = extractRegister(rawDefinition, config.registerRegex)
        const { grammaticalCat, rest: afterPos } = extractPos(afterRegister, config.posRegex)
        const { etymology, rest } = extractEtymology(afterPos, config.etymologyRegex)
        currentSense = {
          rawNumber,
          normalizedNumber: normalizeSenseNumber(rawNumber),
          rawDefinition,
          definition: normalizeText(rest),
          grammaticalCat,
          register,
          etymology,
          examples: [],
        }
        matchedSense = true
        break
      }
    }

    if (!matchedSense && currentSense && config.raw.exampleSeparator) {
      if (processLine.includes(config.raw.exampleSeparator)) {
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
      }
    }
  }

  flushEntry()

  // Yield in batches
  while (entryBatch.length > 0 || errorBatch.length > 0) {
    const chunk: ParseChunk = {
      entries: entryBatch.splice(0, BATCH_SIZE),
      errors: errorBatch.splice(0, BATCH_SIZE),
    }
    yield chunk
  }

  if (allEntries.length > 0 || allErrors.length > 0) {
    yield { entries: allEntries, errors: allErrors }
  }
}
