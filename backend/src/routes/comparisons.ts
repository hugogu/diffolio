import { FastifyPluginAsync } from 'fastify'
import { authGuard, requireSessionUser } from '../lib/auth-guard.js'
import { assertComparisonOwner, assertVersionOwner } from '../lib/ownership.js'
import { notFound, badRequest, extractRootCause } from '../lib/errors.js'
import { chargeComparisonEnergy } from '../services/subscription/energy.js'

type TagResponse = {
  id: string
  name: string
}

const comparisonRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/comparisons', { preHandler: authGuard() }, async (request) => {
    try {
      const user = requireSessionUser(request)
      const comparisons = await fastify.db.comparison.findMany({
        take: 200,
        orderBy: { createdAt: 'desc' },
        where: { versionA: { dictionary: { userId: user.id } } },
        include: {
          versionA: {
            select: { id: true, label: true, dictionary: { select: { id: true, name: true } } },
          },
          versionB: {
            select: { id: true, label: true, dictionary: { select: { id: true, name: true } } },
          },
        },
      })
      return { items: comparisons, hasMore: false, nextCursor: null }
    } catch (error) { throw error }
  })

  fastify.post('/comparisons', { preHandler: authGuard() }, async (request, reply) => {
    try {
      const user = requireSessionUser(request)
      const { versionAId, versionBId } = request.body as { versionAId: string; versionBId: string }
      await assertVersionOwner(fastify.db, versionAId, user.id)
      await assertVersionOwner(fastify.db, versionBId, user.id)

      const existing = await fastify.db.comparison.findUnique({
        where: { versionAId_versionBId: { versionAId, versionBId } },
      })

      let comparison
      if (existing) {
        comparison = await fastify.db.comparison.update({
          where: { id: existing.id },
          data: { status: 'PENDING', completedAt: null },
        })
      } else {
        comparison = await fastify.db.comparison.create({
          data: { versionAId, versionBId, status: 'PENDING' },
        })
      }

      await chargeComparisonEnergy(fastify.db as any, user.id, comparison.id)

      const job = await fastify.comparisonQueue.add('comparison', { comparisonId: comparison.id })
      await fastify.db.comparison.update({ where: { id: comparison.id }, data: { bullmqJobId: job.id } })

      reply.status(202).send(comparison)
    } catch (error) { throw error }
  })

  fastify.get('/comparisons/:id', { preHandler: authGuard() }, async (request) => {
    try {
      const user = requireSessionUser(request)
      const { id } = request.params as { id: string }
      await assertComparisonOwner(fastify.db, id, user.id)
      const comparison = await fastify.db.comparison.findUnique({
        where: { id },
        include: {
          versionA: { include: { dictionary: true } },
          versionB: { include: { dictionary: true } },
        },
      })
      if (!comparison) throw notFound('Comparison', id)

      const definitionChanged = await fastify.db.entryAlignment.count({
        where: {
          comparisonId: id,
          senseDiffs: { some: { changeType: { in: ['DEFINITION_CHANGED', 'POS_CHANGED'] } } },
        },
      })

      return { ...comparison, definitionChanged }
    } catch (error) { throw error }
  })

  fastify.get('/comparisons/:id/alignments', { preHandler: authGuard() }, async (request) => {
    try {
      const user = requireSessionUser(request)
      const { id } = request.params as { id: string }
      await assertComparisonOwner(fastify.db, id, user.id)

      const query = request.query as {
        page?: string
        pageSize?: string
        changeType?: string   // comma-separated for multiple: "ADDED,DELETED"
        senseChangeType?: string
        headword?: string     // filter by rawHeadword contains
        q?: string            // full-text search in rawDefinition
        taxonomySourceId?: string
        taxonomyNodeId?: string
        tagIds?: string
      }

      const pageNum = Math.max(1, parseInt(query.page || '1', 10))
      const size = Math.min(Math.max(1, parseInt(query.pageSize || '20', 10)), 100)
      const skip = (pageNum - 1) * size

      const where: Record<string, unknown> = { comparisonId: id }
      const selectedTagIds = query.tagIds?.split(',').map((value) => value.trim()).filter(Boolean) ?? []

      // Filter by change types
      if (query.changeType) {
        const types = query.changeType.split(',').map((s) => s.trim()).filter(Boolean)
        where.changeType = types.length === 1 ? types[0] : { in: types }
      }

      // Headword / full-text search: resolve matching entry IDs first, then filter
      // by FK. Nested relation object filters on nullable to-one relations are
      // unreliable in Prisma — direct IN on the FK column is guaranteed to work.
      const extra: object[] = []
      if (query.headword?.trim()) {
        const ids = (await fastify.db.entry.findMany({
          where: { rawHeadword: { contains: query.headword.trim() } },
          select: { id: true },
          take: 2000,
        })).map((e) => e.id)
        if (ids.length === 0) {
          return { items: [], total: 0, page: pageNum, pageSize: size, totalPages: 0 }
        }
        extra.push({ OR: [{ entryAId: { in: ids } }, { entryBId: { in: ids } }] })
      }
      if (query.q?.trim()) {
        const searchTerm = query.q.trim()
        // Search in both sense definitions and examples
        const [sensesFromDef, sensesFromExample] = await Promise.all([
          fastify.db.sense.findMany({
            where: { rawDefinition: { contains: searchTerm } },
            select: { entryId: true },
            distinct: ['entryId'],
            take: 2000,
          }),
          fastify.db.sense.findMany({
            where: {
              examples: {
                some: { rawText: { contains: searchTerm } }
              }
            },
            select: { entryId: true },
            distinct: ['entryId'],
            take: 2000,
          })
        ])
        const entryIdSet = new Set<string>()
        sensesFromDef.forEach(s => entryIdSet.add(s.entryId))
        sensesFromExample.forEach(s => entryIdSet.add(s.entryId))
        const entryIds = Array.from(entryIdSet)
        if (entryIds.length === 0) {
          return { items: [], total: 0, page: pageNum, pageSize: size, totalPages: 0 }
        }
        extra.push({ OR: [{ entryAId: { in: entryIds } }, { entryBId: { in: entryIds } }] })
      }
      if (query.taxonomySourceId && query.taxonomyNodeId) {
        const taxSource = await fastify.db.taxonomySource.findUnique({ 
          where: { id: query.taxonomySourceId }, 
          select: { status: true } 
        })
        if (!taxSource) throw badRequest(`Taxonomy source '${query.taxonomySourceId}' not found`)
        if (taxSource.status !== 'ACTIVE') {
          throw badRequest(`Taxonomy source is not ready (status: ${taxSource.status}). Wait for import to complete.`)
        }
        const { getSubtreeNodeIds, getSubtreeHeadwords } = await import('../services/taxonomy/tree.js')
        // Support multiple node IDs (comma-separated) - union of all selected nodes
        const nodeIdList = query.taxonomyNodeId.split(',').map(s => s.trim()).filter(Boolean)
        const allNodeIds = new Set<string>()
        for (const nid of nodeIdList) {
          const subtreeIds = await getSubtreeNodeIds(nid, fastify.db)
          subtreeIds.forEach(id => allNodeIds.add(id))
        }
        const headwords = await getSubtreeHeadwords(Array.from(allNodeIds), query.taxonomySourceId, fastify.db)
        if (headwords.length === 0) {
          return { items: [], total: 0, page: pageNum, pageSize: size, totalPages: 0 }
        }
        const entryIds = (await fastify.db.entry.findMany({
          where: { normalizedHeadword: { in: headwords } },
          select: { id: true },
        })).map((e) => e.id)
        if (entryIds.length === 0) {
          return { items: [], total: 0, page: pageNum, pageSize: size, totalPages: 0 }
        }
        extra.push({ OR: [{ entryAId: { in: entryIds } }, { entryBId: { in: entryIds } }] })
      }
      if (extra.length > 0) where.AND = extra

      if (selectedTagIds.length > 0) {
        const tagFilter = {
          OR: [
            {
              entryA: {
                tagAssignments: {
                  some: {
                    tagId: { in: selectedTagIds },
                    tag: { userId: user.id },
                  },
                },
              },
            },
            {
              entryB: {
                tagAssignments: {
                  some: {
                    tagId: { in: selectedTagIds },
                    tag: { userId: user.id },
                  },
                },
              },
            },
          ],
        }
        where.AND = [...(((where.AND as object[] | undefined) ?? [])), tagFilter]
      }

      // Filter by sense change types: entry must have at least one senseDiff with matching changeType
      if (query.senseChangeType) {
        const types = query.senseChangeType.split(',').map((s) => s.trim()).filter(Boolean)
        if (types.length > 0) {
          where.senseDiffs = {
            some: {
              changeType: types.length === 1 ? types[0] : { in: types }
            }
          }
        }
      }

      const senseInclude = true
      const entryInclude = {
        include: {
          senses: {
            orderBy: { position: 'asc' as const },
            include: { examples: { orderBy: { position: 'asc' as const } } },
          },
        },
      }

      const [total, alignments] = await Promise.all([
        fastify.db.entryAlignment.count({ where }),
        fastify.db.entryAlignment.findMany({
          where,
          skip,
          take: size,
          orderBy: [
            { entryA: { pageNumber: 'asc' } },
            { entryA: { lineNumber: 'asc' } },
            { entryA: { entrySequence: 'asc' } },
            { entryB: { pageNumber: 'asc' } },
            { entryB: { lineNumber: 'asc' } },
            { entryB: { entrySequence: 'asc' } },
            { createdAt: 'asc' },
            { id: 'asc' },
          ],
          include: {
            entryA: entryInclude,
            entryB: entryInclude,
            senseDiffs: senseInclude,
          },
        }),
      ])

      const entryIdsOnPage = Array.from(
        new Set(
          alignments.flatMap((alignment) => [alignment.entryAId, alignment.entryBId].filter((value): value is string => Boolean(value)))
        )
      )
      const tagAssignments = entryIdsOnPage.length
        ? await fastify.db.entryTagAssignment.findMany({
            where: {
              entryId: { in: entryIdsOnPage },
              tag: { userId: user.id },
            },
            select: {
              entryId: true,
              tag: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
            orderBy: {
              tag: {
                name: 'asc',
              },
            },
          })
        : []

      const tagsByEntryId = new Map<string, TagResponse[]>()
      for (const assignment of tagAssignments) {
        const current = tagsByEntryId.get(assignment.entryId) ?? []
        current.push({ id: assignment.tag.id, name: assignment.tag.name })
        tagsByEntryId.set(assignment.entryId, current)
      }

      // Update lastAccessedAt on the comparison's dictionaries (best-effort, non-blocking)
      const comparison = await fastify.db.comparison.findUnique({
        where: { id },
        select: {
          versionA: { select: { dictionaryId: true } },
          versionB: { select: { dictionaryId: true } },
        },
      })
      if (comparison) {
        const dictIds = [comparison.versionA.dictionaryId, comparison.versionB.dictionaryId]
        Promise.all(
          dictIds.map((dictId) =>
            fastify.db.dictionary.update({ where: { id: dictId }, data: { lastAccessedAt: new Date() } })
          )
        ).catch(() => {/* best-effort */})
      }

      // Batch-lookup word unlock states for all headwords on this page
      const headwordsOnPage = alignments
        .flatMap((a) => [
          (a.entryA as { normalizedHeadword?: string } | null)?.normalizedHeadword,
          (a.entryB as { normalizedHeadword?: string } | null)?.normalizedHeadword,
        ])
        .filter((h): h is string => !!h)

      const unlockedSet = new Set<string>()
      if (headwordsOnPage.length > 0) {
        const unlocks = await fastify.db.wordUnlock.findMany({
          where: {
            userId: user.id,
            normalizedHeadword: { in: [...new Set(headwordsOnPage)] },
          },
          select: { normalizedHeadword: true },
        })
        unlocks.forEach((u) => unlockedSet.add(u.normalizedHeadword))
      }

      const ENTRY_PUBLIC_FIELDS = ['id', 'rawHeadword', 'normalizedHeadword', 'phonetic']

      const itemsWithLock = alignments.map((a) => {
        const seenTags = new Set<string>()
        const tags = [a.entryAId, a.entryBId]
          .flatMap((entryId) => (entryId ? tagsByEntryId.get(entryId) ?? [] : []))
          .filter((tag) => {
            if (seenTags.has(tag.id)) return false
            seenTags.add(tag.id)
            return true
          })
        const headword =
          (a.entryA as { normalizedHeadword?: string } | null)?.normalizedHeadword ??
          (a.entryB as { normalizedHeadword?: string } | null)?.normalizedHeadword
        const locked = headword ? !unlockedSet.has(headword) : false

        if (!locked) {
          const withCrossRefs = (entry: Record<string, unknown> | null, entryId?: string | null) => {
            if (!entry) return null
            const meta = entry['metadata'] as { crossReferences?: string[] } | null
            return {
              ...entry,
              crossReferences: meta?.crossReferences ?? null,
              tags: entryId ? tagsByEntryId.get(entryId) ?? [] : [],
            }
          }
          return {
            ...a,
            tags,
            locked: false,
            entryA: withCrossRefs(a.entryA as Record<string, unknown> | null, a.entryAId),
            entryB: withCrossRefs(a.entryB as Record<string, unknown> | null, a.entryBId),
          }
        }

        // Strip sense data for locked entries — only expose headword + phonetic
        const stripEntry = (entry: Record<string, unknown> | null, entryId?: string | null) => {
          if (!entry) return null
          return {
            ...Object.fromEntries(ENTRY_PUBLIC_FIELDS.map((k) => [k, entry[k]])),
            tags: entryId ? tagsByEntryId.get(entryId) ?? [] : [],
          }
        }

        return {
          ...a,
          tags,
          locked: true,
          entryA: stripEntry(a.entryA as Record<string, unknown> | null, a.entryAId),
          entryB: stripEntry(a.entryB as Record<string, unknown> | null, a.entryBId),
          senseDiffs: [],
        }
      })

      return { 
        items: itemsWithLock, 
        total, 
        page: pageNum, 
        pageSize: size, 
        totalPages: Math.ceil(total / size) 
      }
    } catch (error) { throw error }
  })
}

export default comparisonRoutes
