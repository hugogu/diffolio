import { ConfigStatus, Prisma, PrismaClient } from '@prisma/client'
import { validateConfig } from '../config-engine.js'
import { FormatConfigJson } from '../../lib/types/shared.js'
import {
  appendConfigVersion,
  createConfigProfile,
  getConfigVersionById,
  getCurrentConfigVersion,
} from './versioning.js'

type TxClient = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]
type DbClient = PrismaClient | TxClient

export function buildValidationPayload(configJson: FormatConfigJson) {
  const validation = validateConfig(configJson)
  const validationStatus: 'VALID' | 'INVALID' = validation.isValid ? 'VALID' : 'INVALID'
  const validationReport = validation.errors.length > 0 || validation.warnings.length > 0
    ? { errors: validation.errors, warnings: validation.warnings }
    : undefined

  return {
    validation,
    validationStatus,
    validationReport,
  }
}

async function upsertUserSnapshot(
  db: DbClient,
  input: {
    id?: string
    userId: string
    name: string
    description?: string | null
    configJson: FormatConfigJson
    clonedFromId?: string | null
    validationStatus: 'VALID' | 'INVALID'
    validationReport?: { errors: string[]; warnings: string[] }
  }
) {
  const payload = {
    userId: input.userId,
    name: input.name,
    description: input.description ?? undefined,
    configJson: input.configJson as unknown as Prisma.InputJsonValue,
    validationStatus: input.validationStatus,
    validationReport: input.validationReport as Prisma.InputJsonValue | undefined,
    clonedFromId: input.clonedFromId ?? undefined,
  }

  if (!input.id) {
    return db.userFormatConfig.create({ data: payload })
  }

  return db.userFormatConfig.update({
    where: { id: input.id },
    data: payload,
  })
}

async function upsertSystemSnapshot(
  db: DbClient,
  input: {
    id?: string
    adminUserId: string
    name: string
    description?: string | null
    visibility: 'ALL_USERS' | 'SPECIFIC_USERS'
    configJson: FormatConfigJson
    validationStatus: 'VALID' | 'INVALID'
    validationReport?: { errors: string[]; warnings: string[] }
  }
) {
  const payload = {
    name: input.name,
    description: input.description ?? undefined,
    visibility: input.visibility,
    configJson: input.configJson as unknown as Prisma.InputJsonValue,
    validationStatus: input.validationStatus,
    validationReport: input.validationReport as Prisma.InputJsonValue | undefined,
  }

  if (!input.id) {
    return db.systemFormatConfig.create({
      data: {
        ...payload,
        createdById: input.adminUserId,
      },
    })
  }

  return db.systemFormatConfig.update({
    where: { id: input.id },
    data: payload,
  })
}

export async function ensureUserConfigSnapshot(
  db: DbClient,
  input: {
    id?: string
    userId: string
    name: string
    description?: string | null
    configJson: FormatConfigJson
    clonedFromId?: string | null
  }
) {
  const { validationStatus, validationReport } = buildValidationPayload(input.configJson)
  const snapshot = await upsertUserSnapshot(db, {
    ...input,
    validationStatus,
    validationReport,
  })

  const existingProfile = await db.configProfile.findUnique({ where: { id: snapshot.id } })
  if (!existingProfile) {
    await createConfigProfile(db, {
      id: snapshot.id,
      ownerType: 'USER',
      ownerUserId: input.userId,
      name: input.name,
      description: input.description,
      createdBy: input.userId,
    })
  } else {
    await db.configProfile.update({
      where: { id: snapshot.id },
      data: {
        name: input.name,
        description: input.description ?? undefined,
        archivedAt: null,
      },
    })
  }

  const currentVersion = await getCurrentConfigVersion(db, snapshot.id)
  const currentJson = currentVersion?.configJson as FormatConfigJson | undefined
  if (JSON.stringify(currentJson ?? null) !== JSON.stringify(input.configJson)) {
    await appendConfigVersion(db, {
      profileId: snapshot.id,
      configJson: input.configJson,
      createdBy: input.userId,
      validationStatus: validationStatus as ConfigStatus,
      validationReport: validationReport as Prisma.InputJsonValue | undefined,
      markAsCurrent: true,
    })
  }

  return snapshot
}

export async function ensureSystemConfigSnapshot(
  db: DbClient,
  input: {
    id?: string
    adminUserId: string
    name: string
    description?: string | null
    visibility: 'ALL_USERS' | 'SPECIFIC_USERS'
    configJson: FormatConfigJson
    allowedUserIds?: string[]
  }
) {
  const { validationStatus, validationReport } = buildValidationPayload(input.configJson)
  const snapshot = await upsertSystemSnapshot(db, {
    ...input,
    validationStatus,
    validationReport,
  })

  const existingProfile = await db.configProfile.findUnique({ where: { id: snapshot.id } })
  if (!existingProfile) {
    await createConfigProfile(db, {
      id: snapshot.id,
      ownerType: 'SYSTEM',
      name: input.name,
      description: input.description,
      visibility: input.visibility,
      createdBy: input.adminUserId,
    })
  } else {
    await db.configProfile.update({
      where: { id: snapshot.id },
      data: {
        name: input.name,
        description: input.description ?? undefined,
        visibility: input.visibility,
        archivedAt: null,
      },
    })
  }

  const currentVersion = await getCurrentConfigVersion(db, snapshot.id)
  const currentJson = currentVersion?.configJson as FormatConfigJson | undefined
  if (JSON.stringify(currentJson ?? null) !== JSON.stringify(input.configJson)) {
    await appendConfigVersion(db, {
      profileId: snapshot.id,
      configJson: input.configJson,
      createdBy: input.adminUserId,
      validationStatus: validationStatus as ConfigStatus,
      validationReport: validationReport as Prisma.InputJsonValue | undefined,
      markAsCurrent: true,
    })
  }

  await db.systemConfigVisibility.deleteMany({ where: { systemConfigId: snapshot.id } })
  if (input.visibility === 'SPECIFIC_USERS' && input.allowedUserIds && input.allowedUserIds.length > 0) {
    await db.systemConfigVisibility.createMany({
      data: input.allowedUserIds.map((userId) => ({ systemConfigId: snapshot.id, userId })),
      skipDuplicates: true,
    })
  }

  return snapshot
}

export async function listConfigVersions(db: DbClient, profileId: string) {
  return db.configVersion.findMany({
    where: { profileId },
    orderBy: { versionNumber: 'desc' },
    include: {
      createdByUser: {
        select: { id: true, email: true },
      },
    },
  })
}

export async function getConfigVersionDetail(
  db: DbClient,
  profileId: string,
  versionId: string
) {
  const version = await getConfigVersionById(db, versionId)
  if (!version || version.profileId !== profileId) {
    return null
  }

  return version
}
