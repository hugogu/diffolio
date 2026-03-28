import DiffMatchPatch from 'diff-match-patch'
import { stripForComparison, normalizePhonetic } from './normalizer.js'

const dmp = new DiffMatchPatch()

export type SenseChangeType =
  | 'MATCHED'
  | 'DEFINITION_CHANGED'
  | 'POS_CHANGED'
  | 'EXAMPLE_CHANGED'
  | 'RENUMBERED'
  | 'SPLIT'
  | 'MERGED'
  | 'ADDED'
  | 'DELETED'

export interface SenseDiffResult {
  senseAId: string | null
  senseBId: string | null
  changeType: SenseChangeType
  diffSummary: unknown // diff-match-patch diff array or descriptive payload
}

interface SenseRow {
  id: string
  normalizedNumber: string
  definition: string
  phonetic?: string | null
  grammaticalCat?: string | null
  register?: string | null
  examples: { normalizedText: string }[]
}

/**
 * Compute character-level dmp diff between two strings.
 * Returns the diff array (serialisable to JSON).
 */
function computeDiff(textA: string, textB: string): [number, string][] {
  const diffs = dmp.diff_main(textA, textB)
  dmp.diff_cleanupSemantic(diffs)
  return diffs
}

/**
 * Simple similarity score: 0.0 (completely different) to 1.0 (identical).
 * Based on common character ratio.
 */
function similarity(a: string, b: string): number {
  if (a === b) return 1.0
  if (!a || !b) return 0.0
  const diffs = dmp.diff_main(a, b)
  const levenshtein = dmp.diff_levenshtein(diffs)
  const maxLen = Math.max(a.length, b.length)
  return maxLen === 0 ? 1.0 : 1.0 - levenshtein / maxLen
}

function equalAfterComparisonStrip(a: string | null | undefined, b: string | null | undefined): boolean {
  return stripForComparison(a ?? '') === stripForComparison(b ?? '')
}

/**
 * Diff senses from two versions of the same aligned entry.
 *
 * Matching strategy:
 *  1. Exact normalizedNumber match
 *  2. Definition similarity ≥ 0.7 (detect RENUMBERED)
 *  3. Unmatched A senses → DELETED, unmatched B senses → ADDED
 *  4. SPLIT / MERGED detection on remaining groups
 */
export function diffSenses(sensesA: SenseRow[], sensesB: SenseRow[]): SenseDiffResult[] {
  const results: SenseDiffResult[] = []
  const matchedBIds = new Set<string>()

  // Step 1: Match by normalizedNumber
  for (const sA of sensesA) {
    const sB = sensesB.find((s) => s.normalizedNumber === sA.normalizedNumber)
    if (!sB) continue
    matchedBIds.add(sB.id)

    const examplesA = sA.examples.map((e) => e.normalizedText).join(' ')
    const examplesB = sB.examples.map((e) => e.normalizedText).join(' ')
    // Separate definition/register/phonetic changes from grammaticalCat changes
    const defChanged =
      stripForComparison(sA.definition) !== stripForComparison(sB.definition) ||
      (normalizePhonetic(sA.phonetic ?? '') ?? '').trim() !== (normalizePhonetic(sB.phonetic ?? '') ?? '').trim() ||
      !equalAfterComparisonStrip(sA.register, sB.register)
    const posChanged = !equalAfterComparisonStrip(sA.grammaticalCat, sB.grammaticalCat)
    const exChanged = stripForComparison(examplesA) !== stripForComparison(examplesB)

    let changeType: SenseChangeType
    if (!defChanged && !posChanged && !exChanged) {
      changeType = 'MATCHED'
    } else if (defChanged) {
      // Definition change takes precedence; POS change (if any) recorded in diffSummary
      changeType = 'DEFINITION_CHANGED'
    } else if (posChanged) {
      changeType = 'POS_CHANGED'
    } else {
      changeType = 'EXAMPLE_CHANGED'
    }

    results.push({
      senseAId: sA.id,
      senseBId: sB.id,
      changeType,
      diffSummary:
        changeType === 'MATCHED'
          ? null
          : {
              defDiff: computeDiff(sA.definition, sB.definition),
              posChanged,
              posA: sA.grammaticalCat ?? null,
              posB: sB.grammaticalCat ?? null,
            },
    })
  }

  const unmatchedA = sensesA.filter((s) => !results.some((r) => r.senseAId === s.id))
  const unmatchedB = sensesB.filter((s) => !matchedBIds.has(s.id))

  // Step 2: Try definition-similarity matching for RENUMBERED
  const remainingB = [...unmatchedB]
  for (const sA of unmatchedA) {
    let bestScore = 0.7 // minimum threshold
    let bestIdx = -1
    for (let i = 0; i < remainingB.length; i++) {
      const score = similarity(stripForComparison(sA.definition), stripForComparison(remainingB[i].definition))
      if (score > bestScore) {
        bestScore = score
        bestIdx = i
      }
    }
    if (bestIdx >= 0) {
      const sB = remainingB.splice(bestIdx, 1)[0]
      results.push({
        senseAId: sA.id,
        senseBId: sB.id,
        changeType: 'RENUMBERED',
        diffSummary: { diffA: computeDiff(sA.definition, sB.definition) },
      })
    }
  }

  // Step 3: Remaining unmatched
  const stillUnmatchedA = unmatchedA.filter((s) => !results.some((r) => r.senseAId === s.id))

  for (const sA of stillUnmatchedA) {
    results.push({ senseAId: sA.id, senseBId: null, changeType: 'DELETED', diffSummary: null })
  }
  for (const sB of remainingB) {
    results.push({ senseAId: null, senseBId: sB.id, changeType: 'ADDED', diffSummary: null })
  }

  return results
}

/**
 * On-the-fly entry diff without DB persistence (used by batch diff API).
 */
export function diffEntriesDirect(
  entryA: { id: string; senses: SenseRow[] },
  entryB: { id: string; senses: SenseRow[] }
): SenseDiffResult[] {
  return diffSenses(entryA.senses, entryB.senses)
}
