import { apiFetch } from './client'
import type { TagSummary } from './tags'

export interface Comparison {
  id: string
  versionAId: string
  versionBId: string
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED'
  totalA?: number | null
  totalB?: number | null
  matched?: number | null
  addedInB?: number | null
  deletedFromA?: number | null
  definitionChanged?: number | null
  createdAt: string
  completedAt?: string | null
  versionA?: { id: string; label: string; dictionary: { id: string; name: string } } | null
  versionB?: { id: string; label: string; dictionary: { id: string; name: string } } | null
}

export interface ComparisonListItem {
  id: string
  versionAId: string
  versionBId: string
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED'
  totalA?: number | null
  totalB?: number | null
  matched?: number | null
  addedInB?: number | null
  deletedFromA?: number | null
  createdAt: string
  completedAt?: string | null
  versionA: { id: string; label: string; dictionary: { id: string; name: string } }
  versionB: { id: string; label: string; dictionary: { id: string; name: string } }
}

export async function listComparisons(): Promise<{ items: ComparisonListItem[] }> {
  return apiFetch('/api/v1/comparisons')
}

export interface EntryAlignment {
  id: string
  comparisonId: string
  changeType: 'MATCHED' | 'ADDED' | 'DELETED' | 'MATCHED_VARIANT'
  alignScore?: number | null
  tags: TagSummary[]
  entryA?: Record<string, unknown> | null
  entryB?: Record<string, unknown> | null
  senseDiffs?: Record<string, unknown>[]
  locked?: boolean
}

export interface PaginatedAlignments {
  items: EntryAlignment[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export async function createComparison(versionAId: string, versionBId: string): Promise<Comparison> {
  return apiFetch<Comparison>('/api/v1/comparisons', {
    method: 'POST',
    body: JSON.stringify({ versionAId, versionBId }),
  })
}

export async function getComparison(id: string): Promise<Comparison> {
  return apiFetch<Comparison>(`/api/v1/comparisons/${id}`)
}

export async function getAlignments(
  id: string,
  options: {
    page?: number
    pageSize?: number
    changeTypes?: string[]
    senseChangeType?: string
    headword?: string
    q?: string
    taxonomySourceId?: string
    taxonomyNodeId?: string
    tagIds?: string[]
  } = {}
): Promise<PaginatedAlignments> {
  const params = new URLSearchParams()
  if (options.page) params.set('page', String(options.page))
  if (options.pageSize) params.set('pageSize', String(options.pageSize))
  if (options.changeTypes?.length) params.set('changeType', options.changeTypes.join(','))
  if (options.senseChangeType) params.set('senseChangeType', options.senseChangeType)
  if (options.headword) params.set('headword', options.headword)
  if (options.q) params.set('q', options.q)
  if (options.taxonomySourceId) params.set('taxonomySourceId', options.taxonomySourceId)
  if (options.taxonomyNodeId) params.set('taxonomyNodeId', options.taxonomyNodeId)
  if (options.tagIds?.length) params.set('tagIds', options.tagIds.join(','))
  return apiFetch<PaginatedAlignments>(`/api/v1/comparisons/${id}/alignments?${params}`)
}

export interface ExportJob {
  id: string
  comparisonId: string
  status: string
  downloadUrl: string | null
  expiresAt: string | null
}

export async function createExport(
  comparisonId: string,
  senseChangeTypes?: string[],
  orderBy?: 'alphabetical' | 'taxonomy',
  taxonomySourceId?: string
): Promise<Record<string, unknown>> {
  return apiFetch(`/api/v1/comparisons/${comparisonId}/exports`, {
    method: 'POST',
    body: JSON.stringify({ senseChangeTypes, orderBy, taxonomySourceId }),
  })
}

export async function getLatestExport(comparisonId: string): Promise<ExportJob | null> {
  return apiFetch(`/api/v1/comparisons/${comparisonId}/exports/latest`)
}
