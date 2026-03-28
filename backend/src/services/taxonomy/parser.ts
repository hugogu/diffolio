import { CompiledTaxonomyConfig, normalizeHeadword } from './config.js'
import { extractText } from './text-extractor.js'

export interface ParsedNode {
  level: 1 | 2 | 3 | 4
  label: string
  sequencePosition: number
  path: string
  headwords?: string[]  // only for level 4
}

export interface ParseWarning {
  lineNumber: number
  rawText: string
  reason: string
}

export interface TaxonomyChunk {
  nodes: ParsedNode[]
  warnings: ParseWarning[]
}

function padPos(n: number): string {
  return n.toString().padStart(4, '0')
}

export async function* parseTaxonomyFile(
  filePath: string,
  config: CompiledTaxonomyConfig
): AsyncGenerator<TaxonomyChunk> {
  // Extract text from various file formats (TXT, DOC, DOCX, PDF)
  const text = await extractText(filePath)
  const lines = text.split('\n')

  // Stack tracks current path at each level: [l1Seq, l2Seq, l3Seq]
  // sequenceCounters[level] = counter for children of current parent
  const currentPath: (number | null)[] = [null, null, null, null] // indices 1-3 used for L1-L3
  const sequenceCounters: number[] = [0, 0, 0, 0, 0] // index 1-4
  // Track last node at each level for parent path
  const levelPaths: string[] = ['', '', '', '', '']

  let lineNumber = 0
  const CHUNK_SIZE = 500

  let pendingNodes: ParsedNode[] = []
  let pendingWarnings: ParseWarning[] = []

  function buildPath(level: number): string {
    const parts: string[] = []
    for (let l = 1; l <= level; l++) {
      if (currentPath[l] === null) {
        // Should not happen in well-formed input
        parts.push('0000')
      } else {
        parts.push(padPos(currentPath[l] as number))
      }
    }
    return parts.join('/')
  }

  for (const line of lines) {
    lineNumber++

    // Skip blank / skip-pattern lines
    if (config.skipLineRegexes.some((r) => r.test(line))) continue

    const trimmed = line.trim()
    if (!trimmed) continue

    // Try level 1
    const m1 = trimmed.match(config.level1Regex)
    if (m1) {
      sequenceCounters[1]++
      sequenceCounters[2] = 0
      sequenceCounters[3] = 0
      sequenceCounters[4] = 0
      currentPath[1] = sequenceCounters[1] - 1
      currentPath[2] = null
      currentPath[3] = null
      const path = padPos(currentPath[1] as number)
      levelPaths[1] = path
      pendingNodes.push({ level: 1, label: (m1[1] ?? m1[0]).trim(), sequencePosition: currentPath[1] as number, path })
      if (pendingNodes.length >= CHUNK_SIZE) {
        yield { nodes: pendingNodes, warnings: pendingWarnings }
        pendingNodes = []
        pendingWarnings = []
      }
      continue
    }

    // Try level 2
    const m2 = trimmed.match(config.level2Regex)
    if (m2) {
      sequenceCounters[2]++
      sequenceCounters[3] = 0
      sequenceCounters[4] = 0
      currentPath[2] = sequenceCounters[2] - 1
      currentPath[3] = null
      const l1 = currentPath[1] !== null ? padPos(currentPath[1] as number) : '0000'
      const path = `${l1}/${padPos(currentPath[2] as number)}`
      levelPaths[2] = path
      pendingNodes.push({ level: 2, label: (m2[1] ?? m2[0]).trim(), sequencePosition: currentPath[2] as number, path })
      if (pendingNodes.length >= CHUNK_SIZE) {
        yield { nodes: pendingNodes, warnings: pendingWarnings }
        pendingNodes = []
        pendingWarnings = []
      }
      continue
    }

    // Try level 3
    const m3 = trimmed.match(config.level3Regex)
    if (m3) {
      sequenceCounters[3]++
      sequenceCounters[4] = 0
      currentPath[3] = sequenceCounters[3] - 1
      const l1 = currentPath[1] !== null ? padPos(currentPath[1] as number) : '0000'
      const l2 = currentPath[2] !== null ? padPos(currentPath[2] as number) : '0000'
      const path = `${l1}/${l2}/${padPos(currentPath[3] as number)}`
      levelPaths[3] = path
      pendingNodes.push({ level: 3, label: (m3[1] ?? m3[0]).trim(), sequencePosition: currentPath[3] as number, path })
      if (pendingNodes.length >= CHUNK_SIZE) {
        yield { nodes: pendingNodes, warnings: pendingWarnings }
        pendingNodes = []
        pendingWarnings = []
      }
      continue
    }

    // Try level 4
    const m4 = trimmed.match(config.level4Regex)
    if (m4) {
      sequenceCounters[4]++
      const seqPos = sequenceCounters[4] - 1
      const l1 = currentPath[1] !== null ? padPos(currentPath[1] as number) : '0000'
      const l2 = currentPath[2] !== null ? padPos(currentPath[2] as number) : '0000'
      const l3 = currentPath[3] !== null ? padPos(currentPath[3] as number) : '0000'
      const path = `${l1}/${l2}/${l3}/${padPos(seqPos)}`
      // m4[2] is the headword list string
      const rawList = m4[2] ?? ''
      const headwords = rawList
        .split(config.headwordSeparator)
        .map((hw) => hw.trim())
        .filter(Boolean)
      pendingNodes.push({
        level: 4,
        label: (m4[1] ?? '').trim(),
        sequencePosition: seqPos,
        path,
        headwords,
      })
      if (pendingNodes.length >= CHUNK_SIZE) {
        yield { nodes: pendingNodes, warnings: pendingWarnings }
        pendingNodes = []
        pendingWarnings = []
      }
      continue
    }

    // Unknown line
    pendingWarnings.push({ lineNumber, rawText: trimmed, reason: 'No pattern matched' })
  }

  if (pendingNodes.length > 0 || pendingWarnings.length > 0) {
    yield { nodes: pendingNodes, warnings: pendingWarnings }
  }
}
