import pino from 'pino'

const workerLogger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
})

export default workerLogger
