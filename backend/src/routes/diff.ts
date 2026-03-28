import { FastifyPluginAsync } from 'fastify'
import { diffEntriesDirect } from '../services/differ.js'
import { badRequest } from '../lib/errors.js'

const diffRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/v1/diff/batch (no auth, rate limited)
  fastify.post(
    '/diff/batch',
    {
      config: { rateLimit: { max: parseInt(process.env.DIFF_API_RATE_LIMIT_PER_MINUTE ?? '60', 10), timeWindow: '1 minute' } },
    },
    async (request) => {
      try {
        const { headwords, versionAId, versionBId } = request.body as {
          headwords: string[]
          versionAId: string
          versionBId: string
        }

        if (!Array.isArray(headwords) || headwords.length === 0 || headwords.length > 100) {
          throw badRequest('headwords must be an array of 1-100 strings')
        }

        if (!versionAId || !versionBId) {
          throw badRequest('versionAId and versionBId are required')
        }

        const results = await Promise.all(
          headwords.map(async (hw) => {
            try {
              const [entryA, entryB] = await Promise.all([
                fastify.db.entry.findFirst({
                  where: { versionId: versionAId, normalizedHeadword: hw },
                  include: { senses: { include: { examples: true } } },
                }),
                fastify.db.entry.findFirst({
                  where: { versionId: versionBId, normalizedHeadword: hw },
                  include: { senses: { include: { examples: true } } },
                }),
              ])

              // Use pre-computed alignment if available; fall back to on-the-fly diff
              let diff = null
              if (entryA && entryB) {
                const alignment = await fastify.db.entryAlignment.findFirst({
                  where: { entryAId: entryA.id, entryBId: entryB.id },
                  include: { senseDiffs: true },
                })
                if (alignment) {
                  diff = alignment
                } else {
                  // On-the-fly computation (T062)
                  const senseDiffs = diffEntriesDirect(
                    { id: entryA.id, senses: entryA.senses },
                    { id: entryB.id, senses: entryB.senses }
                  )
                  diff = { senseDiffs }
                }
              }

              return {
                headword: hw,
                foundInA: !!entryA,
                foundInB: !!entryB,
                diff,
              }
            } catch (err) {
              return {
                headword: hw,
                foundInA: false,
                foundInB: false,
                diff: null,
                error: err instanceof Error ? err.message : 'Unknown error',
              }
            }
          })
        )

        return results
      } catch (error) {
        throw error
      }
    }
  )
}

export default diffRoutes
