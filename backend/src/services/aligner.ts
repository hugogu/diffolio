import { PrismaClient, Entry } from '@prisma/client'

export type ChangeType = 'MATCHED' | 'ADDED' | 'DELETED' | 'MATCHED_VARIANT'

export interface AlignmentResult {
  entryAId: string | null
  entryBId: string | null
  changeType: ChangeType
  alignScore: number | null
}

type EntryWithRelations = Entry

/**
 * Builds a glyph variant → canonical map from a FormatConfig JSON blob.
 * Config shape (optional): { glyphVariants: Record<string, string[]> }
 * where keys are canonical forms and values are variant lists.
 */
function buildVariantMap(configJson: unknown): Map<string, string> {
  const map = new Map<string, string>()
  if (!configJson || typeof configJson !== 'object') return map
  const cfg = configJson as Record<string, unknown>
  const variants = cfg['glyphVariants']
  if (!variants || typeof variants !== 'object') return map
  for (const [canonical, variantList] of Object.entries(variants as Record<string, unknown>)) {
    if (Array.isArray(variantList)) {
      for (const v of variantList) {
        if (typeof v === 'string') map.set(v, canonical)
      }
    }
  }
  return map
}

function compositeKey(hw: string, phonetic: string | null | undefined): string {
  return hw + '|' + (phonetic ?? '')
}

/**
 * Align entries from two dictionary versions.
 * Strategy:
 *   1. Composite key (normalizedHeadword + '|' + phonetic) → MATCHED (score 1.0)
 *      Used when A entry has a phonetic, to correctly pair multi-reading entries.
 *   2. Exact normalizedHeadword match (first unmatched B entry) → MATCHED (score 1.0)
 *   3. Glyph-variant / trad-simp match via FormatConfig glyphVariants → MATCHED_VARIANT (score 0.8)
 *   4. Unmatched A entries → DELETED
 *   5. Unmatched B entries → ADDED
 *
 * Entries are queried in document order (pageNumber/lineNumber/entrySequence)
 * so that first-match selection is deterministic and follows source ordering.
 */
export async function align(
  versionAId: string,
  versionBId: string,
  db: PrismaClient
): Promise<AlignmentResult[]> {
  const [versionA, versionB] = await Promise.all([
    db.dictionaryVersion.findUnique({
      where: { id: versionAId },
      include: { formatConfig: true },
    }),
    db.dictionaryVersion.findUnique({
      where: { id: versionBId },
      include: { formatConfig: true },
    }),
  ])

  const ORDER = [
    { pageNumber: 'asc' as const },
    { lineNumber: 'asc' as const },
    { entrySequence: 'asc' as const },
    { createdAt: 'asc' as const },
    { id: 'asc' as const },
  ]
  const [entriesA, entriesB] = await Promise.all([
    db.entry.findMany({ where: { versionId: versionAId }, orderBy: ORDER }),
    db.entry.findMany({ where: { versionId: versionBId }, orderBy: ORDER }),
  ])

  // Build variant maps from both configs
  const variantMapA = buildVariantMap(versionA?.formatConfig?.configJson)
  const variantMapB = buildVariantMap(versionB?.formatConfig?.configJson)

  function normalize(hw: string): string {
    return variantMapA.get(hw) ?? variantMapB.get(hw) ?? hw
  }

  // Index B entries for efficient lookup
  // bComposite: "hw|phonetic" → Entry  (entries WITH phonetic; for multi-reading matching)
  // bByHeadword: hw → Entry[]           (all B entries grouped by normalizedHeadword)
  // bByNormHw: norm-hw → Entry[]        (variant-normalised headword → entries, when norm≠original)
  const bComposite = new Map<string, EntryWithRelations>()
  const bByHeadword = new Map<string, EntryWithRelations[]>()
  const bByNormHw = new Map<string, EntryWithRelations[]>()

  for (const e of entriesB) {
    if (e.phonetic) {
      bComposite.set(compositeKey(e.normalizedHeadword, e.phonetic), e)
    }
    const hwList = bByHeadword.get(e.normalizedHeadword) ?? []
    hwList.push(e)
    bByHeadword.set(e.normalizedHeadword, hwList)

    const norm = normalize(e.normalizedHeadword)
    if (norm !== e.normalizedHeadword) {
      const normList = bByNormHw.get(norm) ?? []
      normList.push(e)
      bByNormHw.set(norm, normList)
    }
  }

  const results: AlignmentResult[] = []
  const matchedBIds = new Set<string>()

  for (const entryA of entriesA) {
    // 1. Composite key match (when A has a phonetic)
    if (entryA.phonetic) {
      const compositeMatch = bComposite.get(compositeKey(entryA.normalizedHeadword, entryA.phonetic))
      if (compositeMatch && !matchedBIds.has(compositeMatch.id)) {
        results.push({
          entryAId: entryA.id,
          entryBId: compositeMatch.id,
          changeType: 'MATCHED',
          alignScore: 1.0,
        })
        matchedBIds.add(compositeMatch.id)
        continue
      }
    }

    // 2. Exact headword match (first unmatched B entry with same normalizedHeadword)
    const exactCandidates = bByHeadword.get(entryA.normalizedHeadword) ?? []
    const exactMatch = exactCandidates.find((e) => !matchedBIds.has(e.id))
    if (exactMatch) {
      results.push({
        entryAId: entryA.id,
        entryBId: exactMatch.id,
        changeType: 'MATCHED',
        alignScore: 1.0,
      })
      matchedBIds.add(exactMatch.id)
      continue
    }

    // 3. Variant match (normalise A's headword, look up in B)
    const normA = normalize(entryA.normalizedHeadword)
    if (normA !== entryA.normalizedHeadword) {
      const variantCandidates = [
        ...(bByNormHw.get(normA) ?? []),
        ...(bByHeadword.get(normA) ?? []),
      ]
      const variantMatch = variantCandidates.find((e) => !matchedBIds.has(e.id))
      if (variantMatch) {
        results.push({
          entryAId: entryA.id,
          entryBId: variantMatch.id,
          changeType: 'MATCHED_VARIANT',
          alignScore: 0.8,
        })
        matchedBIds.add(variantMatch.id)
        continue
      }
    }

    // 4. Deleted from A
    results.push({ entryAId: entryA.id, entryBId: null, changeType: 'DELETED', alignScore: null })
  }

  // 5. Added in B (not matched)
  for (const entryB of entriesB) {
    if (!matchedBIds.has(entryB.id)) {
      results.push({ entryAId: null, entryBId: entryB.id, changeType: 'ADDED', alignScore: null })
    }
  }

  return results
}
