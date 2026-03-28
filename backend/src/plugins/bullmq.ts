import fp from 'fastify-plugin'
import { FastifyPluginAsync } from 'fastify'
import { Queue } from 'bullmq'
import IORedis from 'ioredis'

export interface ParseJobData {
  taskId: string
  versionId: string
  filePath: string
  fileType: 'TXT' | 'DOC' | 'DOCX' | 'PDF'
  mode?: 'full' | 'retry-single'
  errorId?: string
}

export interface ComparisonJobData {
  comparisonId: string
}

export interface ExportJobData {
  exportJobId: string
  comparisonId: string
  senseChangeTypes?: string[]
  orderBy?: string
  taxonomySourceId?: string
  userId: string
  userEmail: string
}

export interface TaxonomyJobData {
  taxonomySourceId: string
  taskId: string
  filePath: string
}

declare module 'fastify' {
  interface FastifyInstance {
    parseQueue: Queue<ParseJobData>
    comparisonQueue: Queue<ComparisonJobData>
    exportQueue: Queue<ExportJobData>
    taxonomyQueue: Queue<TaxonomyJobData>
    redis: IORedis
  }
}

const bullmqPlugin: FastifyPluginAsync = fp(async (fastify) => {
  const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379'

  const redis = new IORedis(redisUrl, { maxRetriesPerRequest: null })

  const parseQueue = new Queue<ParseJobData>('parse', { connection: redis })
  const comparisonQueue = new Queue<ComparisonJobData>('comparison', { connection: redis })
  const exportQueue = new Queue<ExportJobData>('export', { connection: redis })
  const taxonomyQueue = new Queue<TaxonomyJobData>('taxonomy', { connection: redis })

  fastify.decorate('redis', redis)
  fastify.decorate('parseQueue', parseQueue)
  fastify.decorate('comparisonQueue', comparisonQueue)
  fastify.decorate('exportQueue', exportQueue)
  fastify.decorate('taxonomyQueue', taxonomyQueue)

  fastify.addHook('onClose', async () => {
    await parseQueue.close()
    await comparisonQueue.close()
    await exportQueue.close()
    await taxonomyQueue.close()
    redis.disconnect()
  })
})

export default bullmqPlugin
