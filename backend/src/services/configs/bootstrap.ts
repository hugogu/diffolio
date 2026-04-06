import {
  ConfigOwnerType,
  ConfigVisibility,
  Prisma,
  PrismaClient,
} from '@prisma/client'
import { FormatConfigJson } from '../../lib/types/shared.js'
import { createConfigContentHash } from '../parse-artifacts/fingerprint.js'
import { appendConfigVersion, createConfigProfile } from './versioning.js'

type TxClient = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]
type DbClient = PrismaClient | TxClient

interface ProfileSeed {
  profileId: string
  ownerType: ConfigOwnerType
  ownerUserId?: string | null
  name: string
  description?: string | null
  visibility?: ConfigVisibility | null
  createdBy: string
  markAsCurrent: boolean
  shouldRefreshProfileMetadata: boolean
}

async function resolveProfileSeed(
  db: DbClient,
  input: {
    formatConfig: {
      id: string
      name: string
      configProfileId?: string | null
      sourceConfigId?: string | null
      sourceConfigType?: 'SYSTEM' | 'USER' | null
    }
    ownerUserId: string
    versionLabel: string
  }
): Promise<ProfileSeed> {
  const { formatConfig, ownerUserId, versionLabel } = input

  if (formatConfig.sourceConfigType === 'SYSTEM' && formatConfig.sourceConfigId) {
    const systemConfig = await db.systemFormatConfig.findUnique({
      where: { id: formatConfig.sourceConfigId },
      select: {
        id: true,
        name: true,
        description: true,
        visibility: true,
        createdById: true,
      },
    })

    if (systemConfig) {
      return {
        profileId: systemConfig.id,
        ownerType: 'SYSTEM',
        name: systemConfig.name,
        description: systemConfig.description,
        visibility: systemConfig.visibility,
        createdBy: systemConfig.createdById,
        markAsCurrent: false,
        shouldRefreshProfileMetadata: false,
      }
    }
  }

  if (formatConfig.sourceConfigType === 'USER' && formatConfig.sourceConfigId) {
    const userConfig = await db.userFormatConfig.findUnique({
      where: { id: formatConfig.sourceConfigId },
      select: {
        id: true,
        userId: true,
        name: true,
        description: true,
      },
    })

    if (userConfig) {
      return {
        profileId: userConfig.id,
        ownerType: 'USER',
        ownerUserId: userConfig.userId,
        name: userConfig.name,
        description: userConfig.description,
        createdBy: userConfig.userId,
        markAsCurrent: false,
        shouldRefreshProfileMetadata: false,
      }
    }
  }

  return {
    profileId: formatConfig.configProfileId ?? formatConfig.id,
    ownerType: 'USER',
    ownerUserId,
    name: formatConfig.name || `Version config for ${versionLabel}`,
    description: `Version-local config snapshot for ${versionLabel}`,
    createdBy: ownerUserId,
    markAsCurrent: true,
    shouldRefreshProfileMetadata: true,
  }
}

async function ensureProfile(db: DbClient, seed: ProfileSeed) {
  const existing = await db.configProfile.findUnique({
    where: { id: seed.profileId },
  })

  if (!existing) {
    return createConfigProfile(db, {
      id: seed.profileId,
      ownerType: seed.ownerType,
      ownerUserId: seed.ownerUserId,
      name: seed.name,
      description: seed.description,
      visibility: seed.visibility,
      createdBy: seed.createdBy,
    })
  }

  if (!seed.shouldRefreshProfileMetadata) {
    return existing
  }

  return db.configProfile.update({
    where: { id: seed.profileId },
    data: {
      ownerType: seed.ownerType,
      ownerUserId: seed.ownerUserId ?? undefined,
      name: seed.name,
      description: seed.description ?? undefined,
      visibility: seed.visibility ?? undefined,
      archivedAt: null,
    },
  })
}

export async function ensureVersionConfigLinks(db: DbClient, versionId: string) {
  const version = await db.dictionaryVersion.findUnique({
    where: { id: versionId },
    include: {
      dictionary: {
        select: { userId: true },
      },
      formatConfig: true,
    },
  })

  if (!version?.formatConfig || !version.dictionary.userId) {
    return null
  }

  const formatConfig = version.formatConfig
  const configJson = formatConfig.configJson as unknown as FormatConfigJson
  const expectedContentHash = createConfigContentHash(configJson)

  if (formatConfig.configProfileId && formatConfig.configVersionId) {
    const existingVersion = await db.configVersion.findUnique({
      where: { id: formatConfig.configVersionId },
      select: {
        id: true,
        profileId: true,
        contentHash: true,
      },
    })

    if (
      existingVersion
      && existingVersion.profileId === formatConfig.configProfileId
      && existingVersion.contentHash === expectedContentHash
    ) {
      if (formatConfig.contentHash !== expectedContentHash) {
        await db.formatConfig.update({
          where: { id: formatConfig.id },
          data: { contentHash: expectedContentHash },
        })
      }

      return {
        formatConfigId: formatConfig.id,
        configProfileId: formatConfig.configProfileId,
        configVersionId: formatConfig.configVersionId,
        contentHash: expectedContentHash,
      }
    }
  }

  const profileSeed = await resolveProfileSeed(db, {
    formatConfig,
    ownerUserId: version.dictionary.userId,
    versionLabel: version.label,
  })

  await ensureProfile(db, profileSeed)

  let configVersion = await db.configVersion.findFirst({
    where: {
      profileId: profileSeed.profileId,
      contentHash: expectedContentHash,
    },
    orderBy: { versionNumber: 'desc' },
  })

  if (!configVersion) {
    configVersion = await appendConfigVersion(db, {
      profileId: profileSeed.profileId,
      configJson,
      createdBy: profileSeed.createdBy,
      validationStatus: formatConfig.validationStatus,
      validationReport: formatConfig.validationReport as Prisma.InputJsonValue | undefined,
      markAsCurrent: profileSeed.markAsCurrent,
    })
  }

  await db.formatConfig.update({
    where: { id: formatConfig.id },
    data: {
      configProfileId: profileSeed.profileId,
      configVersionId: configVersion.id,
      contentHash: expectedContentHash,
    },
  })

  return {
    formatConfigId: formatConfig.id,
    configProfileId: profileSeed.profileId,
    configVersionId: configVersion.id,
    contentHash: expectedContentHash,
  }
}
