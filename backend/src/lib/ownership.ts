import { PrismaClient } from '@prisma/client'
import { forbidden, notFound } from './errors.js'

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
