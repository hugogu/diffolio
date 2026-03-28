<template>
  <div class="terms-container">
    <el-card class="terms-card">
      <template #header>
        <h1>{{ $t('terms.title') }}</h1>
        <p class="subtitle">{{ $t('terms.subtitle') }}</p>
      </template>

      <div class="terms-content">
        <section>
          <h2>{{ $t('terms.sections.service.title') }}</h2>
          <p>{{ $t('terms.sections.service.p1') }}</p>
          <p v-html="$t('terms.sections.service.p2')"></p>
        </section>

        <section>
          <h2>{{ $t('terms.sections.userResponsibility.title') }}</h2>
          <p>{{ $t('terms.sections.userResponsibility.p1') }}</p>
          <ul>
            <li v-html="$t('terms.sections.userResponsibility.item1')"></li>
            <li>{{ $t('terms.sections.userResponsibility.item2') }}</li>
            <li>{{ $t('terms.sections.userResponsibility.item3') }}</li>
            <li>{{ $t('terms.sections.userResponsibility.item4') }}</li>
          </ul>
        </section>

        <section>
          <h2>{{ $t('terms.sections.ip.title') }}</h2>
          <p>{{ $t('terms.sections.ip.p1') }}</p>
          <p>{{ $t('terms.sections.ip.p2') }}</p>
        </section>

        <section>
          <h2>{{ $t('terms.sections.disclaimer.title') }}</h2>
          <p>{{ $t('terms.sections.disclaimer.p1') }}</p>
          <p>{{ $t('terms.sections.disclaimer.p2') }}</p>
        </section>

        <section>
          <h2>{{ $t('terms.sections.security.title') }}</h2>
          <p>{{ $t('terms.sections.security.p1') }}</p>
        </section>

        <section>
          <h2>{{ $t('terms.sections.changes.title') }}</h2>
          <p>{{ $t('terms.sections.changes.p1') }}</p>
        </section>

        <section>
          <h2>{{ $t('terms.sections.other.title') }}</h2>
          <p>{{ $t('terms.sections.other.p1') }}</p>
        </section>

        <div class="terms-footer">
          <p>{{ $t('terms.lastUpdated') }}</p>
        </div>
      </div>

      <div class="back-link">
        <el-button type="primary" @click="$router.back()">{{ $t('terms.backButton') }}</el-button>
      </div>
    </el-card>
    <AppFooter />
  </div>
</template>

<script setup lang="ts">
import AppFooter from '@/components/AppFooter.vue'
import { useI18n } from 'vue-i18n'

useI18n()
</script>

<style scoped>
.terms-container {
  min-height: 100vh;
  padding: 40px 20px;
  background: var(--color-bg-secondary);
  display: flex;
  flex-direction: column;
  align-items: center;
}

.terms-card {
  width: 800px;
  max-width: 100%;
  margin-bottom: auto;
}

h1 {
  margin: 0;
  font-size: 24px;
  color: var(--color-primary);
}

.subtitle {
  margin: 8px 0 0;
  color: var(--color-text-secondary);
  font-size: 14px;
}

.terms-content {
  line-height: 1.8;
  color: var(--color-text-primary);
}

section {
  margin-bottom: 24px;
}

h2 {
  font-size: 18px;
  color: var(--color-text-primary);
  margin-bottom: 12px;
  font-weight: 600;
}

p {
  margin-bottom: 12px;
  text-align: justify;
}

ul {
  margin-left: 24px;
  margin-bottom: 12px;
}

li {
  margin-bottom: 8px;
}

.terms-footer {
  margin-top: 32px;
  padding-top: 16px;
  border-top: 1px solid var(--color-border);
  color: var(--color-text-secondary);
  font-size: 14px;
}

.back-link {
  margin-top: 24px;
  text-align: center;
}
</style>
