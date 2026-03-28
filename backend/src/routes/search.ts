import { FastifyPluginAsync } from 'fastify'
import { Prisma } from '@prisma/client'
import { authGuard, requireSessionUser } from '../lib/auth-guard.js'
import { badRequest } from '../lib/errors.js'

const searchRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/search/versions — flat list of session user's versions for filter dropdown
  fastify.get('/search/versions', { preHandler: authGuard() }, async (request) => {
    const user = requireSessionUser(request)
    const versions = await fastify.db.dictionaryVersion.findMany({
      where: { dictionary: { userId: user.id } },
      select: {
        id: true,
        label: true,
        publishedYear: true,
        dictionary: { select: { id: true, name: true } },
      },
      orderBy: [{ dictionary: { name: 'asc' } }, { publishedYear: 'asc' }],
    })
    return versions.map((v) => ({
      id: v.id,
      label: v.label,
      dictionaryId: v.dictionary.id,
      dictionaryName: v.dictionary.name,
      publishedYear: v.publishedYear,
    }))
  })

  // GET /api/v1/search/headword
  fastify.get('/search/headword', { preHandler: authGuard() }, async (request) => {
    const user = requireSessionUser(request)
    const {
      q,
      versionId,
      matchMode = 'contains',
      headwordType = 'all',
      searchScope = 'entry',
      page = '1',
      pageSize = '20',
      taxonomySourceId,
      taxonomyNodeId,
    } = request.query as {
      q?: string
      versionId?: string
      matchMode?: 'contains' | 'startsWith'
      headwordType?: 'all' | 'single' | 'compound'
      searchScope?: 'entry' | 'definition'
      page?: string
      pageSize?: string
      taxonomySourceId?: string
      taxonomyNodeId?: string
    }

    // Require at least a query, a version filter, or a taxonomy filter
    const hasTaxonomyFilter = taxonomySourceId && taxonomyNodeId
    if (!q?.trim() && !versionId && !hasTaxonomyFilter) return { items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 }

    const pageNum = Math.max(1, parseInt(page) || 1)
    const pageSizeNum = Math.min(100, Math.max(1, parseInt(pageSize) || 20))

    // Combine all conditions with AND to avoid key collision
    const andClauses: Prisma.EntryWhereInput[] = []

    if (q?.trim()) {
      if (searchScope === 'entry') {
        // Search in headword (词条检索)
        andClauses.push(
          matchMode === 'startsWith'
            ? { normalizedHeadword: { startsWith: q.trim() } }
            : { normalizedHeadword: { contains: q.trim() } }
        )
      } else {
        // Search in definition (释义检索 - including examples)
        const searchTerm = q.trim()
        // Find entries that have senses matching the search term (in definition or examples)
        const matchingSenses = await fastify.db.sense.findMany({
          where: {
            OR: [
              { rawDefinition: { contains: searchTerm } },
              { examples: { some: { rawText: { contains: searchTerm } } } }
            ]
          },
          select: { entryId: true },
          distinct: ['entryId'],
          take: 2000,
        })
        const entryIds = matchingSenses.map(s => s.entryId)
        if (entryIds.length === 0) {
          return { items: [], total: 0, page: pageNum, pageSize: pageSizeNum, totalPages: 0 }
        }
        andClauses.push({ id: { in: entryIds } })
      }
    }

    if (headwordType === 'compound') {
      // Compound headwords (词头) are enclosed in 【...】 brackets
      andClauses.push({ normalizedHeadword: { startsWith: '【' } })
    } else if (headwordType === 'single') {
      // Single-character headwords (字头) don't start with 【
      andClauses.push({ NOT: { normalizedHeadword: { startsWith: '【' } } })
    }

    if (versionId) {
      andClauses.push({ versionId })
    }

    // Scope to session user's dictionaries
    andClauses.push({ version: { dictionary: { userId: user.id } } })

    if (taxonomySourceId && taxonomyNodeId) {
      const taxSource = await fastify.db.taxonomySource.findUnique({ where: { id: taxonomySourceId }, select: { status: true } })
      if (!taxSource) throw badRequest(`Taxonomy source '${taxonomySourceId}' not found`)
      if (taxSource.status !== 'ACTIVE') throw badRequest(`Taxonomy source is not ready (status: ${taxSource.status}). Wait for import to complete.`)
      const { getSubtreeNodeIds, getSubtreeHeadwords } = await import('../services/taxonomy/tree.js')
      const nodeIds = await getSubtreeNodeIds(taxonomyNodeId, fastify.db as any)
      const headwords = await getSubtreeHeadwords(nodeIds, taxonomySourceId, fastify.db as any)
      if (headwords.length === 0) {
        return { items: [], total: 0, page: pageNum, pageSize: pageSizeNum, totalPages: 0 }
      }
      andClauses.push({ normalizedHeadword: { in: headwords } })
    }

    const where: Prisma.EntryWhereInput = andClauses.length > 0 ? { AND: andClauses } : {}

    const [total, entries] = await Promise.all([
      fastify.db.entry.count({ where }),
      fastify.db.entry.findMany({
        where,
        include: {
          senses: {
            include: { examples: true },
            orderBy: { position: 'asc' },
          },
          version: {
            include: { dictionary: { select: { id: true, name: true } } },
          },
        },
        orderBy: [{ version: { publishedYear: 'asc' } }, { normalizedHeadword: 'asc' }],
        skip: (pageNum - 1) * pageSizeNum,
        take: pageSizeNum,
      }),
    ])

    const items = entries.map((entry) => ({
      dictionaryId: entry.version.dictionary.id,
      dictionaryName: entry.version.dictionary.name,
      versionId: entry.versionId,
      versionLabel: entry.version.label,
      publishedYear: entry.version.publishedYear,
      entry: {
        id: entry.id,
        versionId: entry.versionId,
        rawHeadword: entry.rawHeadword,
        normalizedHeadword: entry.normalizedHeadword,
        phonetic: entry.phonetic,
        pageNumber: entry.pageNumber,
        lineNumber: entry.lineNumber,
        crossReferences: (entry.metadata as { crossReferences?: string[] } | null)?.crossReferences ?? null,
        senses: entry.senses.map((s) => ({
          id: s.id,
          rawNumber: s.rawNumber,
          normalizedNumber: s.normalizedNumber,
          definition: s.definition,
          rawDefinition: s.rawDefinition,
          grammaticalCat: s.grammaticalCat,
          register: s.register,
          etymology: s.etymology,
          position: s.position,
          examples: s.examples.map((ex) => ({
            id: ex.id,
            rawText: ex.rawText,
            normalizedText: ex.normalizedText,
            position: ex.position,
          })),
        })),
      },
    }))

    return { items, total, page: pageNum, pageSize: pageSizeNum, totalPages: Math.ceil(total / pageSizeNum) }
  })
}

export default searchRoutes
