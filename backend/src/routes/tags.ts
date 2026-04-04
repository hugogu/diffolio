import { Prisma, PrismaClient } from '@prisma/client'
import { FastifyPluginAsync } from 'fastify'
import { authGuard, requireSessionUser } from '../lib/auth-guard.js'
import { assertComparisonOwner, assertEntryOwner } from '../lib/ownership.js'
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js'

type DbClient = PrismaClient | Prisma.TransactionClient

type TagResponse = {
  id: string
  name: string
}

type TagMutationBody = {
  tagId?: string
  name?: string
}

function normalizeTagName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}

function validateTagName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, ' ')
  if (!trimmed) throw badRequest('Tag name is required')
  if (trimmed.length > 30) throw badRequest('Tag name must be 30 characters or fewer')
  return trimmed
}

async function getTagOwnedByUser(db: DbClient, tagId: string, userId: string) {
  const tag = await db.entryTag.findUnique({
    where: { id: tagId },
    include: { _count: { select: { assignments: true } } },
  })
  if (!tag) throw notFound('EntryTag', tagId)
  if (tag.userId !== userId) throw forbidden()
  return tag
}

async function resolveTag(db: DbClient, userId: string, body: TagMutationBody): Promise<TagResponse> {
  if (body.tagId && body.name) {
    throw badRequest('Provide either tagId or name, not both')
  }

  if (body.tagId) {
    const existing = await getTagOwnedByUser(db, body.tagId, userId)
    return { id: existing.id, name: existing.name }
  }

  if (!body.name) throw badRequest('Either tagId or name is required')

  const name = validateTagName(body.name)
  const normalizedName = normalizeTagName(name)

  const existing = await db.entryTag.findUnique({
    where: {
      userId_normalizedName: {
        userId,
        normalizedName,
      },
    },
  })

  if (existing) return { id: existing.id, name: existing.name }

  const created = await db.entryTag.create({
    data: {
      userId,
      name,
      normalizedName,
    },
  })

  return { id: created.id, name: created.name }
}

async function listEntryTags(db: DbClient, entryId: string, userId: string): Promise<TagResponse[]> {
  const tags = await db.entryTagAssignment.findMany({
    where: {
      entryId,
      tag: { userId },
    },
    select: {
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

  return tags.map(({ tag }) => tag)
}

async function listAlignmentTags(db: DbClient, entryIds: string[], userId: string): Promise<TagResponse[]> {
  if (entryIds.length === 0) return []

  const tags = await db.entryTagAssignment.findMany({
    where: {
      entryId: { in: entryIds },
      tag: { userId },
    },
    select: {
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

  const seen = new Set<string>()
  return tags
    .map(({ tag }) => tag)
    .filter((tag) => {
      if (seen.has(tag.id)) return false
      seen.add(tag.id)
      return true
    })
}

async function cleanupUnusedTag(db: DbClient, tagId: string) {
  const count = await db.entryTagAssignment.count({ where: { tagId } })
  if (count === 0) {
    await db.entryTag.delete({ where: { id: tagId } }).catch(() => undefined)
  }
}

async function getAlignmentEntryIds(db: DbClient, comparisonId: string, alignmentId: string) {
  const alignment = await db.entryAlignment.findUnique({
    where: { id: alignmentId },
    select: {
      comparisonId: true,
      entryAId: true,
      entryBId: true,
    },
  })

  if (!alignment) throw notFound('EntryAlignment', alignmentId)
  if (alignment.comparisonId !== comparisonId) {
    throw conflict('Alignment does not belong to comparison')
  }

  return Array.from(
    new Set([alignment.entryAId, alignment.entryBId].filter((value): value is string => Boolean(value)))
  )
}

const tagRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/tags', { preHandler: authGuard() }, async (request) => {
    const user = requireSessionUser(request)
    const { q, limit = '100' } = request.query as { q?: string; limit?: string }
    const take = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 200)

    const tags = await fastify.db.entryTag.findMany({
      where: {
        userId: user.id,
        assignments: { some: {} },
        ...(q?.trim()
          ? {
              name: {
                contains: q.trim(),
                mode: 'insensitive',
              },
            }
          : {}),
      },
      select: {
        id: true,
        name: true,
        normalizedName: true,
        _count: { select: { assignments: true } },
      },
      orderBy: [{ name: 'asc' }],
      take,
    })

    return {
      items: tags.map((tag) => ({
        id: tag.id,
        name: tag.name,
        normalizedName: tag.normalizedName,
        usageCount: tag._count.assignments,
      })),
    }
  })

  fastify.patch('/tags/:tagId', { preHandler: authGuard() }, async (request) => {
    const user = requireSessionUser(request)
    const { tagId } = request.params as { tagId: string }
    const body = request.body as { name?: string }

    await getTagOwnedByUser(fastify.db, tagId, user.id)
    const name = validateTagName(body.name ?? '')
    const normalizedName = normalizeTagName(name)

    const conflictTag = await fastify.db.entryTag.findUnique({
      where: {
        userId_normalizedName: {
          userId: user.id,
          normalizedName,
        },
      },
    })
    if (conflictTag && conflictTag.id !== tagId) {
      throw badRequest('Tag name already exists')
    }

    const updated = await fastify.db.entryTag.update({
      where: { id: tagId },
      data: { name, normalizedName },
      select: {
        id: true,
        name: true,
        normalizedName: true,
        _count: { select: { assignments: true } },
      },
    })

    return {
      id: updated.id,
      name: updated.name,
      normalizedName: updated.normalizedName,
      usageCount: updated._count.assignments,
    }
  })

  fastify.post('/entries/:entryId/tags', { preHandler: authGuard() }, async (request) => {
    const user = requireSessionUser(request)
    const { entryId } = request.params as { entryId: string }
    const body = (request.body ?? {}) as TagMutationBody

    await assertEntryOwner(fastify.db, entryId, user.id)
    const tag = await resolveTag(fastify.db, user.id, body)

    await fastify.db.entryTagAssignment.upsert({
      where: {
        tagId_entryId: {
          tagId: tag.id,
          entryId,
        },
      },
      create: {
        tagId: tag.id,
        entryId,
      },
      update: {},
    })

    return {
      entryId,
      tags: await listEntryTags(fastify.db, entryId, user.id),
    }
  })

  fastify.delete('/entries/:entryId/tags/:tagId', { preHandler: authGuard() }, async (request) => {
    const user = requireSessionUser(request)
    const { entryId, tagId } = request.params as { entryId: string; tagId: string }

    await assertEntryOwner(fastify.db, entryId, user.id)
    await getTagOwnedByUser(fastify.db, tagId, user.id)

    const deleted = await fastify.db.entryTagAssignment.deleteMany({
      where: {
        entryId,
        tagId,
      },
    })
    if (deleted.count === 0) throw notFound('EntryTagAssignment')

    await cleanupUnusedTag(fastify.db, tagId)

    return {
      entryId,
      tags: await listEntryTags(fastify.db, entryId, user.id),
    }
  })

  fastify.post('/comparisons/:comparisonId/alignments/:alignmentId/tags', { preHandler: authGuard() }, async (request) => {
    const user = requireSessionUser(request)
    const { comparisonId, alignmentId } = request.params as { comparisonId: string; alignmentId: string }
    const body = (request.body ?? {}) as TagMutationBody

    await assertComparisonOwner(fastify.db, comparisonId, user.id)
    const entryIds = await getAlignmentEntryIds(fastify.db, comparisonId, alignmentId)
    const tag = await resolveTag(fastify.db, user.id, body)

    await fastify.db.$transaction(async (tx) => {
      for (const entryId of entryIds) {
        await tx.entryTagAssignment.upsert({
          where: {
            tagId_entryId: {
              tagId: tag.id,
              entryId,
            },
          },
          create: {
            tagId: tag.id,
            entryId,
          },
          update: {},
        })
      }
    })

    return {
      alignmentId,
      appliedEntryIds: entryIds,
      tags: await listAlignmentTags(fastify.db, entryIds, user.id),
    }
  })

  fastify.delete('/comparisons/:comparisonId/alignments/:alignmentId/tags/:tagId', { preHandler: authGuard() }, async (request) => {
    const user = requireSessionUser(request)
    const { comparisonId, alignmentId, tagId } = request.params as {
      comparisonId: string
      alignmentId: string
      tagId: string
    }

    await assertComparisonOwner(fastify.db, comparisonId, user.id)
    await getTagOwnedByUser(fastify.db, tagId, user.id)
    const entryIds = await getAlignmentEntryIds(fastify.db, comparisonId, alignmentId)

    const deleted = await fastify.db.$transaction(async (tx) => {
      const result = await tx.entryTagAssignment.deleteMany({
        where: {
          tagId,
          entryId: { in: entryIds },
        },
      })
      if (result.count === 0) throw notFound('EntryTagAssignment')
      await cleanupUnusedTag(tx, tagId)
      return result
    })

    if (deleted.count === 0) throw notFound('EntryTagAssignment')

    return {
      alignmentId,
      appliedEntryIds: entryIds,
      tags: await listAlignmentTags(fastify.db, entryIds, user.id),
    }
  })
}

export default tagRoutes
