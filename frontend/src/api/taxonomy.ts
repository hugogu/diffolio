import { apiFetch } from './client'

const BASE_URL = (import.meta as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL ?? ''

export interface TaxonomyFormatConfig {
  name: string
  level1Pattern: string
  level2Pattern: string
  level3Pattern: string
  level4Pattern: string
  headwordSeparator: string
  skipLinePatterns?: string[]
  tradSimpMap?: Record<string, string>
}

export interface TaxonomySourceSummary {
  id: string
  name: string
  description?: string | null
  status: 'PENDING' | 'IMPORTING' | 'ACTIVE' | 'FAILED'
  totalEntries?: number | null
  createdAt: string
  updatedAt: string
}

export interface TaxonomyImportTask {
  id: string
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED'
  processedLines: number
  failedLines: number
  startedAt?: string | null
  completedAt?: string | null
}

export interface TaxonomySource extends TaxonomySourceSummary {
  configJson: TaxonomyFormatConfig
  latestImportTask?: TaxonomyImportTask | null
}

export interface TaxonomyNodeTree {
  id: string
  level: 1 | 2 | 3 | 4
  label: string
  sequencePosition: number
  path: string
  parentId: string | null
  entryCount?: number
  children: TaxonomyNodeTree[]
}

export interface TaxonomyEntry {
  id: string
  headword: string
  normalizedHeadword: string
  sequencePosition: number
}

export async function listTaxonomySources(): Promise<{ data: TaxonomySourceSummary[] }> {
  return apiFetch('/api/v1/taxonomy-sources')
}

// Use raw fetch for multipart - don't set Content-Type (browser sets it with boundary)
export async function createTaxonomySource(formData: FormData): Promise<TaxonomySource> {
  const response = await fetch(`${BASE_URL}/api/v1/taxonomy-sources`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error((body as { message?: string }).message ?? `HTTP ${response.status}`)
  }
  return response.json()
}

export async function getTaxonomySource(id: string): Promise<TaxonomySource> {
  return apiFetch(`/api/v1/taxonomy-sources/${id}`)
}

export async function deleteTaxonomySource(id: string): Promise<void> {
  return apiFetch(`/api/v1/taxonomy-sources/${id}`, { method: 'DELETE' })
}

export async function reimportTaxonomySource(id: string): Promise<TaxonomyImportTask> {
  return apiFetch(`/api/v1/taxonomy-sources/${id}/reimport`, { method: 'POST' })
}

export async function getTaxonomyTree(sourceId: string): Promise<{ nodes: TaxonomyNodeTree[] }> {
  return apiFetch(`/api/v1/taxonomy-sources/${sourceId}/tree`)
}

export async function getTaxonomyNodeEntries(
  sourceId: string,
  nodeId: string,
  cursor?: string,
  limit = 100
): Promise<{ data: TaxonomyEntry[]; nextCursor: string | null }> {
  const params = new URLSearchParams({ limit: String(limit) })
  if (cursor) params.set('cursor', cursor)
  return apiFetch(`/api/v1/taxonomy-sources/${sourceId}/nodes/${nodeId}/entries?${params}`)
}

export async function updateTaxonomyNode(
  sourceId: string,
  nodeId: string,
  label: string
): Promise<{ id: string; label: string }> {
  return apiFetch(`/api/v1/taxonomy-sources/${sourceId}/nodes/${nodeId}`, {
    method: 'PATCH',
    body: JSON.stringify({ label }),
  })
}

export async function updateTaxonomyNodeEntries(
  sourceId: string,
  nodeId: string,
  headwords: string[]
): Promise<{ count: number }> {
  return apiFetch(`/api/v1/taxonomy-sources/${sourceId}/nodes/${nodeId}/entries`, {
    method: 'PUT',
    body: JSON.stringify({ headwords }),
  })
}
