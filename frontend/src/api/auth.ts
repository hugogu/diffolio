import { apiFetch } from './client'

export interface UserInfo {
  id: string
  email: string
  role: 'ADMIN' | 'REGULAR' | 'SUBSCRIBED'
  exportEnabled: boolean
  maxVersions: number
  maxBooks: number
  canEditBuiltinConfigs: boolean
  watermarkEnabled: boolean
}

export async function login(email: string, password: string): Promise<UserInfo> {
  return apiFetch<UserInfo>('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

export async function register(email: string, password: string, agreedToTerms: boolean): Promise<{ message: string; emailSent: boolean }> {
  return apiFetch<{ message: string; emailSent: boolean }>('/api/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, agreedToTerms }),
  })
}

export async function resendVerification(email: string): Promise<void> {
  return apiFetch<void>('/api/v1/auth/resend-verification', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}

export async function logout(): Promise<void> {
  return apiFetch<void>('/api/v1/auth/logout', { method: 'POST', body: '{}' })
}

export async function getMe(): Promise<UserInfo> {
  return apiFetch<UserInfo>('/api/v1/auth/me')
}

export interface UserStats {
  bookCount: number
  maxBooks: number
  versionCount: number
  maxVersions: number
  wordUnlockCount: number
  entryCount: number
  alignmentCount: number
  lifetimeEnergyUsed: number
  currentEnergyBalance: number
}

export async function getUserStats(): Promise<UserStats> {
  return apiFetch<UserStats>('/api/v1/user/stats')
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  return apiFetch<void>('/api/v1/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  })
}
