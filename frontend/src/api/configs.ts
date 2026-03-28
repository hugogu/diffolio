import { apiFetch } from './client'

export interface SystemConfig {
  id: string
  name: string
  description?: string | null
  validationStatus: 'PENDING' | 'VALID' | 'INVALID'
  visibility: 'ALL_USERS' | 'SPECIFIC_USERS'
  createdAt: string
  updatedAt: string
}

export interface SystemConfigDetail extends SystemConfig {
  configJson: Record<string, unknown>
  validationReport?: { errors: string[]; warnings: string[] } | null
}

export interface UserConfig {
  id: string
  name: string
  description?: string | null
  validationStatus: 'PENDING' | 'VALID' | 'INVALID'
  clonedFromId?: string | null
  createdAt: string
  updatedAt: string
}

export interface UserConfigDetail extends UserConfig {
  configJson: Record<string, unknown>
  validationReport?: { errors: string[]; warnings: string[] } | null
}

export async function listSystemConfigs(search?: string): Promise<SystemConfig[]> {
  const params = new URLSearchParams()
  if (search) params.set('search', search)
  const qs = params.toString()
  return apiFetch<SystemConfig[]>(`/api/v1/system-configs${qs ? `?${qs}` : ''}`)
}

export async function getSystemConfig(id: string): Promise<SystemConfigDetail> {
  return apiFetch<SystemConfigDetail>(`/api/v1/system-configs/${id}`)
}

export async function listUserConfigs(search?: string): Promise<UserConfig[]> {
  const params = new URLSearchParams()
  if (search) params.set('search', search)
  const qs = params.toString()
  return apiFetch<UserConfig[]>(`/api/v1/configs${qs ? `?${qs}` : ''}`)
}

export async function getUserConfig(id: string): Promise<UserConfigDetail> {
  return apiFetch<UserConfigDetail>(`/api/v1/configs/${id}`)
}

export async function createUserConfig(payload: {
  name: string
  description?: string
  configJson: Record<string, unknown>
}): Promise<UserConfigDetail> {
  return apiFetch<UserConfigDetail>('/api/v1/configs', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function updateUserConfig(
  id: string,
  payload: { name?: string; description?: string; configJson?: Record<string, unknown> }
): Promise<UserConfigDetail> {
  return apiFetch<UserConfigDetail>(`/api/v1/configs/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export async function deleteUserConfig(id: string): Promise<void> {
  return apiFetch<void>(`/api/v1/configs/${id}`, { method: 'DELETE' })
}

export async function applyConfigToVersion(
  versionId: string,
  sourceType: 'SYSTEM' | 'USER',
  sourceId: string
): Promise<{ id: string; name: string; validationStatus: string }> {
  return apiFetch(`/api/v1/versions/${versionId}/config/apply`, {
    method: 'POST',
    body: JSON.stringify({ sourceType, sourceId }),
  })
}

// Admin API functions

export interface AdminSystemConfigsResult {
  total: number
  page: number
  pageSize: number
  data: (SystemConfig & { createdBy: { id: string; email: string } })[]
}

export async function listAdminSystemConfigs(params?: {
  page?: number
  pageSize?: number
  search?: string
}): Promise<AdminSystemConfigsResult> {
  const p = new URLSearchParams()
  if (params?.page) p.set('page', String(params.page))
  if (params?.pageSize) p.set('pageSize', String(params.pageSize))
  if (params?.search) p.set('search', params.search)
  const qs = p.toString()
  return apiFetch<AdminSystemConfigsResult>(`/api/v1/admin/system-configs${qs ? `?${qs}` : ''}`)
}

export async function createSystemConfig(payload: {
  name: string
  description?: string
  configJson: Record<string, unknown>
  visibility?: 'ALL_USERS' | 'SPECIFIC_USERS'
}): Promise<SystemConfigDetail> {
  return apiFetch<SystemConfigDetail>('/api/v1/admin/system-configs', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function getAdminSystemConfig(id: string): Promise<SystemConfigDetail & {
  allowedUsers: { user: { id: string; email: string } }[]
  createdBy: { id: string; email: string }
}> {
  return apiFetch(`/api/v1/admin/system-configs/${id}`)
}

export async function updateSystemConfig(
  id: string,
  payload: { name?: string; description?: string; configJson?: Record<string, unknown>; visibility?: 'ALL_USERS' | 'SPECIFIC_USERS' }
): Promise<SystemConfigDetail> {
  return apiFetch<SystemConfigDetail>(`/api/v1/admin/system-configs/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export async function deleteSystemConfig(id: string): Promise<void> {
  return apiFetch<void>(`/api/v1/admin/system-configs/${id}`, { method: 'DELETE' })
}

export async function updateSystemConfigVisibility(
  id: string,
  payload: { visibility: 'ALL_USERS' | 'SPECIFIC_USERS'; userIds?: string[] }
): Promise<SystemConfigDetail> {
  return apiFetch<SystemConfigDetail>(`/api/v1/admin/system-configs/${id}/visibility`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export async function cloneSystemConfig(id: string, nameOverride?: string): Promise<UserConfigDetail> {
  return apiFetch<UserConfigDetail>(`/api/v1/system-configs/${id}/clone`, {
    method: 'POST',
    body: JSON.stringify(nameOverride ? { name: nameOverride } : {}),
  })
}
