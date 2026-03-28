<template>
  <footer class="app-footer">
    <div class="footer-content">
      <a v-if="icpRecord" href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer" class="footer-link">{{ icpRecord }}</a>
      <span v-if="icpRecord" class="footer-separator">|</span>
      <span class="footer-copyright">{{ $t('app.footer.copyright', { year: currentYear }) }}</span>
    </div>
  </footer>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const currentYear = computed(() => new Date().getFullYear())

// ICP record: from window.ICP_RECORD (production) or import.meta.env (development)
const icpRecord = computed(() => {
  // Production: set by docker-entrypoint.sh via sed replacement
  if (typeof window !== 'undefined' && (window as any).ICP_RECORD && (window as any).ICP_RECORD !== '{{ICP_RECORD}}') {
    return (window as any).ICP_RECORD
  }
  // Development: use env var from docker-compose (Vite exposes only VITE_ prefixed vars)
  const envIcp = (import.meta as any).env.VITE_ICP_RECORD
  if (envIcp && envIcp !== '{{ICP_RECORD}}') {
    return envIcp
  }
  return t('app.footer.icp') || ''
})
</script>

<style scoped>
.app-footer {
  border-top: 1px solid var(--color-border);
  background: var(--el-bg-color);
  padding: 20px 24px;
  margin-top: auto;
}

.footer-content {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.footer-icp-placeholder:empty {
  display: none;
}

.footer-icp-placeholder:not(:empty) {
  color: var(--el-text-color-secondary);
}

.footer-separator {
  color: var(--el-text-color-placeholder);
}

.footer-copyright {
  color: var(--el-text-color-placeholder);
}
</style>
