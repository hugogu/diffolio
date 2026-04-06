import { apiFetch } from './client'

export interface FileItem {
  id: string
  originalFileName?: string | null
  contentHash: string
  fileSize: number
  fileType: 'TXT' | 'DOC' | 'DOCX' | 'PDF' | 'MDX'
  referenceCount: number
  historicalReferenceCount: number
  userCount: number
  isUnreferenced: boolean
  firstSeenAt: string
  lastReferencedAt: string
}

export interface UserFileStats {
  userId: string
  userEmail: string
  fileCount: number
  totalSize: number
}

export interface FileFilters {
  userId?: string
  fileType?: string
  search?: string
  unreferenced?: string
}

export interface SortParams {
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

export interface ListFilesParams extends FileFilters, SortParams {
  page?: number
  pageSize?: number
}

export interface ListFilesResponse {
  data: FileItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface UserOption {
  id: string
  email: string
}

// GET /api/v1/admin/files
export async function listFiles(params: ListFilesParams = {}): Promise<ListFilesResponse> {
  const qs = new URLSearchParams()
  if (params.page) qs.set('page', String(params.page))
  if (params.pageSize) qs.set('pageSize', String(params.pageSize))
  if (params.userId) qs.set('userId', params.userId)
  if (params.fileType) qs.set('fileType', params.fileType)
  if (params.search) qs.set('search', params.search)
  if (params.unreferenced) qs.set('unreferenced', params.unreferenced)
  if (params.sortBy) qs.set('sortBy', params.sortBy)
  if (params.sortOrder) qs.set('sortOrder', params.sortOrder)
  return apiFetch<ListFilesResponse>(`/api/v1/admin/files?${qs}`)
}

// GET /api/v1/admin/files/users
export async function getFileUsers(): Promise<{ data: UserOption[] }> {
  return apiFetch<{ data: UserOption[] }>('/api/v1/admin/files/users')
}

// GET /api/v1/admin/files/stats
export async function getFileStats(params: SortParams = { sortBy: 'totalSize', sortOrder: 'desc' }): Promise<{ data: UserFileStats[] }> {
  const qs = new URLSearchParams()
  if (params.sortBy) qs.set('sortBy', params.sortBy)
  if (params.sortOrder) qs.set('sortOrder', params.sortOrder)
  return apiFetch<{ data: UserFileStats[] }>(`/api/v1/admin/files/stats?${qs}`)
}

// DELETE /api/v1/admin/files
export async function deleteFiles(fileIds: string[]): Promise<{ deleted: number; fileIds: string[] }> {
  return apiFetch<{ deleted: number; fileIds: string[] }>('/api/v1/admin/files', {
    method: 'DELETE',
    body: JSON.stringify({ fileIds }),
  })
}

// GET /api/v1/admin/files/:id/download
export function getFileDownloadUrl(id: string): string {
  return `/api/v1/admin/files/${id}/download`
}
