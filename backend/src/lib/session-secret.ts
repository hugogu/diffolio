import crypto from 'node:crypto'
import { PrismaClient } from '@prisma/client'

const DEFAULT_PLACEHOLDER = 'change-me-in-production'

/**
 * Resolves the session secret to use.
 * If SESSION_SECRET env var is set to a non-default value, use it directly.
 * Otherwise, read from system_settings table (auto-generating if absent).
 */
export async function resolveSessionSecret(): Promise<string> {
  const envSecret = process.env.SESSION_SECRET ?? ''
  if (envSecret && envSecret !== DEFAULT_PLACEHOLDER && envSecret.length >= 32) {
    return envSecret
  }

  // Use a short-lived PrismaClient just for this bootstrap query
  const prisma = new PrismaClient()
  try {
    const row = await prisma.systemSetting.findUnique({ where: { key: 'session_secret' } })
    if (row) {
      return row.value
    }

    const generated = crypto.randomBytes(32).toString('hex')
    await prisma.systemSetting.upsert({
      where: { key: 'session_secret' },
      create: { key: 'session_secret', value: generated },
      update: { value: generated },
    })
    console.info('[startup] Auto-generated SESSION_SECRET and stored in system_settings.')
    return generated
  } finally {
    await prisma.$disconnect()
  }
}
