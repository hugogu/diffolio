import { FastifyPluginAsync } from 'fastify'
import path from 'node:path'
import fs from 'node:fs'
import { authGuard, requireSessionUser } from '../lib/auth-guard.js'
import { assertTaxonomySourceOwner } from '../lib/ownership.js'
import { notFound, badRequest, conflict } from '../lib/errors.js'
import { validateTaxonomyConfig, compileTaxonomyConfig, type TaxonomyFormatConfig } from '../services/taxonomy/config.js'
import { normalizeHeadword } from '../services/taxonomy/config.js'

const STORAGE_PATH = process.env.FILE_STORAGE_LOCAL_PATH ?? '/data/uploads'

// ─── Helper: build nested tree from flat nodes ─────────────────────────────
interface TreeNode {
  id: string
  level: number
  label: string
  sequencePosition: number
  path: string
  parentId: string | null
  entryCount?: number
  children: TreeNode[]
}

function buildTree(nodes: Array<{
  id: string; level: number; label: string; sequencePosition: number;
  path: string; parentId: string | null;
  _count?: { entries: number }
}>): TreeNode[] {
  const byId = new Map<string, TreeNode>()
  const roots: TreeNode[] = []

  // Sort by path to ensure parents are processed before children
  const sorted = [...nodes].sort((a, b) => a.path.localeCompare(b.path))

  for (const n of sorted) {
    const node: TreeNode = {
      id: n.id,
      level: n.level,
      label: n.label,
      sequencePosition: n.sequencePosition,
      path: n.path,
      parentId: n.parentId,
      entryCount: n._count?.entries,
      children: [],
    }
    byId.set(n.id, node)
    if (!n.parentId) {
      roots.push(node)
    } else {
      const parent = byId.get(n.parentId)
      if (parent) {
        parent.children.push(node)
      } else {
        roots.push(node) // orphan fallback
      }
    }
  }

  // Sort children by sequencePosition
  function sortChildren(node: TreeNode) {
    node.children.sort((a, b) => a.sequencePosition - b.sequencePosition)
    for (const child of node.children) sortChildren(child)
  }
  roots.sort((a, b) => a.sequencePosition - b.sequencePosition)
  for (const root of roots) sortChildren(root)

  return roots
}

const taxonomyRoutes: FastifyPluginAsync = async (fastify) => {

  // GET /api/v1/taxonomy-sources — scoped to session user
  fastify.get('/taxonomy-sources', { preHandler: authGuard() }, async (request) => {
    const user = requireSessionUser(request)
    const sources = await fastify.db.taxonomySource.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, name: true, description: true, status: true,
        totalEntries: true, createdAt: true, updatedAt: true,
      },
    })
    return { data: sources }
  })

  // POST /api/v1/taxonomy-sources (multipart)
  fastify.post('/taxonomy-sources', { preHandler: authGuard() }, async (request, reply) => {
    const parts = request.parts()
    let fileBuffer: Buffer | null = null
    let originalFileName = ''
    let configRaw: unknown = null
    let name = ''
    let description = ''

    for await (const part of parts) {
      if (part.type === 'file' && part.fieldname === 'file') {
        originalFileName = part.filename
        fileBuffer = await part.toBuffer()
        const MAX_FILE_SIZE = 200 * 1024 * 1024 // 200 MB
        if (fileBuffer.length > MAX_FILE_SIZE) {
          throw badRequest(`File too large (${Math.round(fileBuffer.length / 1024 / 1024)} MB). Maximum allowed is 200 MB.`)
        }
      } else if (part.type === 'field') {
        if (part.fieldname === 'config') {
          try {
            configRaw = JSON.parse(part.value as string)
          } catch {
            throw badRequest('Config must be valid JSON')
          }
        } else if (part.fieldname === 'name') name = part.value as string
        else if (part.fieldname === 'description') description = part.value as string
      }
    }

    if (!fileBuffer) throw badRequest('File is required')
    if (!configRaw) throw badRequest('Config JSON is required')
    if (!name) throw badRequest('Name is required')

    const validation = validateTaxonomyConfig(configRaw)
    if (!validation.isValid) {
      throw badRequest('Invalid taxonomy config', validation.errors)
    }

    // Save file
    fs.mkdirSync(STORAGE_PATH, { recursive: true })
    const filename = `taxonomy_${Date.now()}_${originalFileName}`
    const filePath = path.join(STORAGE_PATH, filename)
    fs.writeFileSync(filePath, fileBuffer)

    const user = requireSessionUser(request)
    const source = await fastify.db.taxonomySource.create({
      data: {
        name,
        description: description || null,
        sourceFilePath: filePath,
        configJson: configRaw as object,
        status: 'PENDING',
        userId: user.id,
      },
    })

    const task = await fastify.db.taxonomyImportTask.create({
      data: { taxonomySourceId: source.id, status: 'PENDING' },
    })

    await fastify.taxonomyQueue.add('taxonomy', {
      taxonomySourceId: source.id,
      taskId: task.id,
      filePath,
    })

    reply.status(202).send({ ...source, latestImportTask: task })
  })

  // GET /api/v1/taxonomy-sources/:id
  fastify.get('/taxonomy-sources/:id', { preHandler: authGuard() }, async (request) => {
    const user = requireSessionUser(request)
    const { id } = request.params as { id: string }
    await assertTaxonomySourceOwner(fastify.db, id, user.id)
    const source = await fastify.db.taxonomySource.findUnique({
      where: { id },
      include: {
        importTasks: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    })
    if (!source) throw notFound('TaxonomySource', id)
    const { importTasks, ...rest } = source
    return { ...rest, latestImportTask: importTasks[0] ?? null }
  })

  // DELETE /api/v1/taxonomy-sources/:id
  fastify.delete('/taxonomy-sources/:id', { preHandler: authGuard() }, async (request, reply) => {
    const user = requireSessionUser(request)
    const { id } = request.params as { id: string }
    await assertTaxonomySourceOwner(fastify.db, id, user.id)
    const source = await fastify.db.taxonomySource.findUnique({ where: { id } })
    if (!source) throw notFound('TaxonomySource', id)
    await fastify.db.taxonomySource.delete({ where: { id } })
    reply.status(204).send()
  })

  // POST /api/v1/taxonomy-sources/:id/reimport
  fastify.post('/taxonomy-sources/:id/reimport', { preHandler: authGuard() }, async (request, reply) => {
    const user = requireSessionUser(request)
    const { id } = request.params as { id: string }
    await assertTaxonomySourceOwner(fastify.db, id, user.id)
    const source = await fastify.db.taxonomySource.findUnique({ where: { id } })
    if (!source) throw notFound('TaxonomySource', id)
    if (source.status === 'IMPORTING') throw conflict('Import already in progress')
    if (!source.sourceFilePath) throw badRequest('No source file available for re-import')

    // Delete existing tree data
    await fastify.db.taxonomyEntry.deleteMany({ where: { taxonomySourceId: id } })
    await fastify.db.taxonomyNode.deleteMany({ where: { taxonomySourceId: id } })

    await fastify.db.taxonomySource.update({
      where: { id },
      data: { status: 'PENDING', totalEntries: null },
    })

    const task = await fastify.db.taxonomyImportTask.create({
      data: { taxonomySourceId: id, status: 'PENDING' },
    })

    await fastify.taxonomyQueue.add('taxonomy', {
      taxonomySourceId: id,
      taskId: task.id,
      filePath: source.sourceFilePath,
    })

    reply.status(202).send(task)
  })

  // GET /api/v1/taxonomy-sources/:id/tree
  fastify.get('/taxonomy-sources/:id/tree', { preHandler: authGuard() }, async (request) => {
    const user = requireSessionUser(request)
    const { id } = request.params as { id: string }
    await assertTaxonomySourceOwner(fastify.db, id, user.id)
    const source = await fastify.db.taxonomySource.findUnique({ where: { id } })
    if (!source) throw notFound('TaxonomySource', id)

    const nodes = await fastify.db.taxonomyNode.findMany({
      where: { taxonomySourceId: id },
      orderBy: { path: 'asc' },
      include: {
        _count: { select: { entries: true } },
      },
    })

    const flatNodes = nodes.map((n) => ({
      id: n.id,
      level: n.level,
      label: n.label,
      sequencePosition: n.sequencePosition,
      path: n.path,
      parentId: n.parentId,
      _count: n._count,
    }))

    return { nodes: buildTree(flatNodes) }
  })

  // PATCH /api/v1/taxonomy-sources/:sourceId/nodes/:nodeId
  fastify.patch('/taxonomy-sources/:sourceId/nodes/:nodeId', { preHandler: authGuard() }, async (request) => {
    const user = requireSessionUser(request)
    const { sourceId, nodeId } = request.params as { sourceId: string; nodeId: string }
    await assertTaxonomySourceOwner(fastify.db, sourceId, user.id)
    const { label } = request.body as { label?: string }
    if (!label?.trim()) throw badRequest('label is required')

    const node = await fastify.db.taxonomyNode.findUnique({ where: { id: nodeId } })
    if (!node || node.taxonomySourceId !== sourceId) throw notFound('TaxonomyNode', nodeId)
    if (node.level === 4) throw badRequest('Level-4 leaf nodes cannot be renamed via this endpoint')

    const updated = await fastify.db.taxonomyNode.update({
      where: { id: nodeId },
      data: { label: label.trim() },
    })
    return updated
  })

  // GET /api/v1/taxonomy-sources/:sourceId/nodes/:nodeId/entries
  fastify.get('/taxonomy-sources/:sourceId/nodes/:nodeId/entries', { preHandler: authGuard() }, async (request) => {
    const user = requireSessionUser(request)
    const { sourceId, nodeId } = request.params as { sourceId: string; nodeId: string }
    await assertTaxonomySourceOwner(fastify.db, sourceId, user.id)
    const { cursor, limit = '100' } = request.query as { cursor?: string; limit?: string }

    const node = await fastify.db.taxonomyNode.findUnique({ where: { id: nodeId } })
    if (!node || node.taxonomySourceId !== sourceId) throw notFound('TaxonomyNode', nodeId)

    const take = Math.min(500, Math.max(1, parseInt(limit, 10)))
    const entries = await fastify.db.taxonomyEntry.findMany({
      where: { nodeId },
      orderBy: { sequencePosition: 'asc' },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    })

    const hasMore = entries.length > take
    const data = hasMore ? entries.slice(0, take) : entries
    return {
      data: data.map((e) => ({ id: e.id, headword: e.headword, normalizedHeadword: e.normalizedHeadword, sequencePosition: e.sequencePosition })),
      nextCursor: hasMore ? data[data.length - 1].id : null,
    }
  })

  // PUT /api/v1/taxonomy-sources/:sourceId/nodes/:nodeId/entries
  fastify.put('/taxonomy-sources/:sourceId/nodes/:nodeId/entries', { preHandler: authGuard() }, async (request) => {
    const user = requireSessionUser(request)
    const { sourceId, nodeId } = request.params as { sourceId: string; nodeId: string }
    await assertTaxonomySourceOwner(fastify.db, sourceId, user.id)
    const { headwords } = request.body as { headwords?: string[] }
    if (!Array.isArray(headwords)) throw badRequest('headwords must be an array')

    const node = await fastify.db.taxonomyNode.findUnique({ where: { id: nodeId } })
    if (!node || node.taxonomySourceId !== sourceId) throw notFound('TaxonomyNode', nodeId)
    if (node.level !== 4) throw badRequest('Only Level-4 leaf nodes can have their entries replaced')

    const source = await fastify.db.taxonomySource.findUnique({ where: { id: sourceId } })
    const config = compileTaxonomyConfig(source!.configJson as unknown as TaxonomyFormatConfig)

    // Full replacement
    await fastify.db.taxonomyEntry.deleteMany({ where: { nodeId } })

    const seen = new Set<string>()
    const data: Array<{ nodeId: string; taxonomySourceId: string; headword: string; normalizedHeadword: string; sequencePosition: number }> = []
    for (let i = 0; i < headwords.length; i++) {
      const hw = headwords[i].trim()
      if (!hw) continue
      const normalized = normalizeHeadword(hw, config.tradSimpMap)
      if (!seen.has(normalized)) {
        seen.add(normalized)
        data.push({ nodeId, taxonomySourceId: sourceId, headword: hw, normalizedHeadword: normalized, sequencePosition: i })
      }
    }

    if (data.length > 0) {
      await fastify.db.taxonomyEntry.createMany({ data })
    }

    return { count: data.length }
  })
}

export default taxonomyRoutes
