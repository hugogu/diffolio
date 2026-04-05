import { FastifyPluginAsync } from 'fastify'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import type { JobType } from 'bullmq'
import { authGuard, requireSessionUser } from '../lib/auth-guard.js'
import { assertVersionOwner } from '../lib/ownership.js'
import { notFound, badRequest, paymentRequired, extractRootCause } from '../lib/errors.js'
import {
  getFileStream,
  fileExists,
  discardStagedUpload,
  promoteStagedSharedUpload,
  stageSharedUpload,
} from '../lib/storage.js'
import { chargeVersionParseEnergy, invalidateVersionParseCharge, InsufficientEnergyError } from '../services/subscription/energy.js'
import {
  bindSharedFileToVersion,
  detachActiveVersionFileReference,
  ensureSharedFileAsset,
  getActiveVersionFileContext,
} from '../services/uploads/shared-file-assets.js'
import { detachActiveParseArtifactReference } from '../services/parse-artifacts/persistence.js'

async function cancelInflightParseJobs(
  parseQueue: {
    getJobs: (
      statuses?: JobType | JobType[],
      start?: number,
      end?: number,
      asc?: boolean
    ) => Promise<Array<{ data: { versionId?: string }; remove: () => Promise<unknown> }>>
  },
  versionId: string
) {
  const inflightJobs = await parseQueue.getJobs(['waiting', 'active', 'delayed', 'prioritized'])
  for (const inflightJob of inflightJobs) {
    if (inflightJob.data.versionId === versionId) {
      await inflightJob.remove().catch(() => { /* already gone */ })
    }
  }
}

async function clearVersionDerivedData(
  db: PrismaClient,
  versionId: string
) {
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
}

function detectFileType(filename: string, _firstBytes?: Buffer): 'TXT' | 'DOC' | 'DOCX' | 'PDF' | 'MDX' {
  const ext = path.extname(filename).toLowerCase()
  if (ext === '.txt') return 'TXT'
  if (ext === '.doc') return 'DOC'
  if (ext === '.docx') return 'DOCX'
  if (ext === '.pdf') return 'PDF'
  if (ext === '.mdx') return 'MDX'
  throw badRequest(`Unsupported file type: ${ext}. Supported: .txt, .doc, .docx, .pdf, .mdx`)
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
        const activeFileContext = await getActiveVersionFileContext(fastify.db, versionId)
        const isReupload = Boolean(activeFileContext)

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

        // On re-upload: cancel in-flight jobs, detach old references, and clear parsed data.
        if (isReupload) {
          await cancelInflightParseJobs(fastify.parseQueue, versionId)
          await fastify.db.parseTask.updateMany({
            where: { versionId, status: { in: ['RUNNING', 'PENDING'] } },
            data: { status: 'FAILED' },
          })
          await clearVersionDerivedData(fastify.db, versionId)
          await detachActiveParseArtifactReference(fastify.db, versionId)
          await detachActiveVersionFileReference(fastify.db, versionId)

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

        let stagedUpload: Awaited<ReturnType<typeof stageSharedUpload>> | null = null

        try {
          stagedUpload = await stageSharedUpload(data.file, data.filename)
          const promotedUpload = await promoteStagedSharedUpload(stagedUpload)

          const { sharedFileAsset, task } = await fastify.db.$transaction(async (tx) => {
            const asset = await ensureSharedFileAsset(tx, {
              contentHash: stagedUpload!.contentHash,
              fileType,
              originalExtension: stagedUpload!.originalExtension,
              storagePath: promotedUpload.storagePath,
              fileSize: stagedUpload!.fileSize,
            })

            await bindSharedFileToVersion(tx, {
              versionId,
              sharedFileAssetId: asset.id,
              originalFileName: data.filename,
              uploadedByUserId: user.id,
            })

            const parseTask = await tx.parseTask.create({
              data: {
                versionId,
                status: 'PENDING',
                fileType,
                originalFileName: data.filename,
                storedFilePath: asset.storagePath,
                sharedFileAssetId: asset.id,
                contentHash: asset.contentHash,
                cacheHit: false,
              },
            })

            if (!promotedUpload.reusedExistingAsset && !asset.createdByTaskId) {
              await tx.sharedFileAsset.update({
                where: { id: asset.id },
                data: { createdByTaskId: parseTask.id },
              })
            }

            return { sharedFileAsset: asset, task: parseTask }
          })

          // Enqueue BullMQ job
          const job = await fastify.parseQueue.add(
            'parse',
            {
              taskId: task.id,
              versionId,
              filePath: sharedFileAsset.storagePath,
              fileType,
              mode: 'full',
            },
            { jobId: task.id }
          )

          // Save bullmqJobId
          const updatedTask = await fastify.db.parseTask.update({
            where: { id: task.id },
            data: { bullmqJobId: job.id },
          })

          reply.status(202).send({
            ...updatedTask,
            taskId: updatedTask.id,
            sharedFileAssetId: sharedFileAsset.id,
            contentHash: sharedFileAsset.contentHash,
            reusedFromExistingAsset: promotedUpload.reusedExistingAsset,
            cacheHit: false,
            isReupload,
          })
        } catch (error) {
          if (stagedUpload) {
            discardStagedUpload(stagedUpload.tempFilePath)
          }
          throw error
        }
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

        const activeFileContext = await getActiveVersionFileContext(fastify.db, versionId)
        if (!activeFileContext) throw notFound('UploadedFile', versionId)

        // Cancel any in-flight jobs first.
        await cancelInflightParseJobs(fastify.parseQueue, versionId)
        await fastify.db.parseTask.updateMany({
          where: { versionId, status: { in: ['RUNNING', 'PENDING'] } },
          data: { status: 'FAILED' },
        })

        await clearVersionDerivedData(fastify.db, versionId)
        await detachActiveParseArtifactReference(fastify.db, versionId)
        await detachActiveVersionFileReference(fastify.db, versionId)

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

        const activeFileContext = await getActiveVersionFileContext(fastify.db, versionId)
        if (!activeFileContext) throw notFound('UploadedFile', versionId)
        if (!fileExists(activeFileContext.sharedFileAsset.storagePath)) {
          throw notFound('StoredFile', activeFileContext.sharedFileAsset.storagePath)
        }

        const stream = getFileStream(activeFileContext.sharedFileAsset.storagePath)
        reply.header(
          'Content-Disposition',
          `attachment; filename*=UTF-8''${encodeURIComponent(activeFileContext.reference.originalFileName)}`
        )
        reply.header('Content-Type', 'application/octet-stream')
        return reply.send(stream)
      } catch (error) {
        throw error
      }
    }
  )
}

export default fileRoutes
