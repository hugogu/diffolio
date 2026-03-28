import { apiFetch } from './client'

export interface AdminUser {
  id: string
  email: string
  role: 'ADMIN' | 'REGULAR' | 'SUBSCRIBED'
  emailVerified: boolean
  exportEnabled: boolean
  maxVersions: number
  maxBooks: number
  canEditBuiltinConfigs: boolean
  watermarkEnabled: boolean
  disabled: boolean
  createdAt: string
  lastLoginAt: string | null
}

export interface AdminUserListResponse {
  data: AdminUser[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export async function listAdminUsers(params: {
  page?: number
  pageSize?: number
  role?: string
  search?: string
  emailVerified?: 'true' | 'false' | ''
  exportEnabled?: 'true' | 'false' | ''
  canEditBuiltinConfigs?: 'true' | 'false' | ''
  watermarkEnabled?: 'true' | 'false' | ''
} = {}): Promise<AdminUserListResponse> {
  const qs = new URLSearchParams()
  if (params.page) qs.set('page', String(params.page))
  if (params.pageSize) qs.set('pageSize', String(params.pageSize))
  if (params.role) qs.set('role', params.role)
  if (params.search) qs.set('search', params.search)
  if (params.emailVerified) qs.set('emailVerified', params.emailVerified)
  if (params.exportEnabled) qs.set('exportEnabled', params.exportEnabled)
  if (params.canEditBuiltinConfigs) qs.set('canEditBuiltinConfigs', params.canEditBuiltinConfigs)
  if (params.watermarkEnabled) qs.set('watermarkEnabled', params.watermarkEnabled)
  return apiFetch<AdminUserListResponse>(`/api/v1/admin/users?${qs}`)
}

export async function getAdminUser(id: string): Promise<AdminUser> {
  return apiFetch<AdminUser>(`/api/v1/admin/users/${id}`)
}

export async function updateAdminUser(id: string, data: Partial<{
  role: string
  emailVerified: boolean
  exportEnabled: boolean
  maxVersions: number
  maxBooks: number
  canEditBuiltinConfigs: boolean
  watermarkEnabled: boolean
  disabled: boolean
}>): Promise<AdminUser> {
  return apiFetch<AdminUser>(`/api/v1/admin/users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export async function adminResetPassword(id: string): Promise<{ message: string }> {
  return apiFetch<{ message: string }>(`/api/v1/admin/users/${id}/reset-password`, {
    method: 'POST',
    body: '{}',
  })
}

export async function resendVerificationAdmin(id: string): Promise<{ message: string }> {
  return apiFetch<{ message: string }>(`/api/v1/admin/users/${id}/resend-verification`, {
    method: 'POST',
    body: '{}',
  })
}

export async function lookupWatermark(text: string): Promise<{ users: AdminUser[] }> {
  return apiFetch<{ users: AdminUser[] }>('/api/v1/admin/watermark/lookup', {
    method: 'POST',
    body: JSON.stringify({ text }),
  })
}

export interface AdminSubscriptionDetail {
  user: { id: string; email: string }
  subscription: {
    tier: string
    status: string
    expiresAt: string
    monthlyEnergyAlloc: number
    slotCount: number
    gracePeriodStartedAt: string | null
  } | null
  energyBalance: {
    monthlyRemaining: number
    purchasedRemaining: number
    frozenPurchasedRemaining: number
    lifetimeUsed: number
  } | null
}

export interface AdminSubscriptionPlan {
  tier: string
  monthlyEnergyAlloc: number
  slotCount: number
  priceYuan: number
  description: string
  isActive: boolean
  updatedAt: string
}

export async function adminGetUserSubscription(userId: string): Promise<AdminSubscriptionDetail> {
  return apiFetch<AdminSubscriptionDetail>(`/api/v1/admin/users/${userId}/subscription`)
}

export async function adminUpdateUserSubscription(
  userId: string,
  data: { tier: string; expiresAt: string; status?: string }
): Promise<AdminSubscriptionDetail> {
  return apiFetch<AdminSubscriptionDetail>(`/api/v1/admin/users/${userId}/subscription`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export async function adminCreditEnergy(
  userId: string,
  amount: number,
  note?: string
): Promise<{ userId: string; credited: number; energyBalance: object }> {
  return apiFetch(`/api/v1/admin/users/${userId}/energy/credit`, {
    method: 'POST',
    body: JSON.stringify({ amount, note }),
  })
}

export async function adminSlotDowngrade(
  userId: string,
  data: { keepDictionaryIds: string[]; newSlotCount: number; tier: string; expiresAt: string }
): Promise<AdminSubscriptionDetail> {
  return apiFetch<AdminSubscriptionDetail>(`/api/v1/admin/users/${userId}/subscription/slot-downgrade`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function adminCancelSubscription(userId: string): Promise<{ userId: string; cancelled: boolean }> {
  return apiFetch(`/api/v1/admin/users/${userId}/subscription`, { method: 'DELETE' })
}

export async function adminListSubscriptionPlans(): Promise<{ plans: AdminSubscriptionPlan[] }> {
  return apiFetch<{ plans: AdminSubscriptionPlan[] }>('/api/v1/admin/subscription-plans')
}

export async function adminUpdateSubscriptionPlan(
  tier: string,
  data: Partial<{ priceYuan: number; monthlyEnergyAlloc: number; slotCount: number; description: string; isActive: boolean }>
): Promise<AdminSubscriptionPlan> {
  return apiFetch<AdminSubscriptionPlan>(`/api/v1/admin/subscription-plans/${tier}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export async function adminCreateSubscriptionPlan(
  data: { tier: string; priceYuan: number; monthlyEnergyAlloc: number; slotCount: number; description?: string }
): Promise<AdminSubscriptionPlan> {
  return apiFetch<AdminSubscriptionPlan>('/api/v1/admin/subscription-plans', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}
