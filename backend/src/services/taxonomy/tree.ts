import { PrismaClient } from '@prisma/client'

/**
 * Get all TaxonomyNode IDs in the subtree rooted at rootNodeId (inclusive).
 */
export async function getSubtreeNodeIds(rootNodeId: string, prisma: PrismaClient): Promise<string[]> {
  const rootNode = await prisma.taxonomyNode.findUnique({ where: { id: rootNodeId } })
  if (!rootNode) return []

  // Use path prefix matching: all nodes whose path starts with rootNode.path
  const nodes = await prisma.taxonomyNode.findMany({
    where: {
      taxonomySourceId: rootNode.taxonomySourceId,
      path: { startsWith: rootNode.path },
    },
    select: { id: true },
  })
  return nodes.map((n) => n.id)
}

/**
 * Get all distinct normalizedHeadwords in the subtree rooted at rootNodeId.
 */
export async function getSubtreeHeadwords(nodeIds: string[], taxonomySourceId: string, prisma: PrismaClient): Promise<string[]> {
  if (nodeIds.length === 0) return []

  const entries = await prisma.taxonomyEntry.findMany({
    where: { nodeId: { in: nodeIds }, taxonomySourceId },
    select: { normalizedHeadword: true },
    distinct: ['normalizedHeadword'],
  })
  // Return both the raw headword and the bracketed form used for compound
  // entries in the dictionary (e.g. "爱不释手" → also "【爱不释手】").
  const headwords: string[] = []
  for (const e of entries) {
    headwords.push(e.normalizedHeadword)
    headwords.push(`【${e.normalizedHeadword}】`)
  }
  return headwords
}
