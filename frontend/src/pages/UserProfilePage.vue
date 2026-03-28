<template>
  <div v-loading="loading" class="profile-page">
    <div class="page-header">
      <div class="page-header-row">
        <h2>{{ $t('profile.title') }}</h2>
        <el-button size="small" @click="$router.push('/change-password')">{{ $t('profile.changePassword') }}</el-button>
      </div>
      <p class="user-email-line">
        <el-icon><User /></el-icon>
        {{ authStore.user?.email }}
        <el-tag size="small" :type="authStore.user?.role === 'ADMIN' ? 'danger' : 'info'">
          {{ authStore.user?.role }}
        </el-tag>
      </p>
    </div>

    <!-- 我的书桌：Active subscription -->
    <el-card v-if="state?.hasSub && state.subscription" class="desk-card">
      <template #header>
        <div class="card-header-row">
          <span class="card-title">{{ $t('profile.myDesk') }}</span>
          <el-tag :type="statusTagType" size="small">{{ statusLabel }}</el-tag>
        </div>
      </template>
      <el-descriptions :column="3" border size="small">
        <el-descriptions-item :label="$t('profile.donationPlan')">
          {{ tierDisplayLabel(state.subscription.tier) }}
        </el-descriptions-item>
        <el-descriptions-item :label="$t('profile.bookSlots')">
          {{ state.subscription.slotCount }} {{ $t('common.unit') || '' }}
        </el-descriptions-item>
        <el-descriptions-item :label="$t('profile.monthlyEnergy')">
          {{ state.subscription.monthlyEnergyAlloc.toLocaleString() }} {{ $t('common.words') || '词' }}
        </el-descriptions-item>
        <el-descriptions-item :label="$t('profile.expiresAt')">
          <span :class="{ 'expiry-warning': daysLeft !== null && daysLeft <= 6 }">
            {{ formatDate(state.subscription.expiresAt) }}
            <span v-if="daysLeft !== null && daysLeft >= 0">（{{ $t('profile.daysLeft', { days: daysLeft }) }}）</span>
          </span>
        </el-descriptions-item>
        <el-descriptions-item v-if="state.energyBalance" :label="$t('profile.monthlyRemaining')">
          {{ state.energyBalance.monthlyRemaining.toLocaleString() }} {{ $t('common.words') || '词' }}
        </el-descriptions-item>
        <el-descriptions-item v-if="state.energyBalance" :label="$t('profile.purchasedRemaining')">
          {{ state.energyBalance.purchasedRemaining.toLocaleString() }} {{ $t('common.words') || '词' }}
        </el-descriptions-item>
        <el-descriptions-item v-if="state.energyBalance" :label="$t('profile.currentEnergy')">
          <span :class="{ 'low-energy': subscriptionStore.isWarningLevel, 'frozen-energy': subscriptionStore.isFrozen }">
            {{ state.energyBalance.total.toLocaleString() }} {{ $t('common.words') || '词' }}
            <el-tag v-if="subscriptionStore.isFrozen" type="info" size="small" style="margin-left: 4px">{{ $t('profile.frozen') }}</el-tag>
          </span>
        </el-descriptions-item>
        <el-descriptions-item v-if="state.effectiveStatus === 'GRACE'" :label="$t('profile.gracePeriod')">
          <span class="grace-days">{{ $t('profile.graceDaysLeft', { days: graceRemaining }) }}</span>
        </el-descriptions-item>
      </el-descriptions>
    </el-card>

    <!-- 我的书桌：Free tier -->
    <el-card v-else-if="!loading" class="desk-card">
      <template #header>
        <div class="card-header-row">
          <span class="card-title">{{ $t('profile.myDesk') }}</span>
          <el-tag type="info" size="small">{{ $t('profile.freeTier') }}</el-tag>
        </div>
      </template>
      <el-descriptions :column="3" border size="small">
        <el-descriptions-item :label="$t('profile.bookSlots')">1 {{ $t('common.unit') || '' }}</el-descriptions-item>
        <el-descriptions-item :label="$t('profile.trialEnergy')">100 {{ $t('common.words') || '词' }}（{{ $t('common.lifetime') || '终身' }}）</el-descriptions-item>
        <el-descriptions-item v-if="state?.energyBalance" :label="$t('profile.lifetimeUsed')">
          {{ state.energyBalance.lifetimeUsed }} / 100 {{ $t('common.words') || '词' }}
        </el-descriptions-item>
      </el-descriptions>
      <el-button
        type="primary"
        size="small"
        style="margin-top: 12px"
        @click="$router.push('/subscription')"
      >{{ $t('profile.donateToUnlock') }}</el-button>
    </el-card>

    <!-- 捐赠入口 -->
    <el-card v-if="!loading" class="donate-card" style="margin-top: 16px">
      <template #header>
        <span class="card-title">{{ $t('profile.supportPlatform') }}</span>
      </template>
      <div class="donate-body">
        <div class="donate-text">
          <p>{{ $t('profile.donateDesc') }}</p>
          <el-button type="primary" size="small" @click="$router.push('/subscription')">
            {{ $t('profile.viewPlans') }}
          </el-button>
        </div>
        <div v-if="wechatPayImg || alipayImg" class="donate-qr-row">
          <div v-if="wechatPayImg" class="donate-qr-wrap">
            <img :src="wechatPayImg" :alt="$t('profile.wechatPay')" class="donate-qr" />
            <span class="donate-qr-label">{{ $t('profile.wechatPay') }}</span>
          </div>
          <div v-if="alipayImg" class="donate-qr-wrap">
            <img :src="alipayImg" :alt="$t('profile.alipay')" class="donate-qr" />
            <span class="donate-qr-label">{{ $t('profile.alipay') }}</span>
          </div>
        </div>
      </div>
      <p class="donate-note">{{ $t('profile.donateNote') }}</p>
    </el-card>

    <el-row v-if="stats" :gutter="16" style="margin-top: 16px">
      <!-- Books & Versions usage -->
      <el-col :span="12">
        <el-card class="stat-card">
          <template #header>
            <span class="card-title"><el-icon><Files /></el-icon> {{ $t('profile.bookshelfUsage') }}</span>
          </template>
          <div class="stat-rows">
            <div class="stat-row">
              <span class="stat-label">{{ $t('profile.bookSlots') }}</span>
              <div class="stat-value usage-bar-wrap">
                <el-progress
                  :percentage="slotPercent"
                  :color="slotPercent >= 100 ? '#f56c6c' : '#409eff'"
                  :stroke-width="10"
                  style="flex: 1"
                />
                <span class="usage-text">{{ stats.bookCount }} / {{ stats.maxBooks }}</span>
              </div>
            </div>
            <el-divider style="margin: 8px 0" />
            <div class="stat-row">
              <span class="stat-label">{{ $t('common.versions') || '辞书版本数' }}</span>
              <div class="stat-value usage-bar-wrap">
                <el-progress
                  :percentage="versionPercent"
                  :color="versionPercent >= 100 ? '#f56c6c' : '#409eff'"
                  :stroke-width="10"
                  style="flex: 1"
                />
                <span class="usage-text">{{ stats.versionCount }} / {{ stats.maxVersions }}</span>
              </div>
            </div>
          </div>
        </el-card>
      </el-col>

      <!-- Energy summary -->
      <el-col :span="12">
        <el-card class="stat-card">
          <template #header>
            <span class="card-title"><el-icon><Lightning /></el-icon> {{ $t('profile.energyOverview') }}</span>
          </template>
          <div class="stat-rows">
            <div class="stat-row">
              <span class="stat-label">{{ $t('profile.currentBalance') }}</span>
              <span class="stat-value highlight">{{ stats.currentEnergyBalance.toLocaleString() }} {{ $t('common.words') || '词' }}</span>
            </div>
            <el-divider style="margin: 8px 0" />
            <div class="stat-row">
              <span class="stat-label">{{ $t('profile.lifetimeUsed') }}</span>
              <span class="stat-value">{{ stats.lifetimeEnergyUsed.toLocaleString() }} {{ $t('common.words') || '词' }}</span>
            </div>
          </div>
        </el-card>
      </el-col>

      <!-- Entry stats -->
      <el-col :span="24" style="margin-top: 16px">
        <el-card class="stat-card">
          <template #header>
            <span class="card-title"><el-icon><DataAnalysis /></el-icon> {{ $t('profile.entryStats') }}</span>
          </template>
          <el-row :gutter="0">
            <el-col :span="8">
              <div class="big-stat">
                <span class="big-number">{{ stats.entryCount.toLocaleString() }}</span>
                <span class="big-label">{{ $t('profile.totalParsedEntries') }}</span>
              </div>
            </el-col>
            <el-col :span="8">
              <div class="big-stat">
                <span class="big-number">{{ stats.wordUnlockCount.toLocaleString() }}</span>
                <span class="big-label">{{ $t('profile.unlockedEntries') }}</span>
              </div>
            </el-col>
            <el-col :span="8">
              <div class="big-stat">
                <span class="big-number">{{ stats.alignmentCount.toLocaleString() }}</span>
                <span class="big-label">{{ $t('profile.comparedEntries') }}</span>
              </div>
            </el-col>
          </el-row>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useSubscriptionStore } from '@/stores/subscription'
import { getUserStats, type UserStats } from '@/api/auth'
import { User, Lightning, Files, DataAnalysis } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'

// Payment QR images - these are hosted-version specific and loaded dynamically
const wechatPayImg = ref('')
const alipayImg = ref('')

// Try to load payment images (will fail gracefully in open-source version)
async function loadPaymentImages() {
  try {
    const wechatModule = await import('@/assets/img/WeChatPay.jpg')
    wechatPayImg.value = wechatModule.default
  } catch {
    // Image not available in open-source version
    wechatPayImg.value = ''
  }
  try {
    const alipayModule = await import('@/assets/img/AliPay.jpg')
    alipayImg.value = alipayModule.default
  } catch {
    // Image not available in open-source version
    alipayImg.value = ''
  }
}

const { t } = useI18n()
const authStore = useAuthStore()
const subscriptionStore = useSubscriptionStore()

const loading = ref(true)
const stats = ref<UserStats | null>(null)
const state = computed(() => subscriptionStore.subscriptionState)

function tierDisplayLabel(tier: string): string {
  const map: Record<string, string> = {
    BASIC: t('profile.tier.BASIC'),
    ADVANCED: t('profile.tier.ADVANCED'),
    PREMIUM: t('profile.tier.PREMIUM'),
    ELITE: t('profile.tier.ELITE'),
  }
  return map[tier] ?? tier
}

const statusTagType = computed(() => {
  const s = state.value?.effectiveStatus
  if (s === 'ACTIVE') return 'success'
  if (s === 'GRACE') return 'warning'
  return 'danger'
})

const statusLabel = computed(() => {
  const s = state.value?.effectiveStatus
  if (s === 'ACTIVE') return t('profile.status.active')
  if (s === 'GRACE') return t('profile.status.grace')
  return t('profile.status.expired')
})

const daysLeft = computed(() => state.value?.daysUntilExpiry ?? null)

const graceRemaining = computed(() => {
  const days = daysLeft.value ?? 0
  return Math.max(0, 30 + days)
})

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('zh-CN')
}

const slotPercent = computed(() => {
  if (!stats.value || stats.value.maxBooks === 0) return 0
  return Math.min(100, Math.round((stats.value.bookCount / stats.value.maxBooks) * 100))
})

const versionPercent = computed(() => {
  if (!stats.value || stats.value.maxVersions === 0) return 0
  return Math.min(100, Math.round((stats.value.versionCount / stats.value.maxVersions) * 100))
})

onMounted(async () => {
  try {
    const fetchSub = state.value === null
      ? subscriptionStore.fetchSubscription()
      : Promise.resolve()
    const [, s] = await Promise.all([fetchSub, getUserStats()])
    stats.value = s
    // Load payment images (will fail gracefully in open-source version)
    await loadPaymentImages()
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.profile-page {
  max-width: 900px;
}

.page-header {
  margin-bottom: 20px;
}

.page-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.page-header-row h2 {
  margin: 0;
  font-size: 20px;
}

.user-email-line {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--el-text-color-secondary);
  font-size: 14px;
  margin: 0;
}

.desk-card {
  margin-bottom: 0;
}

.card-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
}

.expiry-warning {
  color: var(--el-color-warning);
  font-weight: 600;
}

.low-energy { color: var(--el-color-warning); }
.frozen-energy { color: var(--el-color-info); }
.grace-days { color: var(--el-color-warning); font-weight: 600; }

.stat-rows {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stat-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 0;
}

.stat-label {
  width: 90px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  flex-shrink: 0;
}

.stat-value {
  font-size: 14px;
  font-weight: 500;
  flex: 1;
}

.stat-value.highlight {
  color: var(--el-color-primary);
  font-size: 16px;
  font-weight: 600;
}

.usage-bar-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
}

.usage-text {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  min-width: 48px;
  text-align: right;
}

.big-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px 8px;
  border-right: 1px solid var(--color-border);
  text-align: center;
}

.big-stat:last-child {
  border-right: none;
}

.big-number {
  font-size: 28px;
  font-weight: 700;
  color: var(--el-color-primary);
  line-height: 1.2;
}

.big-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
}

.donate-card {
  margin-bottom: 0;
}

.donate-body {
  display: flex;
  align-items: flex-start;
  gap: 24px;
}

.donate-text {
  flex: 1;
}

.donate-text p {
  font-size: 14px;
  color: var(--el-text-color-regular);
  line-height: 1.7;
  margin: 0 0 12px;
}

.donate-qr-row {
  display: flex;
  gap: 16px;
  flex-shrink: 0;
}

.donate-qr-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.donate-qr {
  width: 90px;
  height: 90px;
  object-fit: cover;
  border-radius: 6px;
  border: 1px solid var(--el-border-color);
}

.donate-qr-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.donate-note {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  margin: 10px 0 0;
}
</style>
