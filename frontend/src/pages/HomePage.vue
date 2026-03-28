<template>
  <div class="home-page">
    <!-- Welcome banner -->
    <div class="welcome-banner">
      <div class="banner-text">
        <h1 class="banner-title">{{ $t('home.welcome') }}</h1>
        <p class="banner-desc">{{ $t('home.description') }}</p>
      </div>
      <!-- Free tier notice -->
      <el-tag v-if="!hasSub" type="info" size="large" class="tier-badge">{{ $t('subscription.freeTier') }}</el-tag>
      <el-tag v-else type="success" size="large" class="tier-badge">{{ tierName }}</el-tag>
    </div>

    <!-- Free tier limits notice -->
    <el-alert
      v-if="!hasSub"
      type="info"
      :closable="false"
      show-icon
      style="margin-bottom: 24px"
    >
      <template #title>{{ $t('subscription.limits.title') }}</template>
      <template #default>
        <ul class="limit-list">
          <li>{{ $t('subscription.limits.books', { count: 1 }) }}</li>
          <li>{{ $t('subscription.limits.words', { count: 100 }) }}</li>
          <li>{{ $t('subscription.limits.taxonomy') }}</li>
        </ul>
        <p style="margin: 8px 0 0">
          <i18n-t keypath="subscription.upgrade" tag="span">
            <template #link>
              <el-link type="primary" @click="$router.push('/subscription')">{{ $t('subscription.donateLink') }}</el-link>
            </template>
          </i18n-t>
        </p>
      </template>
    </el-alert>

    <!-- Workflow steps -->
    <div class="section-title">{{ $t('home.steps.title') }}</div>

    <div class="workflow">
      <!-- Step 1 -->
      <div class="workflow-step">
        <div class="step-number">1</div>
        <el-card class="step-card">
          <div class="step-header">
            <el-icon class="step-icon"><Setting /></el-icon>
            <span class="step-name">{{ $t('home.steps.config.title') }}</span>
          </div>
          <p class="step-desc">
            {{ $t('home.steps.config.desc') }}
          </p>
          <div class="step-tip">
            <el-icon><InfoFilled /></el-icon>
            {{ $t('home.steps.config.tip') }}
          </div>
          <el-button size="small" text type="primary" @click="$router.push('/admin/dictionaries')">
            {{ $t('home.steps.config.action') }}
          </el-button>
        </el-card>
      </div>

      <div class="workflow-arrow"><el-icon><ArrowRight /></el-icon></div>

      <!-- Step 2 -->
      <div class="workflow-step">
        <div class="step-number">2</div>
        <el-card class="step-card">
          <div class="step-header">
            <el-icon class="step-icon"><Upload /></el-icon>
            <span class="step-name">{{ $t('home.steps.upload.title') }}</span>
          </div>
          <p class="step-desc">
            {{ $t('home.steps.upload.desc') }}
          </p>
          <div class="step-tip">
            <el-icon><InfoFilled /></el-icon>
            {{ $t('home.steps.upload.tip') }}
          </div>
          <el-button size="small" text type="primary" @click="$router.push('/admin/dictionaries')">
            {{ $t('home.steps.upload.action') }}
          </el-button>
        </el-card>
      </div>

      <div class="workflow-arrow"><el-icon><ArrowRight /></el-icon></div>

      <!-- Step 3 -->
      <div class="workflow-step">
        <div class="step-number">3</div>
        <el-card class="step-card">
          <div class="step-header">
            <el-icon class="step-icon"><DataAnalysis /></el-icon>
            <span class="step-name">{{ $t('home.steps.compare.title') }}</span>
          </div>
          <p class="step-desc">
            {{ $t('home.steps.compare.desc') }}
          </p>
          <div class="step-tip">
            <el-icon><InfoFilled /></el-icon>
            {{ $t('home.steps.compare.tip') }}
          </div>
          <el-button size="small" text type="primary" @click="$router.push('/comparisons')">
            {{ $t('home.steps.compare.action') }}
          </el-button>
        </el-card>
      </div>
    </div>

    <!-- Taxonomy section -->
    <div class="section-title" style="margin-top: 32px">{{ $t('home.taxonomy.title') }}</div>

    <el-card class="taxonomy-card">
      <div class="taxonomy-inner">
        <div class="taxonomy-left">
          <el-icon class="taxonomy-icon"><Grid /></el-icon>
        </div>
        <div class="taxonomy-right">
          <p class="taxonomy-desc">
            {{ $t('home.taxonomy.desc1') }}
          </p>
          <p class="taxonomy-desc">
            {{ $t('home.taxonomy.desc2') }}
          </p>
          <el-button size="small" text type="primary" @click="$router.push('/admin/taxonomy')">
            {{ $t('home.taxonomy.action') }}
          </el-button>
        </div>
      </div>
    </el-card>

    <!-- Donation CTA -->
    <el-card v-if="!hasSub" class="donation-cta">
      <div class="cta-inner">
        <div class="cta-text">
          <div class="cta-title">{{ $t('home.donation.title') }}</div>
          <p class="cta-desc">
            {{ $t('home.donation.desc') }}
          </p>
          <div class="tier-compare">
            <div class="tier-item">
              <span class="tier-label">{{ $t('subscription.freeTier') }}</span>
              <ul class="tier-perks">
                <li>{{ $t('home.donation.trialBooks') }}</li>
                <li>{{ $t('home.donation.trialWords') }}</li>
              </ul>
            </div>
            <el-icon class="cta-arrow"><ArrowRight /></el-icon>
            <div class="tier-item highlight-tier">
              <span class="tier-label">{{ $t('home.donation.sponsorLabel') }}</span>
              <ul class="tier-perks">
                <li>{{ $t('home.donation.sponsorBooks') }}</li>
                <li>{{ $t('home.donation.sponsorWords') }}</li>
                <li>{{ $t('home.donation.sponsorGroup') }}</li>
              </ul>
            </div>
          </div>
        </div>
        <el-button type="primary" @click="$router.push('/subscription')">
          {{ $t('home.donation.ctaButton') }}
        </el-button>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { Setting, Upload, DataAnalysis, Grid, ArrowRight, InfoFilled } from '@element-plus/icons-vue'
import { useSubscriptionStore } from '@/stores/subscription'

const { t } = useI18n()
const subscriptionStore = useSubscriptionStore()

const hasSub = computed(() => subscriptionStore.subscriptionState?.hasSub ?? false)

const TIER_NAMES: Record<string, string> = {
  BASIC: 'subscription.tier.BASIC',
  ADVANCED: 'subscription.tier.ADVANCED',
  PREMIUM: 'subscription.tier.PREMIUM',
  ELITE: 'subscription.tier.ELITE',
}

const tierName = computed(() => {
  const tier = subscriptionStore.subscriptionState?.subscription?.tier
  return tier ? t(TIER_NAMES[tier] ?? tier) : ''
})

onMounted(() => {
  if (subscriptionStore.subscriptionState === null) {
    subscriptionStore.fetchSubscription().catch(() => {/* non-critical */})
  }
})
</script>

<style scoped>
.home-page {
  max-width: 860px;
  margin: 0 auto;
  padding: 24px;
}

/* Banner */
.welcome-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
}

.banner-title {
  font-size: 22px;
  font-weight: 700;
  margin: 0 0 4px;
}

.banner-desc {
  font-size: 14px;
  color: var(--el-text-color-secondary);
  margin: 0;
}

.tier-badge {
  flex-shrink: 0;
}

/* Limits */
.limit-list {
  margin: 4px 0 0;
  padding-left: 20px;
  line-height: 2;
}

/* Section title */
.section-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--el-text-color-primary);
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.section-title::before {
  content: '';
  display: inline-block;
  width: 4px;
  height: 16px;
  background: var(--el-color-primary);
  border-radius: 2px;
}

/* Workflow */
.workflow {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.workflow-step {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.step-number {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--el-color-primary);
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.step-card {
  width: 100%;
}

.step-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.step-icon {
  font-size: 18px;
  color: var(--el-color-primary);
}

.step-name {
  font-size: 15px;
  font-weight: 600;
}

.step-desc {
  font-size: 13px;
  color: var(--el-text-color-regular);
  line-height: 1.7;
  margin: 0 0 10px;
}

.step-tip {
  display: flex;
  align-items: flex-start;
  gap: 5px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color-light);
  border-radius: 6px;
  padding: 7px 10px;
  margin-bottom: 12px;
  line-height: 1.6;
}

.step-tip .el-icon {
  flex-shrink: 0;
  margin-top: 2px;
  color: var(--el-color-primary);
}

.workflow-arrow {
  font-size: 20px;
  color: var(--el-text-color-placeholder);
  padding-top: 52px;
  flex-shrink: 0;
}

/* Taxonomy */
.taxonomy-card {
  margin-bottom: 24px;
}

.taxonomy-inner {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}

.taxonomy-icon {
  font-size: 32px;
  color: var(--el-color-primary-light-3);
  flex-shrink: 0;
  margin-top: 2px;
}

.taxonomy-desc {
  font-size: 13px;
  color: var(--el-text-color-regular);
  line-height: 1.7;
  margin: 0 0 8px;
}

/* Donation CTA */
.donation-cta {
  margin-top: 8px;
  border: 2px solid var(--el-color-primary-light-5);
}

.cta-inner {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
}

.cta-title {
  font-size: 16px;
  font-weight: 700;
  margin-bottom: 8px;
}

.cta-desc {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  line-height: 1.7;
  margin: 0 0 16px;
}

.tier-compare {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.tier-item {
  min-width: 140px;
}

.tier-label {
  font-size: 13px;
  font-weight: 600;
  display: block;
  margin-bottom: 6px;
  color: var(--el-text-color-primary);
}

.highlight-tier .tier-label {
  color: var(--el-color-primary);
}

.tier-perks {
  margin: 0;
  padding-left: 16px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.9;
}

.cta-arrow {
  font-size: 18px;
  color: var(--el-text-color-placeholder);
  flex-shrink: 0;
}

.cta-inner > .el-button {
  flex-shrink: 0;
  margin-top: 4px;
}
</style>
