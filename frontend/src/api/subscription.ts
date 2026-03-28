import { apiFetch } from './client'

export type SubscriptionTier = 'BASIC' | 'ADVANCED' | 'PREMIUM' | 'ELITE'
export type SubscriptionStatus = 'ACTIVE' | 'GRACE' | 'EXPIRED'
export type EffectiveStatus = 'NONE' | 'ACTIVE' | 'GRACE' | 'EXPIRED'

export interface SubscriptionInfo {
  tier: SubscriptionTier
  status: SubscriptionStatus
  expiresAt: string
  monthlyEnergyAlloc: number
  slotCount: number
  gracePeriodStartedAt: string | null
}

export interface EnergyBalanceInfo {
  monthlyRemaining: number
  purchasedRemaining: number
  frozenPurchasedRemaining: number
  total: number
  lifetimeUsed: number
  lastMonthlyResetAt: string | null
}

export interface SubscriptionState {
  hasSub: boolean
  effectiveStatus: EffectiveStatus
  subscription: SubscriptionInfo | null
  energyBalance: EnergyBalanceInfo | null
  daysUntilExpiry: number | null
  showRenewalReminder: boolean
}

export interface SubscriptionPlan {
  tier: SubscriptionTier
  monthlyEnergyAlloc: number
  slotCount: number
  priceYuan: number
  description: string
}

export interface PaymentQRConfig {
  id: string
  channel: string
  qrImagePath: string
  instructionText: string
}

export interface EnergyEvent {
  id: string
  eventType: string
  description: string
  delta: number
  createdAt: string
}

export interface UnlockResult {
  unlocked: number
  alreadyUnlocked: number
  energyDeducted: number
  remainingBalance: number
}

export async function getSubscription(): Promise<SubscriptionState> {
  return apiFetch<SubscriptionState>('/api/v1/subscription')
}

export async function listPlans(): Promise<{ plans: SubscriptionPlan[] }> {
  return apiFetch<{ plans: SubscriptionPlan[] }>('/api/v1/subscription/plans')
}

export async function getPaymentQR(): Promise<{ channels: PaymentQRConfig[] }> {
  return apiFetch<{ channels: PaymentQRConfig[] }>('/api/v1/subscription/payment-qr')
}

export async function getEnergyBalance(): Promise<EnergyBalanceInfo> {
  return apiFetch<EnergyBalanceInfo>('/api/v1/energy')
}

export async function listEnergyEvents(params: {
  from?: string
  to?: string
  page?: number
  pageSize?: number
} = {}): Promise<{ data: EnergyEvent[]; total: number; page: number; totalPages: number }> {
  const qs = new URLSearchParams()
  if (params.from) qs.set('from', params.from)
  if (params.to) qs.set('to', params.to)
  if (params.page) qs.set('page', String(params.page))
  if (params.pageSize) qs.set('pageSize', String(params.pageSize))
  return apiFetch(`/api/v1/energy/events?${qs}`)
}

export async function unlockWords(
  dictionaryId: string,
  payload: { headwords: string[] } | { all: true }
): Promise<UnlockResult> {
  return apiFetch<UnlockResult>(`/api/v1/dictionaries/${dictionaryId}/unlock`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function getDictionaryUnlockStats(
  dictionaryId: string
): Promise<{ totalHeadwords: number; unlockedCount: number; lockedCount: number }> {
  return apiFetch(`/api/v1/dictionaries/${dictionaryId}/unlock-stats`)
}

export async function getWordUnlockState(
  dictionaryId: string,
  headword: string
): Promise<{ unlocked: boolean; unlockedAt: string | null }> {
  return apiFetch(`/api/v1/dictionaries/${dictionaryId}/words/${encodeURIComponent(headword)}/unlock-state`)
}
