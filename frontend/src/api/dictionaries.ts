import { apiFetch } from './client'

export interface Dictionary {
  id: string
  name: string
  publisher: string
  language: string
  encodingScheme: string
  description?: string | null
  createdAt: string
  updatedAt: string
  versionCount?: number
}

export interface DictionaryVersion {
  id: string
  dictionaryId: string
  label: string
  publishedYear?: number | null
  notes?: string | null
  createdAt: string
  updatedAt: string
  entryCount?: number | null
  formatConfig?: {
    id: string
    name: string
    validationStatus: 'PENDING' | 'VALID' | 'INVALID'
  } | null
}

export interface PaginatedDictionaries {
  items: Dictionary[]
  nextCursor: string | null
  hasMore: boolean
}

export async function getDictionaries(cursor?: string, limit = 20): Promise<PaginatedDictionaries> {
  const params = new URLSearchParams({ limit: String(limit) })
  if (cursor) params.set('cursor', cursor)
  return apiFetch<PaginatedDictionaries>(`/api/v1/dictionaries?${params}`)
}

export async function getDictionary(id: string): Promise<Dictionary & { versions: DictionaryVersion[] }> {
  return apiFetch(`/api/v1/dictionaries/${id}`)
}

export async function createDictionary(data: {
  name: string
  publisher?: string
  language?: string
  description?: string
}): Promise<Dictionary> {
  return apiFetch<Dictionary>('/api/v1/dictionaries', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateDictionary(id: string, data: Partial<Dictionary>): Promise<Dictionary> {
  return apiFetch<Dictionary>(`/api/v1/dictionaries/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export async function getVersions(dictionaryId: string): Promise<DictionaryVersion[]> {
  return apiFetch<DictionaryVersion[]>(`/api/v1/dictionaries/${dictionaryId}/versions`)
}

export async function getVersion(versionId: string): Promise<DictionaryVersion & {
  dictionary: Dictionary
  formatConfig: Record<string, unknown> | null
  parseTasks: Record<string, unknown>[]
}> {
  return apiFetch(`/api/v1/versions/${versionId}`)
}

export async function createVersion(
  dictionaryId: string,
  data: { label: string; publishedYear?: number; notes?: string }
): Promise<DictionaryVersion> {
  return apiFetch<DictionaryVersion>(`/api/v1/dictionaries/${dictionaryId}/versions`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function uploadConfig(versionId: string, config: Record<string, unknown>): Promise<Record<string, unknown>> {
  return apiFetch(`/api/v1/versions/${versionId}/config`, {
    method: 'POST',
    body: JSON.stringify(config),
  })
}

export interface SampleConfig {
  filename: string
  name: string
  config: Record<string, unknown>
}

export async function getSampleConfigs(): Promise<SampleConfig[]> {
  return apiFetch<SampleConfig[]>('/api/v1/format-configs/samples')
}

export async function reparseVersion(versionId: string): Promise<{ id: string; status: string }> {
  return apiFetch(`/api/v1/versions/${versionId}/reparse`, { method: 'POST', body: '{}' })
}

export async function deleteVersionEntries(versionId: string): Promise<void> {
  return apiFetch(`/api/v1/versions/${versionId}/entries`, { method: 'DELETE' })
}

export function versionFileDownloadUrl(versionId: string): string {
  return `/api/v1/versions/${versionId}/file`
}

export async function deleteVersionFile(versionId: string): Promise<void> {
  return apiFetch(`/api/v1/versions/${versionId}/file`, { method: 'DELETE' })
}
