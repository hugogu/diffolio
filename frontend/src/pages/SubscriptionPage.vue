<template>
  <div class="subscription-page">
    <div v-if="loading" class="loading-state">
      <el-skeleton :rows="6" animated />
    </div>

    <template v-else>
      <!-- Free-tier notice -->
      <el-alert
        v-if="!state?.hasSub"
        :title="$t('subscription.freeTierNotice')"
        type="info"
        :closable="false"
        show-icon
        style="margin-bottom: 24px"
      >
        <template #default>
          {{ $t('subscription.freeTierDesc') }}
        </template>
      </el-alert>

      <!-- Subscription tier cards -->
      <div class="tiers-section">
        <h2 class="section-title">{{ $t('subscription.donationPlans') }}</h2>
        <p class="section-subtitle">{{ $t('subscription.supportSubtitle') }}</p>

        <div v-if="plansLoading" class="plans-loading">
          <el-skeleton :rows="3" animated />
        </div>

        <div v-else class="tier-cards">
          <SubscriptionTierCard
            v-for="plan in plans"
            :key="plan.tier"
            :plan="plan"
            :is-current="state?.subscription?.tier === plan.tier && state.effectiveStatus === 'ACTIVE'"
            @subscribe="handleSubscribe(plan)"
          />
        </div>
      </div>

      <!-- Top-up energy packs (subscribers only, placed below tier cards) -->
      <el-card v-if="state?.hasSub" id="topup" class="topup-card">
        <template #header>
          <div class="card-header">
            <span>{{ $t('subscription.quickCharge') }}</span>
            <el-tag type="info" size="small">{{ $t('subscription.oneTimePurchase') }}</el-tag>
          </div>
        </template>
        <p class="topup-desc">{{ $t('subscription.topupDesc') }}</p>
        <div class="topup-packs">
          <div class="topup-pack" @click="handleTopup('quick')">
            <div class="pack-name">{{ $t('subscription.quickPack') }}</div>
            <div class="pack-energy">300 {{ $t('subscription.words') }}</div>
            <div class="pack-price">¥10</div>
            <el-button type="primary" size="small" :disabled="isFrozen">{{ $t('subscription.donateNow') }}</el-button>
            <p v-if="isFrozen" class="frozen-tip">{{ $t('subscription.frozenTip') }}</p>
          </div>
          <div class="topup-pack" @click="handleTopup('full')">
            <div class="pack-name">{{ $t('subscription.fullPack') }}</div>
            <div class="pack-energy">2,000 {{ $t('subscription.words') }}</div>
            <div class="pack-price">¥60</div>
            <el-button type="primary" size="small" :disabled="isFrozen">{{ $t('subscription.donateNow') }}</el-button>
            <p v-if="isFrozen" class="frozen-tip">{{ $t('subscription.frozenTipRestore') }}</p>
          </div>
        </div>
      </el-card>

      <!-- Donation disclaimer & cost explanation -->
      <el-card class="donation-info-card">
        <div class="donation-disclaimer">
          <p class="disclaimer-title">{{ $t('subscription.aboutDonation') }}</p>
          <p>
            {{ $t('subscription.donationDisclaimer') }}<br />
            {{ $t('subscription.donationReward') }}
          </p>
          <ul class="reward-list">
            <li>{{ $t('subscription.rewards.slots') }}</li>
            <li>{{ $t('subscription.rewards.permanent') }}</li>
            <li>{{ $t('subscription.rewards.group') }}</li>
          </ul>
        </div>
        <el-divider />
        <div class="platform-cost">
          <p class="disclaimer-title">{{ $t('subscription.platformCosts') }}</p>
          <p>
            {{ $t('subscription.costsDesc') }}
          </p>
          <ul class="cost-list">
            <li>{{ $t('subscription.costs.server') }}</li>
            <li>{{ $t('subscription.costs.domain') }}</li>
            <li>{{ $t('subscription.costs.ai') }}</li>
          </ul>
          <p class="cost-note">
            {{ $t('subscription.costsNote') }}
          </p>
        </div>
      </el-card>

      <!-- Payment QR modal -->
      <el-dialog
        v-model="qrDialogVisible"
        :title="qrDialogTitle"
        width="520px"
      >
        <div class="qr-content">
          <!-- User identifier reminder -->
          <div class="remark-reminder">
            <div class="remark-header">
              <el-icon class="remark-icon"><WarningFilled /></el-icon>
              <span class="remark-title">{{ $t('subscription.paymentModal.remarkRequired') }}</span>
            </div>
            <p class="remark-desc">
              {{ $t('subscription.paymentModal.remarkDesc') }}
            </p>
            <div class="remark-copy-row">
              <code class="remark-value">{{ userIdentifier }}</code>
              <el-button size="small" type="primary" plain @click="copyIdentifier">
                <el-icon><CopyDocument /></el-icon>
                {{ $t('subscription.paymentModal.copy') }}
              </el-button>
            </div>
          </div>

          <!-- Payment methods (only shown in hosted version where images exist) -->
          <div v-if="wechatPayImg || alipayImg" class="qr-methods">
            <div v-if="wechatPayImg" class="qr-method wechat-method">
              <div class="qr-method-header wechat-header">
                <span class="payment-brand">{{ $t('subscription.paymentModal.wechatPay') }}</span>
              </div>
              <div class="qr-image-wrap">
                <img :src="wechatPayImg" :alt="$t('subscription.paymentModal.wechatPay')" class="qr-image" />
              </div>
            </div>

            <div v-if="alipayImg" class="qr-method alipay-method">
              <div class="qr-method-header alipay-header">
                <span class="payment-brand">{{ $t('subscription.paymentModal.alipay') }}</span>
              </div>
              <div class="qr-image-wrap">
                <img :src="alipayImg" :alt="$t('subscription.paymentModal.alipay')" class="qr-image" />
              </div>
            </div>
          </div>

          <p class="manual-notice-text">
            {{ $t('subscription.paymentModal.manualNotice') }}
          </p>
        </div>
        <template #footer>
          <el-button type="primary" plain @click="qrDialogVisible = false">{{ $t('subscription.paymentModal.confirmBtn') }}</el-button>
        </template>
      </el-dialog>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { WarningFilled, CopyDocument } from '@element-plus/icons-vue'
import { useSubscriptionStore } from '@/stores/subscription'
import { useAuthStore } from '@/stores/auth'
import { listPlans, type SubscriptionPlan } from '@/api/subscription'
import SubscriptionTierCard from '@/components/subscription/SubscriptionTierCard.vue'
import { loadHostedImage } from '@/utils/hosted-assets'
import { useI18n } from 'vue-i18n'

// Payment QR images - these are hosted-version specific and loaded dynamically
const wechatPayImg = ref('')
const alipayImg = ref('')

// Try to load payment images (will fail gracefully in open-source version)
async function loadPaymentImages() {
  wechatPayImg.value = await loadHostedImage('WeChatPay.jpg')
  alipayImg.value = await loadHostedImage('AliPay.jpg')
}

const { t } = useI18n()
const subscriptionStore = useSubscriptionStore()
const authStore = useAuthStore()
const loading = ref(false)
const plansLoading = ref(false)
const plans = ref<SubscriptionPlan[]>([])
const qrDialogVisible = ref(false)
const selectedPlan = ref<SubscriptionPlan | null>(null)
const selectedTopupPack = ref<'quick' | 'full' | null>(null)

const state = computed(() => subscriptionStore.subscriptionState)
const isFrozen = computed(() => subscriptionStore.isFrozen)

const qrDialogTitle = computed(() => {
  if (selectedTopupPack.value === 'quick') return t('subscription.paymentModal.quickPackTitle')
  if (selectedTopupPack.value === 'full') return t('subscription.paymentModal.fullPackTitle')
  return t('subscription.paymentModal.title', { tier: tierLabel(selectedPlan.value?.tier || '') })
})

function tierLabel(tier: string): string {
  const map: Record<string, string> = {
    BASIC: t('subscription.tier.BASIC'),
    ADVANCED: t('subscription.tier.ADVANCED'),
    PREMIUM: t('subscription.tier.PREMIUM'),
    ELITE: t('subscription.tier.ELITE'),
  }
  return map[tier] ?? tier
}

function handleSubscribe(plan: SubscriptionPlan): void {
  selectedPlan.value = plan
  selectedTopupPack.value = null
  qrDialogVisible.value = true
}

function handleTopup(pack: 'quick' | 'full'): void {
  selectedTopupPack.value = pack
  selectedPlan.value = null
  qrDialogVisible.value = true
}

const userIdentifier = computed(() => authStore.user?.email || t('common.notLoggedIn'))

async function copyIdentifier() {
  try {
    await navigator.clipboard.writeText(userIdentifier.value)
    ElMessage.success(t('common.copied'))
  } catch {
    ElMessage.warning(t('common.copyFailed'))
  }
}

onMounted(async () => {
  loading.value = true
  plansLoading.value = true
  try {
    await subscriptionStore.fetchSubscription()
    const res = await listPlans()
    plans.value = res.plans
    // Load payment images (will fail gracefully in open-source version)
    await loadPaymentImages()
  } finally {
    loading.value = false
    plansLoading.value = false
  }
})
</script>

<style scoped>
.subscription-page {
  max-width: 900px;
  margin: 0 auto;
  padding: 24px;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 16px;
  font-weight: 600;
}

.section-title {
  font-size: 20px;
  font-weight: 700;
  margin-bottom: 4px;
}

.section-subtitle {
  color: var(--el-text-color-secondary);
  margin-bottom: 20px;
}

.tier-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 16px;
}

/* ─── Payment reminder box ─── */
.remark-reminder {
  background: #fffbeb;
  border: 1.5px solid #f59e0b;
  border-radius: 10px;
  padding: 14px 16px;
  margin-bottom: 20px;
}

.remark-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.remark-icon {
  color: #f59e0b;
  font-size: 16px;
}

.remark-title {
  font-size: 14px;
  font-weight: 700;
  color: #92400e;
}

.remark-desc {
  font-size: 13px;
  color: #78350f;
  margin: 0 0 10px;
  line-height: 1.6;
}

.remark-copy-row {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #fff;
  border: 1px solid #fcd34d;
  border-radius: 6px;
  padding: 8px 12px;
}

.remark-value {
  flex: 1;
  font-size: 14px;
  font-weight: 600;
  color: #1a1a1a;
  word-break: break-all;
  font-family: var(--app-font-family-mono);
}

/* ─── Payment QR methods ─── */
.qr-methods {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.qr-method {
  flex: 1;
  border-radius: 12px;
  overflow: hidden;
  border: 2px solid transparent;
}

.wechat-method {
  border-color: #07c160;
}

.alipay-method {
  border-color: #1677ff;
}

.qr-method-header {
  padding: 10px 0;
  text-align: center;
}

.wechat-header {
  background: #07c160;
}

.alipay-header {
  background: #1677ff;
}

.payment-brand {
  font-size: 14px;
  font-weight: 700;
  color: #fff;
  letter-spacing: 0.5px;
}

.qr-image-wrap {
  background: #fff;
  padding: 12px;
  display: flex;
  justify-content: center;
}

.qr-image {
  width: 100%;
  max-width: 160px;
  border-radius: 4px;
  display: block;
}

.manual-notice-text {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  text-align: center;
  margin: 0;
  padding: 4px 0;
}

.topup-card {
  margin-top: 24px;
  margin-bottom: 32px;
}

.topup-desc {
  color: var(--el-text-color-secondary);
  font-size: 13px;
  margin-bottom: 16px;
}

.topup-packs {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

.topup-pack {
  flex: 1;
  min-width: 180px;
  max-width: 260px;
  padding: 16px;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.topup-pack:hover {
  border-color: var(--el-color-primary);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.pack-name {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 6px;
}

.pack-energy {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  margin-bottom: 8px;
}

.pack-price {
  font-size: 22px;
  font-weight: 700;
  color: var(--el-color-primary);
  margin-bottom: 10px;
}

.frozen-tip {
  margin-top: 8px;
  font-size: 11px;
  color: var(--el-color-info);
}

.donation-info-card {
  margin-top: 24px;
  margin-bottom: 32px;
}

.donation-disclaimer,
.platform-cost {
  font-size: 13px;
  color: var(--el-text-color-regular);
  line-height: 1.8;
}

.disclaimer-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--el-text-color-primary);
  margin-bottom: 6px;
}

.reward-list,
.cost-list {
  margin: 6px 0 0 0;
  padding-left: 20px;
}

.reward-list li,
.cost-list li {
  margin-bottom: 4px;
}

.cost-note {
  margin-top: 10px;
  color: var(--el-text-color-secondary);
}
</style>
