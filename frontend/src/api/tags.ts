import { apiFetch } from './client'

export interface TagSummary {
  id: string
  name: string
}

export interface TagListItem extends TagSummary {
  normalizedName: string
  usageCount: number
}

export interface TagListResult {
  items: TagListItem[]
}

export interface EntryTagMutationResult {
  entryId: string
  tags: TagSummary[]
}

export interface AlignmentTagMutationResult {
  alignmentId: string
  appliedEntryIds: string[]
  tags: TagSummary[]
}

export async function listTags(params: { q?: string; limit?: number } = {}): Promise<TagListResult> {
  const query = new URLSearchParams()
  if (params.q) query.set('q', params.q)
  if (params.limit) query.set('limit', String(params.limit))
  const qs = query.toString()
  return apiFetch<TagListResult>(`/api/v1/tags${qs ? `?${qs}` : ''}`)
}

export async function renameTag(tagId: string, name: string): Promise<TagListItem> {
  return apiFetch<TagListItem>(`/api/v1/tags/${tagId}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  })
}

export async function addEntryTag(entryId: string, payload: { tagId?: string; name?: string }): Promise<EntryTagMutationResult> {
  return apiFetch<EntryTagMutationResult>(`/api/v1/entries/${entryId}/tags`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function removeEntryTag(entryId: string, tagId: string): Promise<EntryTagMutationResult> {
  return apiFetch<EntryTagMutationResult>(`/api/v1/entries/${entryId}/tags/${tagId}`, {
    method: 'DELETE',
  })
}

export async function addAlignmentTag(
  comparisonId: string,
  alignmentId: string,
  payload: { tagId?: string; name?: string }
): Promise<AlignmentTagMutationResult> {
  return apiFetch<AlignmentTagMutationResult>(`/api/v1/comparisons/${comparisonId}/alignments/${alignmentId}/tags`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function removeAlignmentTag(
  comparisonId: string,
  alignmentId: string,
  tagId: string
): Promise<AlignmentTagMutationResult> {
  return apiFetch<AlignmentTagMutationResult>(`/api/v1/comparisons/${comparisonId}/alignments/${alignmentId}/tags/${tagId}`, {
    method: 'DELETE',
  })
}
