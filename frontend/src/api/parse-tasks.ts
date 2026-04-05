import { apiFetch } from './client'

export interface ParseTask {
  id: string
  versionId: string
  status: 'PENDING' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'FAILED' | 'CANCELLED'
  fileType: 'TXT' | 'DOC' | 'DOCX' | 'PDF' | 'MDX'
  originalFileName: string
  sharedFileAssetId?: string | null
  contentHash?: string | null
  cacheHit?: boolean
  totalPages?: number | null
  totalEntries?: number | null
  processedPages: number
  processedEntries: number
  failedEntries: number
  checkpointOffset: number
  startedAt?: string | null
  completedAt?: string | null
  createdAt: string
  updatedAt: string
}

export interface ParseError {
  id: string
  taskId: string
  pageNumber?: number | null
  lineNumber?: number | null
  rawText: string
  fieldName: string
  errorCode: string
  errorDetail: string
  status: 'PENDING' | 'CORRECTED' | 'COMMITTED' | 'DISMISSED'
  correctedText?: string | null
  correctedAt?: string | null
  createdAt: string
}

export interface PaginatedErrors {
  items: ParseError[]
  nextCursor: string | null
  hasMore: boolean
}

export async function getParseTask(taskId: string): Promise<ParseTask> {
  return apiFetch<ParseTask>(`/api/v1/parse-tasks/${taskId}`)
}

export async function cancelParseTask(taskId: string): Promise<void> {
  return apiFetch<void>(`/api/v1/parse-tasks/${taskId}`, { method: 'DELETE' })
}

export async function getParseErrors(
  taskId: string,
  options: { cursor?: string; limit?: number; status?: string } = {}
): Promise<PaginatedErrors> {
  const params = new URLSearchParams()
  if (options.cursor) params.set('cursor', options.cursor)
  if (options.limit) params.set('limit', String(options.limit))
  if (options.status) params.set('status', options.status)
  return apiFetch<PaginatedErrors>(`/api/v1/parse-tasks/${taskId}/errors?${params}`)
}

export async function correctError(
  taskId: string,
  errorId: string,
  correctedText: string
): Promise<ParseError> {
  return apiFetch<ParseError>(`/api/v1/parse-tasks/${taskId}/errors/${errorId}`, {
    method: 'PATCH',
    body: JSON.stringify({ action: 'correct', correctedText }),
  })
}

export async function dismissError(taskId: string, errorId: string): Promise<ParseError> {
  return apiFetch<ParseError>(`/api/v1/parse-tasks/${taskId}/errors/${errorId}`, {
    method: 'PATCH',
    body: JSON.stringify({ action: 'dismiss' }),
  })
}

export async function retryError(taskId: string, errorId: string): Promise<void> {
  return apiFetch<void>(`/api/v1/parse-tasks/${taskId}/errors/${errorId}/retry`, {
    method: 'POST',
    body: '{}',
  })
}

export interface AdminParseError extends ParseError {
  task: {
    id: string
    originalFileName: string
    fileType: string
    version: {
      id: string
      label: string  // DictionaryVersion uses 'label', not 'name'
      dictionary: {
        id: string
        name: string
        user?: { id: string; email: string } | null  // user is on Dictionary, not ParseTask
      }
    }
  }
}

export interface PaginatedAdminErrors {
  items: AdminParseError[]
  nextCursor: string | null
  hasMore: boolean
}

export async function getAdminParseErrors(
  options: { cursor?: string; limit?: number; status?: string; errorCode?: string } = {}
): Promise<PaginatedAdminErrors> {
  const params = new URLSearchParams()
  if (options.cursor) params.set('cursor', options.cursor)
  if (options.limit) params.set('limit', String(options.limit))
  if (options.status) params.set('status', options.status)
  if (options.errorCode) params.set('errorCode', options.errorCode)
  return apiFetch<PaginatedAdminErrors>(`/api/v1/admin/parse-errors?${params}`)
}

export async function commitError(taskId: string, errorId: string): Promise<ParseError> {
  return apiFetch<ParseError>(`/api/v1/parse-tasks/${taskId}/errors/${errorId}`, {
    method: 'PATCH',
    body: JSON.stringify({ action: 'commit' }),
  })
}
