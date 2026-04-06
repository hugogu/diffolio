import { FastifyPluginAsync } from 'fastify'
import { authGuard, requireSessionUser, checkMaxVersions } from '../lib/auth-guard.js'
import { assertDictionaryOwner, assertVersionOwner } from '../lib/ownership.js'
import { assertSystemConfigVisible, assertUserConfigOwner } from '../lib/config-ownership.js'
import { notFound, unprocessable, badRequest, extractRootCause } from '../lib/errors.js'
import { validateConfig, resolveInheritance, compileConfig } from '../services/config-engine.js'
import { FormatConfigJson } from '../lib/types/shared.js'
import { getActiveVersionFileContext } from '../services/uploads/shared-file-assets.js'
import { ensureVersionActiveFileReference } from '../services/uploads/shared-file-assets.js'
import {
  appendConfigVersion,
  createConfigProfile,
  getConfigVersionById,
  getCurrentConfigVersion,
} from '../services/configs/versioning.js'
import { ensureVersionConfigLinks } from '../services/configs/bootstrap.js'
import { createParserFingerprint } from '../services/parse-artifacts/fingerprint.js'
import { findSharedParseArtifactByKey } from '../services/parse-artifacts/query.js'
import {
  bindParseArtifactToVersion,
  materializeParseArtifactToVersion,
} from '../services/parse-artifacts/persistence.js'
import {
  previewParseTxt,
  previewParseDocx,
  previewParseDoc,
  previewParsePdf,
  previewParseMdict,
} from '../services/parser/preview.js'

async function clearVersionDerivedData(
  db: import('@prisma/client').PrismaClient,
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
          formatConfig: {
            include: {
              configProfile: true,
              configVersion: true,
            },
          },
          parseTasks: { orderBy: { createdAt: 'desc' }, take: 5 },
        },
      })

      if (!version) throw notFound('DictionaryVersion', versionId)
      const activeFileContext = await getActiveVersionFileContext(fastify.db, versionId)

      return {
        ...version,
        activeFile: activeFileContext
          ? {
              ...activeFileContext.reference,
              sharedFileAsset: {
                ...activeFileContext.sharedFileAsset,
                fileSize: Number(activeFileContext.sharedFileAsset.fileSize),
              },
              latestTask: activeFileContext.latestTask,
            }
          : null,
      }
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
        const versionRecord = await fastify.db.dictionaryVersion.findUnique({
          where: { id: versionId },
          include: { formatConfig: true },
        })
        if (!versionRecord) throw notFound('DictionaryVersion', versionId)

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

        if (!validationResult.isValid) {
          throw unprocessable(
            'Format config validation failed',
            { errors: validationResult.errors, warnings: validationResult.warnings }
          )
        }

        const configName = (configData.name as string) ?? `Config for version ${versionId}`
        const config = await fastify.db.$transaction(async (tx) => {
          let profileId = versionRecord.formatConfig?.configProfileId

          if (!profileId) {
            const profile = await createConfigProfile(tx, {
              ownerType: 'USER',
              ownerUserId: user.id,
              name: configName,
              description: `Version-local config for ${versionRecord.label}`,
              createdBy: user.id,
            })
            profileId = profile.id
          } else {
            await tx.configProfile.update({
              where: { id: profileId },
              data: {
                name: configName,
                archivedAt: null,
              },
            })
          }

          const configVersion = await appendConfigVersion(tx, {
            profileId,
            configJson: mergedConfig as unknown as FormatConfigJson,
            createdBy: user.id,
            validationStatus: 'VALID',
            validationReport: validationResult.warnings.length > 0
              ? { errors: validationResult.errors, warnings: validationResult.warnings }
              : undefined,
            markAsCurrent: true,
          })

          return tx.formatConfig.upsert({
            where: { versionId },
            create: {
              versionId,
              name: configName,
              configJson: mergedConfig as never,
              parentConfigId: configData.parentConfigId as string | undefined,
              validationStatus: 'VALID',
              validationReport: validationResult.warnings.length > 0
                ? { errors: validationResult.errors, warnings: validationResult.warnings }
                : undefined,
              configProfileId: profileId,
              configVersionId: configVersion.id,
            },
            update: {
              name: configName,
              configJson: mergedConfig as never,
              parentConfigId: configData.parentConfigId as string | undefined,
              validationStatus: 'VALID',
              validationReport: validationResult.warnings.length > 0
                ? { errors: validationResult.errors, warnings: validationResult.warnings }
                : undefined,
              configProfileId: profileId,
              configVersionId: configVersion.id,
            },
          })
        })

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
          include: { formatConfig: true },
        })

        if (!version) throw notFound('DictionaryVersion', versionId)
        if (!version.formatConfig) throw badRequest('No format config found for this version')
        const configLink = await ensureVersionConfigLinks(fastify.db, versionId)
        const activeFileContext = await ensureVersionActiveFileReference(
          fastify.db,
          versionId,
          user.id
        ) ?? await getActiveVersionFileContext(fastify.db, versionId)
        if (!activeFileContext?.latestTask) {
          throw badRequest('No uploaded file found — upload a file first')
        }

        const latestTask = activeFileContext.latestTask

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

        await clearVersionDerivedData(fastify.db, versionId)

        const parserFingerprint = createParserFingerprint({
          fileType: latestTask.fileType,
          configJson: version.formatConfig.configJson as unknown as FormatConfigJson,
        })
        const existingArtifact = configLink?.configVersionId
          ? await findSharedParseArtifactByKey(fastify.db, {
              sharedFileAssetId: activeFileContext.sharedFileAsset.id,
              configVersionId: configLink.configVersionId,
              parserFingerprint,
            })
          : null

        if (existingArtifact?.status === 'READY') {
          const completedTask = await fastify.db.parseTask.create({
            data: {
              versionId,
              status: 'COMPLETED',
              fileType: latestTask.fileType,
              originalFileName: latestTask.originalFileName,
              storedFilePath: activeFileContext.sharedFileAsset.storagePath,
              sharedFileAssetId: activeFileContext.sharedFileAsset.id,
              parseArtifactId: existingArtifact.id,
              contentHash: activeFileContext.sharedFileAsset.contentHash,
              cacheHit: true,
              processedEntries: existingArtifact.totalEntries,
              totalEntries: existingArtifact.totalEntries,
              failedEntries: existingArtifact.failedEntries,
              checkpointOffset: existingArtifact.totalEntries,
              startedAt: new Date(),
              completedAt: new Date(),
            },
          })

          await materializeParseArtifactToVersion(fastify.db, {
            parseArtifactId: existingArtifact.id,
            versionId,
            taskId: completedTask.id,
          })
          await bindParseArtifactToVersion(fastify.db, {
            parseArtifactId: existingArtifact.id,
            versionId,
            parseTaskId: completedTask.id,
            userId: user.id,
          })

          reply.status(202).send(completedTask)
          return
        }

        // Create new parse task reusing the stored file
        const newTask = await fastify.db.parseTask.create({
          data: {
            versionId,
            status: 'PENDING',
            fileType: latestTask.fileType,
            originalFileName: latestTask.originalFileName,
            storedFilePath: activeFileContext.sharedFileAsset.storagePath,
            sharedFileAssetId: activeFileContext.sharedFileAsset.id,
            contentHash: activeFileContext.sharedFileAsset.contentHash,
            cacheHit: false,
          },
        })

        const job = await fastify.parseQueue.add(
          'parse',
          {
            taskId: newTask.id,
            versionId,
            filePath: activeFileContext.sharedFileAsset.storagePath,
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
        await db.parseArtifactReference.updateMany({
          where: { versionId, isActive: true },
          data: { isActive: false, detachedAt: new Date() },
        })

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

      const body = request.body as {
        sourceType?: 'SYSTEM' | 'USER'
        sourceId?: string
        configVersionId?: string
      }

      let sourceName: string
      let sourceConfigJson: unknown
      let sourceValidationStatus: string
      let sourceProfileId: string | null
      let sourceVersionId: string | null

      if (body.configVersionId) {
        const configVersion = await getConfigVersionById(fastify.db, body.configVersionId)
        if (!configVersion) {
          throw notFound('ConfigVersion', body.configVersionId)
        }

        if (configVersion.profile.ownerType === 'SYSTEM') {
          await assertSystemConfigVisible(fastify.db, configVersion.profileId, user.id)
        } else {
          await assertUserConfigOwner(fastify.db, configVersion.profileId, user.id)
        }

        sourceName = configVersion.profile.name
        sourceConfigJson = configVersion.configJson
        sourceValidationStatus = configVersion.validationStatus
        sourceProfileId = configVersion.profileId
        sourceVersionId = configVersion.id
      } else {
        if (!body.sourceId || !body.sourceType) {
          throw badRequest('Either configVersionId or sourceType/sourceId is required')
        }

        if (body.sourceType === 'SYSTEM') {
          const source = await assertSystemConfigVisible(fastify.db, body.sourceId, user.id)
          const currentVersion = await getCurrentConfigVersion(fastify.db, body.sourceId)
          sourceName = source.name
          sourceConfigJson = currentVersion?.configJson ?? source.configJson
          sourceValidationStatus = currentVersion?.validationStatus ?? source.validationStatus
          sourceProfileId = body.sourceId
          sourceVersionId = currentVersion?.id ?? null
        } else {
          const source = await assertUserConfigOwner(fastify.db, body.sourceId, user.id)
          const currentVersion = await getCurrentConfigVersion(fastify.db, body.sourceId)
          sourceName = source.name
          sourceConfigJson = currentVersion?.configJson ?? source.configJson
          sourceValidationStatus = currentVersion?.validationStatus ?? source.validationStatus
          sourceProfileId = body.sourceId
          sourceVersionId = currentVersion?.id ?? null
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const config = await fastify.db.formatConfig.upsert({
        where: { versionId },
        create: {
          versionId,
          name: sourceName,
          configJson: sourceConfigJson as any,
          validationStatus: sourceValidationStatus as any,
          sourceConfigId: body.sourceId ?? sourceProfileId ?? undefined,
          sourceConfigType: body.sourceType,
          configProfileId: sourceProfileId ?? undefined,
          configVersionId: sourceVersionId ?? undefined,
        },
        update: {
          name: sourceName,
          configJson: sourceConfigJson as any,
          validationStatus: sourceValidationStatus as any,
          sourceConfigId: body.sourceId ?? sourceProfileId ?? undefined,
          sourceConfigType: body.sourceType,
          configProfileId: sourceProfileId ?? undefined,
          configVersionId: sourceVersionId ?? undefined,
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
        const user = requireSessionUser(request)
        const { versionId } = request.params as { versionId: string }
        const { maxEntries = 30, startIndex = 0 } = (request.body ?? {}) as { maxEntries?: number; startIndex?: number }

        const version = await fastify.db.dictionaryVersion.findUnique({
          where: { id: versionId },
          include: { formatConfig: true },
        })

        if (!version) throw notFound('DictionaryVersion', versionId)
        if (!version.formatConfig) throw badRequest('No format config found for this version')
        const configLink = await ensureVersionConfigLinks(fastify.db, versionId)
        const activeFileContext = await ensureVersionActiveFileReference(
          fastify.db,
          versionId,
          user.id
        ) ?? await getActiveVersionFileContext(fastify.db, versionId)
        if (!activeFileContext?.latestTask) {
          throw badRequest('No uploaded file found for this version — upload a file first')
        }

        const task = activeFileContext.latestTask
        const cap = Math.min(maxEntries, 200)
        const parserFingerprint = createParserFingerprint({
          fileType: task.fileType,
          configJson: version.formatConfig.configJson as unknown as FormatConfigJson,
        })
        const existingArtifact = configLink?.configVersionId
          ? await findSharedParseArtifactByKey(fastify.db, {
              sharedFileAssetId: activeFileContext.sharedFileAsset.id,
              configVersionId: configLink.configVersionId,
              parserFingerprint,
            })
          : null

        if (existingArtifact?.status === 'READY') {
          const artifactEntries = await fastify.db.artifactEntry.findMany({
            where: { parseArtifactId: existingArtifact.id },
            orderBy: [{ pageNumber: 'asc' }, { lineNumber: 'asc' }, { createdAt: 'asc' }],
            skip: startIndex,
            take: cap,
            include: {
              senses: {
                orderBy: { position: 'asc' },
                include: {
                  examples: { orderBy: { position: 'asc' } },
                },
              },
            },
          })

          return {
            versionLabel: version.label,
            fileName: activeFileContext.reference.originalFileName,
            fileType: task.fileType,
            totalLinesScanned: existingArtifact.totalEntries,
            entries: artifactEntries.map((entry) => ({
              rawHeadword: entry.rawHeadword,
              normalizedHeadword: entry.normalizedHeadword,
              entrySequence: entry.entrySequence,
              phonetic: entry.phonetic,
              pageNumber: entry.pageNumber,
              lineNumber: entry.lineNumber,
              crossReferences: (entry.metadata as { crossReferences?: string[] } | null)?.crossReferences ?? [],
              senses: entry.senses.map((sense) => ({
                rawNumber: sense.rawNumber,
                normalizedNumber: sense.normalizedNumber,
                rawDefinition: sense.rawDefinition,
                definition: sense.definition,
                phonetic: sense.phonetic,
                grammaticalCat: sense.grammaticalCat,
                register: sense.register,
                etymology: sense.etymology,
                examples: sense.examples.map((example) => ({
                  rawText: example.rawText,
                  normalizedText: example.normalizedText,
                })),
              })),
            })),
            cacheHit: true,
            parseArtifactId: existingArtifact.id,
          }
        }

        const config = compileConfig(version.formatConfig.configJson as unknown as FormatConfigJson)

        let result
        try {
          switch (task.fileType) {
            case 'TXT':
              result = await previewParseTxt(activeFileContext.sharedFileAsset.storagePath, config, cap, startIndex)
              break
            case 'DOCX':
              result = await previewParseDocx(activeFileContext.sharedFileAsset.storagePath, config, cap, startIndex)
              break
            case 'DOC':
              result = await previewParseDoc(activeFileContext.sharedFileAsset.storagePath, config, cap, startIndex)
              break
            case 'PDF':
              result = await previewParsePdf(activeFileContext.sharedFileAsset.storagePath, config, cap, startIndex)
              break
            case 'MDX':
              result = await previewParseMdict(activeFileContext.sharedFileAsset.storagePath, config, cap, startIndex)
              break
            default:
              throw badRequest(`Unsupported file type: ${task.fileType}`)
          }
        } catch (err) {
          throw badRequest(`Preview parsing failed: ${extractRootCause(err)}`, undefined, extractRootCause(err))
        }

        return {
          versionLabel: version.label,
          fileName: activeFileContext.reference.originalFileName,
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
