import { apiFetch } from './client'

export interface ParseArtifactItem {
  id: string
  status: 'BUILDING' | 'READY' | 'FAILED'
  totalEntries: number
  failedEntries: number
  parserFingerprint: string
  sharedFileAssetId: string
  sharedFileAsset: {
    id: string
    contentHash: string
    fileType: 'TXT' | 'DOC' | 'DOCX' | 'PDF' | 'MDX'
    fileSize: number
  }
  configVersionId: string
  configVersion: {
    id: string
    versionNumber: number
    profileId: string
    profileName: string
  }
  referenceCount: number
  userCount: number
  completedAt?: string | null
  createdAt: string
  updatedAt: string
}

export interface ListParseArtifactsResponse {
  total: number
  page: number
  pageSize: number
  totalPages: number
  data: ParseArtifactItem[]
}

export async function listAdminParseArtifacts(params: {
  page?: number
  pageSize?: number
  status?: string
  fileType?: string
  search?: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
} = {}): Promise<ListParseArtifactsResponse> {
  const qs = new URLSearchParams()
  if (params.page) qs.set('page', String(params.page))
  if (params.pageSize) qs.set('pageSize', String(params.pageSize))
  if (params.status) qs.set('status', params.status)
  if (params.fileType) qs.set('fileType', params.fileType)
  if (params.search) qs.set('search', params.search)
  if (params.sortBy) qs.set('sortBy', params.sortBy)
  if (params.sortOrder) qs.set('sortOrder', params.sortOrder)

  return apiFetch(`/api/v1/admin/parse-artifacts?${qs}`)
}
