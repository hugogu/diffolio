import { FastifyPluginAsync } from 'fastify'
import fs from 'node:fs'
import path from 'node:path'
import { authGuard, requireSessionUser, checkExportEnabled } from '../lib/auth-guard.js'
import { assertComparisonOwner } from '../lib/ownership.js'
import { notFound, badRequest, forbidden } from '../lib/errors.js'
import { ensureVersionEntriesMaterializedFromArtifact } from '../services/parse-artifacts/persistence.js'

const exportRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/v1/comparisons/:comparisonId/exports
  fastify.post(
    '/comparisons/:comparisonId/exports',
    { preHandler: [authGuard(), checkExportEnabled()] },
    async (request, reply) => {
      const user = requireSessionUser(request)
      const { comparisonId } = request.params as { comparisonId: string }

      await assertComparisonOwner(fastify.db, comparisonId, user.id)
      const comparison = await fastify.db.comparison.findUnique({ where: { id: comparisonId } })
      if (!comparison) throw notFound('Comparison', comparisonId)
      await Promise.all([
        ensureVersionEntriesMaterializedFromArtifact(fastify.db, comparison.versionAId),
        ensureVersionEntriesMaterializedFromArtifact(fastify.db, comparison.versionBId),
      ])

      const body = (request.body ?? {}) as { senseChangeTypes?: string[]; orderBy?: string; taxonomySourceId?: string }
      const senseChangeTypes = Array.isArray(body.senseChangeTypes) && body.senseChangeTypes.length > 0
        ? body.senseChangeTypes
        : undefined
      const orderBy = body.orderBy === 'taxonomy' ? 'taxonomy' : 'alphabetical'
      const taxonomySourceId = body.taxonomySourceId ?? null

      if (orderBy === 'taxonomy' && !taxonomySourceId) {
        throw badRequest('taxonomySourceId is required when orderBy=taxonomy')
      }

      const exportJob = await fastify.db.exportJob.create({
        data: { comparisonId, format: 'EXCEL', status: 'PENDING', orderBy, taxonomySourceId },
      })

      const job = await fastify.exportQueue.add('export', {
        exportJobId: exportJob.id,
        comparisonId,
        senseChangeTypes,
        orderBy,
        taxonomySourceId: taxonomySourceId ?? undefined,
        userId: user.id,
        userEmail: user.email,
      })

      await fastify.db.exportJob.update({
        where: { id: exportJob.id },
        data: { bullmqJobId: job.id },
      })

      reply.status(202).send(exportJob)
    }
  )

  // GET /api/v1/comparisons/:comparisonId/exports/latest
  fastify.get('/comparisons/:comparisonId/exports/latest', { preHandler: [authGuard(), checkExportEnabled()] }, async (request) => {
    const user = requireSessionUser(request)
    const { comparisonId } = request.params as { comparisonId: string }
    await assertComparisonOwner(fastify.db, comparisonId, user.id)
    const exportJob = await fastify.db.exportJob.findFirst({
      where: { comparisonId, status: 'COMPLETED', downloadPath: { not: null } },
      orderBy: { completedAt: 'desc' },
    })
    if (!exportJob || !exportJob.downloadPath || !fs.existsSync(exportJob.downloadPath)) {
      return null
    }
    return exportJob
  })

  // GET /api/v1/exports/:exportId
  fastify.get('/exports/:exportId', { preHandler: authGuard() }, async (request) => {
    const { exportId } = request.params as { exportId: string }
    const exportJob = await fastify.db.exportJob.findUnique({ where: { id: exportId } })
    if (!exportJob) throw notFound('ExportJob', exportId)
    return exportJob
  })

  // GET /api/v1/exports/:exportId/download
  fastify.get('/exports/:exportId/download', { preHandler: [authGuard(), checkExportEnabled()] }, async (request, reply) => {
    const { exportId } = request.params as { exportId: string }
    const { format } = request.query as { format?: string }
    
    const exportJob = await fastify.db.exportJob.findUnique({ where: { id: exportId } })
    if (!exportJob) throw notFound('ExportJob', exportId)
    if (exportJob.status !== 'COMPLETED' || !exportJob.downloadPath) {
      throw badRequest('Export is not ready for download')
    }
    if (exportJob.expiresAt && new Date() > exportJob.expiresAt) {
      throw badRequest('Export link has expired')
    }
    
    // Check for CSV format — ADMIN only
    if (format === 'csv') {
      const user = requireSessionUser(request)
      if (user.role !== 'ADMIN') throw forbidden('CSV download is restricted to administrators.')
      const csvPath = exportJob.downloadPath.replace('.xlsx', '.csv')
      if (!fs.existsSync(csvPath)) {
        throw badRequest('CSV file not found')
      }
      const filename = path.basename(csvPath)
      reply.header('Content-Disposition', `attachment; filename="${filename}"`)
      reply.header('Content-Type', 'text/csv; charset=utf-8')
      return reply.send(fs.createReadStream(csvPath))
    }
    
    // Excel format (default)
    if (!fs.existsSync(exportJob.downloadPath)) {
      throw badRequest('Export file not found on disk')
    }

    const filename = path.basename(exportJob.downloadPath)
    reply.header('Content-Disposition', `attachment; filename="${filename}"`)
    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    return reply.send(fs.createReadStream(exportJob.downloadPath))
  })
}

export default exportRoutes
