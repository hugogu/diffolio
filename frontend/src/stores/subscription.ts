import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  getSubscription,
  getEnergyBalance,
  unlockWords,
  type SubscriptionState,
  type EnergyBalanceInfo,
  type UnlockResult,
} from '@/api/subscription'

export type { UnlockResult }

const LOW_ENERGY_THRESHOLD = 200

export const useSubscriptionStore = defineStore('subscription', () => {
  const subscriptionState = ref<SubscriptionState | null>(null)
  const energyBalance = ref<EnergyBalanceInfo | null>(null)
  const loading = ref(false)

  const isActive = computed(() => subscriptionState.value?.effectiveStatus === 'ACTIVE')
  const isGrace = computed(() => subscriptionState.value?.effectiveStatus === 'GRACE')
  const isFrozen = computed(() => energyBalance.value?.frozenPurchasedRemaining !== undefined
    ? energyBalance.value.frozenPurchasedRemaining > 0
    : false
  )
  const isWarningLevel = computed(() => {
    const total = energyBalance.value?.total ?? 0
    return total > 0 && total < LOW_ENERGY_THRESHOLD
  })
  const isZeroEnergy = computed(() => {
    const total = energyBalance.value?.total ?? 0
    return total === 0 && !isFrozen.value
  })
  const totalEnergy = computed(() => energyBalance.value?.total ?? 0)
  const showRenewalReminder = computed(() => subscriptionState.value?.showRenewalReminder ?? false)

  async function fetchSubscription(): Promise<void> {
    loading.value = true
    try {
      const state = await getSubscription()
      subscriptionState.value = state
      if (state.energyBalance) {
        energyBalance.value = state.energyBalance
      }
    } finally {
      loading.value = false
    }
  }

  async function fetchEnergyBalance(): Promise<void> {
    const balance = await getEnergyBalance()
    energyBalance.value = balance
    // Sync total into subscriptionState if it exists
    if (subscriptionState.value?.energyBalance) {
      subscriptionState.value.energyBalance = balance
    }
  }

  function applyBalanceFromResult(result: UnlockResult): void {
    // T050: Update balance immediately from unlock response to avoid extra fetch
    if (result.remainingBalance !== undefined && energyBalance.value) {
      energyBalance.value = { ...energyBalance.value, total: result.remainingBalance }
    }
  }

  async function unlockWord(
    dictionaryId: string,
    headword: string
  ): Promise<UnlockResult> {
    const result = await unlockWords(dictionaryId, { headwords: [headword] })
    applyBalanceFromResult(result)
    return result
  }

  async function unlockAllWords(dictionaryId: string): Promise<UnlockResult> {
    const result = await unlockWords(dictionaryId, { all: true })
    applyBalanceFromResult(result)
    await fetchEnergyBalance()
    return result
  }

  async function unlockHeadwords(dictionaryId: string, headwords: string[]): Promise<UnlockResult> {
    const result = await unlockWords(dictionaryId, { headwords })
    applyBalanceFromResult(result)
    return result
  }

  function invalidate(): void {
    subscriptionState.value = null
    energyBalance.value = null
  }

  return {
    subscriptionState,
    energyBalance,
    loading,
    isActive,
    isGrace,
    isFrozen,
    isWarningLevel,
    isZeroEnergy,
    totalEnergy,
    showRenewalReminder,
    fetchSubscription,
    fetchEnergyBalance,
    unlockWord,
    unlockAllWords,
    unlockHeadwords,
    invalidate,
  }
})
