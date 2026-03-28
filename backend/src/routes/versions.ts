import { FastifyPluginAsync } from 'fastify'
import { authGuard, requireSessionUser, checkMaxVersions } from '../lib/auth-guard.js'
import { assertDictionaryOwner, assertVersionOwner } from '../lib/ownership.js'
import { assertSystemConfigVisible, assertUserConfigOwner } from '../lib/config-ownership.js'
import { notFound, unprocessable, badRequest, extractRootCause } from '../lib/errors.js'
import { validateConfig, resolveInheritance, compileConfig } from '../services/config-engine.js'
import { FormatConfigJson } from '../lib/types/shared.js'
import {
  previewParseTxt,
  previewParseDocx,
  previewParseDoc,
  previewParsePdf,
  previewParseMdict,
} from '../services/parser/preview.js'

const versionRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/dictionaries/:dictionaryId/versions
  fastify.get('/dictionaries/:dictionaryId/versions', { preHandler: authGuard() }, async (request) => {
    try {
      const user = requireSessionUser(request)
      const { dictionaryId } = request.params as { dictionaryId: string }
      await assertDictionaryOwner(fastify.db, dictionaryId, user.id)
      const versions = await fastify.db.dictionaryVersion.findMany({
        where: { dictionaryId },
        orderBy: { publishedYear: 'asc' },
        include: { formatConfig: { select: { id: true, name: true, validationStatus: true } } },
      })
      return versions
    } catch (error) {
      throw error
    }
  })

  // POST /api/v1/dictionaries/:dictionaryId/versions
  fastify.post(
    '/dictionaries/:dictionaryId/versions',
    { preHandler: [authGuard(), checkMaxVersions()] },
    async (request, reply) => {
      try {
        const user = requireSessionUser(request)
        const { dictionaryId } = request.params as { dictionaryId: string }
        await assertDictionaryOwner(fastify.db, dictionaryId, user.id)
        const body = request.body as {
          label: string
          publishedYear?: number
          notes?: string
        }

        const version = await fastify.db.dictionaryVersion.create({
          data: {
            dictionaryId,
            label: body.label,
            publishedYear: body.publishedYear,
            notes: body.notes,
          },
        })

        reply.status(201).send(version)
      } catch (error) {
        throw error
      }
    }
  )

  // GET /api/v1/versions/:versionId
  fastify.get('/versions/:versionId', { preHandler: authGuard() }, async (request) => {
    try {
      const user = requireSessionUser(request)
      const { versionId } = request.params as { versionId: string }
      await assertVersionOwner(fastify.db, versionId, user.id)
      const version = await fastify.db.dictionaryVersion.findUnique({
        where: { id: versionId },
        include: {
          dictionary: true,
          formatConfig: true,
          parseTasks: { orderBy: { createdAt: 'desc' }, take: 5 },
        },
      })

      if (!version) throw notFound('DictionaryVersion', versionId)
      return version
    } catch (error) {
      throw error
    }
  })

  // POST /api/v1/versions/:versionId/config
  fastify.post(
    '/versions/:versionId/config',
    { preHandler: authGuard() },
    async (request, reply) => {
      try {
        const user = requireSessionUser(request)
        const { versionId } = request.params as { versionId: string }
        await assertVersionOwner(fastify.db, versionId, user.id)

        // Accept JSON body directly (config JSON)
        const raw = request.body

        const validationResult = validateConfig(raw)

        let parentConfigJson: Record<string, unknown> | null = null
        const configData = raw as { parentConfigId?: string } & Record<string, unknown>
        if (configData.parentConfigId) {
          const parentConfig = await fastify.db.formatConfig.findUnique({
            where: { id: configData.parentConfigId as string },
          })
          if (parentConfig) {
            parentConfigJson = parentConfig.configJson as Record<string, unknown>
          }
        }

        const mergedConfig = parentConfigJson
          ? resolveInheritance(raw as Record<string, unknown>, parentConfigJson)
          : (raw as Record<string, unknown>)

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const validationReportJson = validationResult.errors.length > 0
          ? { errors: validationResult.errors, warnings: validationResult.warnings } as any
          : undefined

        const config = await fastify.db.formatConfig.upsert({
          where: { versionId },
          create: {
            versionId,
            name: (configData.name as string) ?? `Config for version ${versionId}`,
            configJson: mergedConfig as any,
            parentConfigId: configData.parentConfigId as string | undefined,
            validationStatus: validationResult.isValid ? 'VALID' : 'INVALID',
            validationReport: validationReportJson,
          },
          update: {
            name: (configData.name as string) ?? `Config for version ${versionId}`,
            configJson: mergedConfig as any,
            parentConfigId: configData.parentConfigId as string | undefined,
            validationStatus: validationResult.isValid ? 'VALID' : 'INVALID',
            validationReport: validationReportJson,
          },
        })

        if (!validationResult.isValid) {
          throw unprocessable(
            'Format config validation failed',
            { errors: validationResult.errors, warnings: validationResult.warnings }
          )
        }

        reply.status(200).send(config)
      } catch (error) {
        throw error
      }
    }
  )

  // POST /api/v1/versions/:versionId/reparse
  fastify.post(
    '/versions/:versionId/reparse',
    { preHandler: authGuard() },
    async (request, reply) => {
      try {
        const user = requireSessionUser(request)
        const { versionId } = request.params as { versionId: string }
        await assertVersionOwner(fastify.db, versionId, user.id)

        const version = await fastify.db.dictionaryVersion.findUnique({
          where: { id: versionId },
          include: {
            formatConfig: true,
            parseTasks: {
              where: { status: { in: ['COMPLETED', 'FAILED'] } },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        })

        if (!version) throw notFound('DictionaryVersion', versionId)
        if (!version.formatConfig) throw badRequest('No format config found for this version')
        if (version.parseTasks.length === 0) {
          throw badRequest('No uploaded file found — upload a file first')
        }

        const latestTask = version.parseTasks[0]

        // Cancel any pending/active parse jobs for this version to avoid FK races.
        // Active jobs detect the FAILED status check and abort mid-loop.
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

        // Clean up existing data using raw SQL for performance (large datasets).
        // Deletes run sequentially in dependency order; no transaction needed since
        // reparse can be retried safely if interrupted.
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
        await db.$executeRaw`
          DELETE FROM entries WHERE "version_id" = ${v}`

        // Create new parse task reusing the stored file
        const newTask = await fastify.db.parseTask.create({
          data: {
            versionId,
            status: 'PENDING',
            fileType: latestTask.fileType,
            originalFileName: latestTask.originalFileName,
            storedFilePath: latestTask.storedFilePath,
          },
        })

        const job = await fastify.parseQueue.add(
          'parse',
          {
            taskId: newTask.id,
            versionId,
            filePath: latestTask.storedFilePath,
            fileType: latestTask.fileType,
            mode: 'full',
          },
          { jobId: newTask.id }
        )

        await fastify.db.parseTask.update({
          where: { id: newTask.id },
          data: { bullmqJobId: job.id },
        })

        reply.status(202).send(newTask)
      } catch (error) {
        throw error
      }
    }
  )

  // DELETE /api/v1/versions/:versionId/entries — clear all parsed data without re-parsing
  fastify.delete(
    '/versions/:versionId/entries',
    { preHandler: authGuard() },
    async (request, reply) => {
      try {
        const user = requireSessionUser(request)
        const { versionId } = request.params as { versionId: string }
        await assertVersionOwner(fastify.db, versionId, user.id)

        const exists = await fastify.db.dictionaryVersion.findUnique({ where: { id: versionId } })
        if (!exists) throw notFound('DictionaryVersion', versionId)

        // Cancel any pending/active parse jobs before deleting to avoid FK races.
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

        reply.status(204).send()
      } catch (error) {
        throw error
      }
    }
  )

  // POST /api/v1/versions/:versionId/config/apply
  // Applies a system or personal config template as a snapshot to this version's format_configs.
  fastify.post(
    '/versions/:versionId/config/apply',
    { preHandler: authGuard() },
    async (request) => {
      const user = requireSessionUser(request)
      const { versionId } = request.params as { versionId: string }
      await assertVersionOwner(fastify.db, versionId, user.id)

      const body = request.body as { sourceType: 'SYSTEM' | 'USER'; sourceId: string }

      let sourceName: string
      let sourceConfigJson: unknown
      let sourceValidationStatus: string

      if (body.sourceType === 'SYSTEM') {
        const source = await assertSystemConfigVisible(fastify.db, body.sourceId, user.id)
        sourceName = source.name
        sourceConfigJson = source.configJson
        sourceValidationStatus = source.validationStatus
      } else {
        const source = await assertUserConfigOwner(fastify.db, body.sourceId, user.id)
        sourceName = source.name
        sourceConfigJson = source.configJson
        sourceValidationStatus = source.validationStatus
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const config = await fastify.db.formatConfig.upsert({
        where: { versionId },
        create: {
          versionId,
          name: sourceName,
          configJson: sourceConfigJson as any,
          validationStatus: sourceValidationStatus as any,
          sourceConfigId: body.sourceId,
          sourceConfigType: body.sourceType,
        },
        update: {
          name: sourceName,
          configJson: sourceConfigJson as any,
          validationStatus: sourceValidationStatus as any,
          sourceConfigId: body.sourceId,
          sourceConfigType: body.sourceType,
        },
      })

      return config
    }
  )

  // POST /api/v1/versions/:versionId/parse-preview
  fastify.post(
    '/versions/:versionId/parse-preview',
    { preHandler: authGuard() },
    async (request) => {
      try {
        const { versionId } = request.params as { versionId: string }
        const { maxEntries = 30, startIndex = 0 } = (request.body ?? {}) as { maxEntries?: number; startIndex?: number }

        const version = await fastify.db.dictionaryVersion.findUnique({
          where: { id: versionId },
          include: {
            formatConfig: true,
            parseTasks: {
              where: { status: { in: ['COMPLETED', 'FAILED'] } },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        })

        if (!version) throw notFound('DictionaryVersion', versionId)
        if (!version.formatConfig) throw badRequest('No format config found for this version')
        if (version.parseTasks.length === 0) {
          throw badRequest('No uploaded file found for this version — upload a file first')
        }

        const task = version.parseTasks[0]
        const cap = Math.min(maxEntries, 200)
        const config = compileConfig(version.formatConfig.configJson as unknown as FormatConfigJson)

        let result
        try {
          switch (task.fileType) {
            case 'TXT':
              result = await previewParseTxt(task.storedFilePath, config, cap, startIndex)
              break
            case 'DOCX':
              result = await previewParseDocx(task.storedFilePath, config, cap, startIndex)
              break
            case 'DOC':
              result = await previewParseDoc(task.storedFilePath, config, cap, startIndex)
              break
            case 'PDF':
              result = await previewParsePdf(task.storedFilePath, config, cap, startIndex)
              break
            case 'MDX':
              result = await previewParseMdict(task.storedFilePath, config, cap, startIndex)
              break
            default:
              throw badRequest(`Unsupported file type: ${task.fileType}`)
          }
        } catch (err) {
          throw badRequest(`Preview parsing failed: ${extractRootCause(err)}`, undefined, extractRootCause(err))
        }

        return {
          versionLabel: version.label,
          fileName: task.originalFileName,
          fileType: task.fileType,
          totalLinesScanned: result.totalLinesScanned,
          entries: result.entries,
        }
      } catch (error) {
        throw error
      }
    }
  )
}

export default versionRoutes
