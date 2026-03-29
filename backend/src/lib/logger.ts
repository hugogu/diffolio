import pino from 'pino'

export function createLogger(options: { name: string }) {
  return pino({
    level: process.env.LOG_LEVEL ?? 'info',
    name: options.name,
  })
}

export default createLogger
