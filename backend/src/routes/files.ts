import { FastifyPluginAsync } from 'fastify'
import path from 'node:path'
import { authGuard, requireSessionUser } from '../lib/auth-guard.js'
import { assertVersionOwner } from '../lib/ownership.js'
import { notFound, badRequest, paymentRequired, extractRootCause } from '../lib/errors.js'
import { saveFile, getFileStream, fileExists, deleteFile } from '../lib/storage.js'
import { chargeVersionParseEnergy, invalidateVersionParseCharge, InsufficientEnergyError } from '../services/subscription/energy.js'

function detectFileType(filename: string, _firstBytes?: Buffer): 'TXT' | 'DOC' | 'DOCX' | 'PDF' {
  const ext = path.extname(filename).toLowerCase()
  if (ext === '.txt') return 'TXT'
  if (ext === '.doc') return 'DOC'
  if (ext === '.docx') return 'DOCX'
  if (ext === '.pdf') return 'PDF'
  throw badRequest(`Unsupported file type: ${ext}. Supported: .txt, .doc, .docx, .pdf`)
}

const fileRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/v1/versions/:versionId/upload
  fastify.post(
    '/versions/:versionId/upload',
    { preHandler: authGuard() },
    async (request, reply) => {
      try {
        const user = requireSessionUser(request)
        const { versionId } = request.params as { versionId: string }
        await assertVersionOwner(fastify.db, versionId, user.id)

        const version = await fastify.db.dictionaryVersion.findUnique({
          where: { id: versionId },
          include: { formatConfig: true },
        })
        if (!version) throw notFound('DictionaryVersion', versionId)

        // Detect re-upload: check if there's already any parse task for this version
        const existingTasks = await fastify.db.parseTask.findMany({
          where: { versionId },
        })
        const isReupload = existingTasks.length > 0

        const data = await request.file()
        if (!data) throw badRequest('No file provided')

        const fileType = detectFileType(data.filename)

        // PDF handling: block free-tier users
        if (fileType === 'PDF') {
          const sub = await fastify.db.userSubscription.findUnique({ where: { userId: user.id } })
          if (!sub || sub.status !== 'ACTIVE') {
            data.file.resume()
            throw badRequest(
              '免费体验仅支持文本格式（.txt / .docx / .mdx），订阅后可上传扫描版词典',
              { code: 'FREE_TIER_PDF_BLOCKED' }
            )
          }
        }

        // On re-upload: cancel in-flight jobs, delete old physical files, clear parsed data.
        if (isReupload) {
          // Cancel any pending/active parse jobs to avoid FK races or concurrent writes.
          const inflightJobs = await fastify.parseQueue.getJobs(['waiting', 'active', 'delayed', 'prioritized'])
          for (const inflightJob of inflightJobs) {
            if (inflightJob.data.versionId === versionId) {
              await inflightJob.remove().catch(() => { /* already gone */ })
            }
          }
          await fastify.db.parseTask.updateMany({
            where: { versionId, status: { in: ['RUNNING', 'PENDING'] } },
            data: { status: 'FAILED' },
          })

          // Delete old physical files to avoid disk accumulation.
          for (const task of existingTasks) {
            deleteFile(task.storedFilePath)
          }

          // Clear parsed entries (they'll be replaced by new parse).
          const db = fastify.db
          const v = versionId
          await db.$executeRaw`
            DELETE FROM sense_diffs sd
            USING entry_alignments ea, comparisons c
            WHERE sd."alignment_id" = ea.id
              AND ea."comparison_id" = c.id
              AND (c."version_a_id" = ${v} OR c."version_b_id" = ${v})`
          await db.$executeRaw`
            DELETE FROM entry_alignments ea
            USING comparisons c
            WHERE ea."comparison_id" = c.id
              AND (c."version_a_id" = ${v} OR c."version_b_id" = ${v})`
          await db.$executeRaw`
            DELETE FROM export_jobs ej
            USING comparisons c
            WHERE ej."comparison_id" = c.id
              AND (c."version_a_id" = ${v} OR c."version_b_id" = ${v})`
          await db.$executeRaw`
            DELETE FROM comparisons WHERE "version_a_id" = ${v} OR "version_b_id" = ${v}`
          await db.$executeRaw`
            DELETE FROM examples ex
            USING senses s, entries e
            WHERE ex."sense_id" = s.id AND s."entry_id" = e.id AND e."version_id" = ${v}`
          await db.$executeRaw`
            DELETE FROM senses s
            USING entries e
            WHERE s."entry_id" = e.id AND e."version_id" = ${v}`
          await db.$executeRaw`DELETE FROM entries WHERE "version_id" = ${v}`

          // Delete ParseError records first (FK constraint), then ParseTask records.
          await db.parseError.deleteMany({ where: { task: { versionId } } })
          await db.parseTask.deleteMany({ where: { versionId } })

          // Invalidate old energy charge so we can charge again for the new file.
          await invalidateVersionParseCharge(
            fastify.db as unknown as import('@prisma/client').PrismaClient,
            user.id,
            versionId
          )
        }
        try {
          await chargeVersionParseEnergy(
            fastify.db as unknown as import('@prisma/client').PrismaClient,
            user.id,
            versionId,
            fileType
          )
        } catch (err) {
          data.file.resume()
          if (err instanceof InsufficientEnergyError) {
            const suffix = fileType === 'PDF' ? '（含扫描版加收费用）' : ''
            throw paymentRequired('INSUFFICIENT_ENERGY', `电量不足${suffix}，请购买快充包后再上传`, extractRootCause(err))
          }
          throw err
        }

        const timestamp = Date.now()
        const safeFilename = `${versionId}_${timestamp}_${path.basename(data.filename)}`

        const storedFilePath = await saveFile(data.file, safeFilename)

        const task = await fastify.db.parseTask.create({
          data: {
            versionId,
            status: 'PENDING',
            fileType,
            originalFileName: data.filename,
            storedFilePath,
          },
        })

        // Enqueue BullMQ job
        const job = await fastify.parseQueue.add(
          'parse',
          {
            taskId: task.id,
            versionId,
            filePath: storedFilePath,
            fileType,
            mode: 'full',
          },
          { jobId: task.id }
        )

        // Save bullmqJobId
        await fastify.db.parseTask.update({
          where: { id: task.id },
          data: { bullmqJobId: job.id },
        })

        reply.status(202).send({ ...task, isReupload })
      } catch (error) {
        throw error
      }
    }
  )

  // DELETE /api/v1/versions/:versionId/file — delete uploaded file(s) and reset version to uploadable state
  fastify.delete(
    '/versions/:versionId/file',
    { preHandler: authGuard() },
    async (request, reply) => {
      try {
        const user = requireSessionUser(request)
        const { versionId } = request.params as { versionId: string }
        await assertVersionOwner(fastify.db, versionId, user.id)

        const version = await fastify.db.dictionaryVersion.findUnique({ where: { id: versionId } })
        if (!version) throw notFound('DictionaryVersion', versionId)

        const tasks = await fastify.db.parseTask.findMany({ where: { versionId } })
        if (tasks.length === 0) throw notFound('UploadedFile', versionId)

        // Cancel any in-flight jobs first.
        const inflightJobs = await fastify.parseQueue.getJobs(['waiting', 'active', 'delayed', 'prioritized'])
        for (const inflightJob of inflightJobs) {
          if (inflightJob.data.versionId === versionId) {
            await inflightJob.remove().catch(() => { /* already gone */ })
          }
        }
        await fastify.db.parseTask.updateMany({
          where: { versionId, status: { in: ['RUNNING', 'PENDING'] } },
          data: { status: 'FAILED' },
        })

        // Delete physical files.
        for (const task of tasks) {
          deleteFile(task.storedFilePath)
        }

        // Clear all parsed data.
        const db = fastify.db
        const v = versionId
        await db.$executeRaw`
          DELETE FROM sense_diffs sd
          USING entry_alignments ea, comparisons c
          WHERE sd."alignment_id" = ea.id
            AND ea."comparison_id" = c.id
            AND (c."version_a_id" = ${v} OR c."version_b_id" = ${v})`
        await db.$executeRaw`
          DELETE FROM entry_alignments ea
          USING comparisons c
          WHERE ea."comparison_id" = c.id
            AND (c."version_a_id" = ${v} OR c."version_b_id" = ${v})`
        await db.$executeRaw`
          DELETE FROM export_jobs ej
          USING comparisons c
          WHERE ej."comparison_id" = c.id
            AND (c."version_a_id" = ${v} OR c."version_b_id" = ${v})`
        await db.$executeRaw`
          DELETE FROM comparisons WHERE "version_a_id" = ${v} OR "version_b_id" = ${v}`
        await db.$executeRaw`
          DELETE FROM examples ex
          USING senses s, entries e
          WHERE ex."sense_id" = s.id AND s."entry_id" = e.id AND e."version_id" = ${v}`
        await db.$executeRaw`
          DELETE FROM senses s
          USING entries e
          WHERE s."entry_id" = e.id AND e."version_id" = ${v}`
        await db.$executeRaw`DELETE FROM entries WHERE "version_id" = ${v}`

        // Delete ParseError records first (FK constraint).
        await db.parseError.deleteMany({ where: { task: { versionId } } })

        // Delete ParseTask records.
        await db.parseTask.deleteMany({ where: { versionId } })

        // Invalidate energy charge so user can upload again.
        await invalidateVersionParseCharge(
          fastify.db as unknown as import('@prisma/client').PrismaClient,
          user.id,
          versionId
        )

        reply.status(204).send()
      } catch (error) {
        throw error
      }
    }
  )

  // GET /api/v1/versions/:versionId/file — download the uploaded source file
  fastify.get(
    '/versions/:versionId/file',
    { preHandler: authGuard() },
    async (request, reply) => {
      try {
        const user = requireSessionUser(request)
        const { versionId } = request.params as { versionId: string }
        await assertVersionOwner(fastify.db, versionId, user.id)

        const task = await fastify.db.parseTask.findFirst({
          where: { versionId, status: { in: ['COMPLETED', 'RUNNING', 'PENDING', 'FAILED'] } },
          orderBy: { createdAt: 'desc' },
        })
        if (!task) throw notFound('UploadedFile', versionId)
        if (!fileExists(task.storedFilePath)) throw notFound('StoredFile', task.storedFilePath)

        const stream = getFileStream(task.storedFilePath)
        reply.header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(task.originalFileName)}`)
        reply.header('Content-Type', 'application/octet-stream')
        return reply.send(stream)
      } catch (error) {
        throw error
      }
    }
  )
}

export default fileRoutes
