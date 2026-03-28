import { Worker, Job } from 'bullmq'
import IORedis from 'ioredis'
import { sendVerificationEmail } from '../lib/email.js'
import logger from '../lib/worker-logger.js'

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'
const redis = new IORedis(REDIS_URL, { maxRetriesPerRequest: null })

export interface EmailJobData {
  type: 'send-verification'
  to: string
  token: string
}

const worker = new Worker<EmailJobData>(
  'email',
  async (job: Job<EmailJobData>) => {
    if (job.data.type === 'send-verification') {
      await sendVerificationEmail(job.data.to, job.data.token)
    }
  },
  { connection: redis }
)

worker.on('completed', (job) => {
  logger.info({ jobId: job.id, type: job.data.type }, 'Email job completed')
})

worker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, 'Email job failed')
})

export default worker
