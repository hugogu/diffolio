<template>
  <div class="about-page">
    <div class="page-header">
      <div class="page-header-text">
        <h2>{{ $t('about.title') }}</h2>
        <p class="subtitle">{{ $t('about.subtitle') }}</p>
      </div>
      <div v-if="wechatImg" class="contact-corner">
        <img :src="wechatImg" :alt="$t('about.donation.contactLabel')" class="contact-qr" />
        <p class="contact-corner-label">{{ $t('about.donation.contactLabel') }}</p>
      </div>
    </div>

    <!-- Platform Introduction -->
    <el-card class="section-card">
      <template #header><span class="card-title">{{ $t('about.platformIntro.title') }}</span></template>
      <p>{{ $t('about.platformIntro.description1') }}</p>
      <p>{{ $t('about.platformIntro.description2') }}</p>
    </el-card>

    <!-- Important Declaration -->
    <el-card class="section-card">
      <template #header><span class="card-title">{{ $t('about.declaration.title') }}</span></template>
      <el-alert type="warning" :closable="false" show-icon style="margin-bottom: 16px">
        <template #title>{{ $t('about.declaration.notice') }}</template>
        <template #default>{{ $t('about.declaration.description') }}</template>
      </el-alert>
      <ul class="declaration-list">
        <li v-for="(item, index) in declarationItems" :key="index">{{ item }}</li>
      </ul>
    </el-card>

    <!-- Main Features -->
    <el-card class="section-card">
      <template #header><span class="card-title">{{ $t('about.features.title') }}</span></template>
      <div class="feature-list">
        <div class="feature-item">
          <el-icon class="feature-icon"><DataAnalysis /></el-icon>
          <div>
            <div class="feature-name">{{ $t('about.features.versionCompare.name') }}</div>
            <div class="feature-desc">{{ $t('about.features.versionCompare.description') }}</div>
          </div>
        </div>
        <div class="feature-item">
          <el-icon class="feature-icon"><Search /></el-icon>
          <div>
            <div class="feature-name">{{ $t('about.features.headwordSearch.name') }}</div>
            <div class="feature-desc">{{ $t('about.features.headwordSearch.description') }}</div>
          </div>
        </div>
        <div class="feature-item">
          <el-icon class="feature-icon"><Grid /></el-icon>
          <div>
            <div class="feature-name">{{ $t('about.features.taxonomy.name') }}</div>
            <div class="feature-desc">{{ $t('about.features.taxonomy.description') }}</div>
          </div>
        </div>
        <div class="feature-item">
          <el-icon class="feature-icon"><Download /></el-icon>
          <div>
            <div class="feature-name">{{ $t('about.features.export.name') }}</div>
            <div class="feature-desc">{{ $t('about.features.export.description') }}</div>
          </div>
        </div>
      </div>
    </el-card>

    <!-- Donation Support -->
    <el-card class="section-card">
      <template #header><span class="card-title">{{ $t('about.donation.title') }}</span></template>
      <p>{{ $t('about.donation.costs') }}</p>
      <ul class="cost-list">
        <li v-for="(item, index) in costItems" :key="index">{{ item }}</li>
      </ul>
      <p>{{ $t('about.donation.description') }}</p>
      <p class="disclaimer-text">
        {{ $t('about.donation.note') }}
      </p>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { DataAnalysis, Search, Grid, Download } from '@element-plus/icons-vue'
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const declarationItems = [t('about.declaration.items.0'), t('about.declaration.items.1'), t('about.declaration.items.2')]
const costItems = [t('about.donation.costItems.0'), t('about.donation.costItems.1'), t('about.donation.costItems.2')]

// Contact QR image - this is hosted-version specific and loaded dynamically
const wechatImg = ref('')

// Try to load contact image (will fail gracefully in open-source version)
onMounted(async () => {
  try {
    const module = await import('@/assets/img/Wechat.jpg')
    wechatImg.value = module.default
  } catch {
    // Image not available in open-source version
    wechatImg.value = ''
  }
})
</script>

<style scoped>
.about-page {
  max-width: 800px;
  margin: 0 auto;
  padding: 24px;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 24px;
}

.page-header-text {
  flex: 1;
}

.page-header h2 {
  margin: 0 0 4px;
  font-size: 22px;
}

.subtitle {
  margin: 0;
  color: var(--el-text-color-secondary);
  font-size: 14px;
}

.contact-corner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.contact-qr {
  width: 100px;
  height: 100px;
  object-fit: cover;
  border-radius: 8px;
  border: 1px solid var(--el-border-color);
}

.contact-corner-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin: 0;
  text-align: center;
}

.section-card {
  margin-bottom: 20px;
}

.card-title {
  font-weight: 600;
  font-size: 15px;
}

.section-card p {
  font-size: 14px;
  line-height: 1.8;
  color: var(--el-text-color-regular);
  margin: 0 0 10px;
}

.section-card p:last-child {
  margin-bottom: 0;
}

.declaration-list,
.cost-list {
  margin: 8px 0 0;
  padding-left: 20px;
  font-size: 14px;
  color: var(--el-text-color-regular);
  line-height: 2;
}

.feature-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.feature-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.feature-icon {
  font-size: 20px;
  color: var(--el-color-primary);
  margin-top: 2px;
  flex-shrink: 0;
}

.feature-name {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 2px;
}

.feature-desc {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  line-height: 1.6;
}

.disclaimer-text {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color-light);
  border-radius: 6px;
  padding: 10px 14px;
  margin-top: 12px;
}

</style>
