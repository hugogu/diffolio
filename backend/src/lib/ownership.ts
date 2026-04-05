import { PrismaClient } from '@prisma/client'
import { forbidden, notFound } from './errors.js'
import { getActiveVersionFileReference } from '../services/uploads/shared-file-assets.js'
import { getActiveParseArtifactReference } from '../services/parse-artifacts/query.js'

type DB = PrismaClient

export async function assertDictionaryOwner(db: DB, dictionaryId: string, userId: string): Promise<void> {
  const dict = await db.dictionary.findUnique({ where: { id: dictionaryId }, select: { userId: true } })
  if (!dict) throw notFound('Dictionary', dictionaryId)
  if (dict.userId !== userId) throw forbidden()
}

export async function assertVersionOwner(db: DB, versionId: string, userId: string): Promise<void> {
  const version = await db.dictionaryVersion.findUnique({
    where: { id: versionId },
    select: { dictionary: { select: { userId: true } } },
  })
  if (!version) throw notFound('DictionaryVersion', versionId)
  if (version.dictionary.userId !== userId) throw forbidden()
}

export async function assertEntryOwner(db: DB, entryId: string, userId: string): Promise<void> {
  const entry = await db.entry.findUnique({
    where: { id: entryId },
    select: {
      version: {
        select: {
          dictionary: {
            select: { userId: true },
          },
        },
      },
    },
  })
  if (!entry) throw notFound('Entry', entryId)
  if (entry.version.dictionary.userId !== userId) throw forbidden()
}

export async function getOwnedVersion(db: DB, versionId: string, userId: string) {
  const version = await db.dictionaryVersion.findUnique({
    where: { id: versionId },
    include: {
      dictionary: true,
      formatConfig: true,
    },
  })
  if (!version) throw notFound('DictionaryVersion', versionId)
  if (version.dictionary.userId !== userId) throw forbidden()
  return version
}

export async function getOwnedActiveVersionFileReference(db: DB, versionId: string, userId: string) {
  await assertVersionOwner(db, versionId, userId)
  return getActiveVersionFileReference(db, versionId)
}

export async function getOwnedActiveParseArtifactReference(db: DB, versionId: string, userId: string) {
  await assertVersionOwner(db, versionId, userId)
  return getActiveParseArtifactReference(db, versionId)
}

export async function assertComparisonOwner(db: DB, comparisonId: string, userId: string): Promise<void> {
  const comparison = await db.comparison.findUnique({
    where: { id: comparisonId },
    select: { versionA: { select: { dictionary: { select: { userId: true } } } } },
  })
  if (!comparison) throw notFound('Comparison', comparisonId)
  if (comparison.versionA.dictionary.userId !== userId) throw forbidden()
}

export async function assertTaxonomySourceOwner(db: DB, sourceId: string, userId: string): Promise<void> {
  const source = await db.taxonomySource.findUnique({ where: { id: sourceId }, select: { userId: true } })
  if (!source) throw notFound('TaxonomySource', sourceId)
  if (source.userId !== userId) throw forbidden()
}
