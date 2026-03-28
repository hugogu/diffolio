import { PrismaClient, SystemFormatConfig, UserFormatConfig } from '@prisma/client'
import { forbidden, notFound } from './errors.js'

type DB = PrismaClient

/**
 * Assert that the given user owns the specified UserFormatConfig.
 * Throws 404 if config not found, 403 if not the owner.
 * Returns the config record for use by the caller.
 */
export async function assertUserConfigOwner(
  db: DB,
  configId: string,
  userId: string
): Promise<UserFormatConfig> {
  const config = await db.userFormatConfig.findUnique({ where: { id: configId } })
  if (!config) throw notFound('UserFormatConfig', configId)
  if (config.userId !== userId) throw forbidden()
  return config
}

/**
 * Assert that the given user can see the specified SystemFormatConfig.
 * ALL_USERS configs are always visible; SPECIFIC_USERS configs require a
 * matching row in system_config_visibility.
 * Throws 404 if config not found, 403 if not visible.
 * Returns the config record for use by the caller.
 */
export async function assertSystemConfigVisible(
  db: DB,
  configId: string,
  userId: string
): Promise<SystemFormatConfig> {
  const config = await db.systemFormatConfig.findUnique({
    where: { id: configId },
    include: { allowedUsers: { where: { userId } } },
  })
  if (!config) throw notFound('SystemFormatConfig', configId)
  const { allowedUsers, ...configData } = config as SystemFormatConfig & { allowedUsers: unknown[] }
  if (config.visibility === 'SPECIFIC_USERS' && allowedUsers.length === 0) {
    throw forbidden()
  }
  return configData
}
