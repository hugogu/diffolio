import {
  Prisma,
  PrismaClient,
  ConfigOwnerType,
  ConfigStatus,
  ConfigVisibility,
} from '@prisma/client'
import { FormatConfigJson } from '../../lib/types/shared.js'
import { validateConfig } from '../config-engine.js'
import { createConfigContentHash } from '../parse-artifacts/fingerprint.js'

type TxClient = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]
type DbClient = PrismaClient | TxClient

export async function getCurrentConfigVersion(db: DbClient, profileId: string) {
  return db.configVersion.findFirst({
    where: { profileId, isCurrent: true },
    orderBy: { versionNumber: 'desc' },
  })
}

export async function getConfigVersionById(db: DbClient, versionId: string) {
  return db.configVersion.findUnique({
    where: { id: versionId },
    include: {
      profile: true,
      createdByUser: {
        select: { id: true, email: true },
      },
    },
  })
}

export async function createConfigProfile(
  db: DbClient,
  input: {
    id?: string
    ownerType: ConfigOwnerType
    ownerUserId?: string | null
    name: string
    description?: string | null
    visibility?: ConfigVisibility | null
    createdBy: string
  }
) {
  return db.configProfile.create({
    data: {
      id: input.id,
      ownerType: input.ownerType,
      ownerUserId: input.ownerUserId ?? undefined,
      name: input.name,
      description: input.description ?? undefined,
      visibility: input.visibility ?? undefined,
      createdBy: input.createdBy,
    },
  })
}

export async function appendConfigVersion(
  db: DbClient,
  input: {
    profileId: string
    configJson: FormatConfigJson
    createdBy: string
    validationStatus?: ConfigStatus
    validationReport?: Prisma.InputJsonValue | null
    markAsCurrent?: boolean
  }
) {
  const current = await db.configVersion.findFirst({
    where: { profileId: input.profileId },
    orderBy: { versionNumber: 'desc' },
    select: { versionNumber: true },
  })

  if (input.markAsCurrent ?? true) {
    await db.configVersion.updateMany({
      where: { profileId: input.profileId, isCurrent: true },
      data: { isCurrent: false },
    })
  }

  return db.configVersion.create({
    data: {
      profileId: input.profileId,
      versionNumber: (current?.versionNumber ?? 0) + 1,
      configJson: input.configJson as unknown as Prisma.InputJsonValue,
      validationStatus: input.validationStatus ?? 'PENDING',
      validationReport: input.validationReport ?? undefined,
      contentHash: createConfigContentHash(input.configJson),
      isCurrent: input.markAsCurrent ?? true,
      createdBy: input.createdBy,
    },
  })
}

export async function createConfigProfileVersion(
  db: DbClient,
  input: {
    id?: string
    ownerType: ConfigOwnerType
    ownerUserId?: string | null
    name: string
    description?: string | null
    visibility?: ConfigVisibility | null
    createdBy: string
    configJson: FormatConfigJson
  }
) {
  const validation = validateConfig(input.configJson)
  const validationStatus: ConfigStatus = validation.isValid ? 'VALID' : 'INVALID'
  const validationReport = validation.errors.length > 0 || validation.warnings.length > 0
    ? { errors: validation.errors, warnings: validation.warnings }
    : undefined

  const profile = await createConfigProfile(db, {
    id: input.id,
    ownerType: input.ownerType,
    ownerUserId: input.ownerUserId ?? undefined,
    name: input.name,
    description: input.description,
    visibility: input.visibility,
    createdBy: input.createdBy,
  })

  const version = await appendConfigVersion(db, {
    profileId: profile.id,
    configJson: input.configJson,
    createdBy: input.createdBy,
    validationStatus,
    validationReport: validationReport as Prisma.InputJsonValue | undefined,
    markAsCurrent: true,
  })

  return { profile, version, validation }
}
