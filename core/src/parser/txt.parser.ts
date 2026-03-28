import fs from 'node:fs'
import readline from 'node:readline'
import { CompiledConfig } from '../config-engine.js'
import { expandSymbols, normalizeSenseNumber, normalizeHeadword, normalizeText, normalizePhonetic } from '../normalizer.js'
import { ParsedEntry, ParsedSense, ParseError, ParseChunk } from './types.js'
import { extractInlineSenses, extractPos, extractRegister, extractEtymology, tryExtractInlineEntry } from './inline-sense.js'

const BATCH_SIZE = 200

export async function* parseTxt(
  filePath: string,
  config: CompiledConfig
): AsyncGenerator<ParseChunk> {
  const fileStream = fs.createReadStream(filePath, { encoding: 'utf-8' })
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity })

  let entries: ParsedEntry[] = []
  let errors: ParseError[] = []
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
      entries.push(currentEntry)
      currentEntry = null
    }
  }

  for await (const line of rl) {
    lineNumber++
    const trimmed = line.trim()
    if (!trimmed) continue

    let processLine = trimmed

    // Check cross-reference BEFORE headword: "另" is CJK and would match the headword regex
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

    // Skip lines matching skip patterns (e.g. phonetic section headers like "á(丫)")
    if (config.skipLineRegexes.length > 0 && config.skipLineRegexes.some((r) => r.test(processLine))) continue

    // Test if this line starts a new headword
    const hwMatch = config.headwordRegex.exec(processLine)
    if (hwMatch) {
      flushEntry()
      inlineCharEntry = null

      // Strip any variant-form suffix embedded in the headword match (e.g. "强(*強、*彊)" → "强")
      let rawHeadword = hwMatch[1] ?? hwMatch[0]

      // Extract entry sequence number (e.g., "蔼1" → sequence: 1, headword: "蔼")
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

      // Extract phonetic if pattern provided.
      // Use rawHeadword + rest-of-line so the sequence digit (e.g. the "1" in "埃1")
      // is not sitting between the Chinese char and the phonetic when we apply the regex.
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

      // Skip variant-form suffix at start of remainder so phonetic stripping and POS extraction work.
      // e.g. "啊(呵)á叹..." → remainder starts with "(呵)á叹..." → skip "(呵)" → "á叹..."
      let remainder = processLine.slice(hwMatch.index + hwMatch[0].length)
      if (config.headwordVariantSuffixRegex) {
        const vsm = config.headwordVariantSuffixRegex.exec(remainder)
        if (vsm && vsm.index === 0) remainder = remainder.slice(vsm[0].length)
      }
      const inlineResult = tryExtractInlineEntry(remainder, config, phonetic)
      if (inlineResult) {
        // Safe to push directly (not via flushEntry): flushEntry() was called at the top
        // of this hwMatch block; currentEntry was just constructed with an empty senses array.
        entries.push(currentEntry)
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
    }

    // Yield batch
    if (entries.length >= BATCH_SIZE) {
      yield { entries, errors }
      entries = []
      errors = []
    }
  }

  flushEntry()

  if (entries.length > 0 || errors.length > 0) {
    yield { entries, errors }
  }
}
