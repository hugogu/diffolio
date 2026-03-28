<template>
  <el-config-provider :locale="elementLocale">
    <RouterView />
  </el-config-provider>
</template>

<script setup lang="ts">
import { computed, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElConfigProvider } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import en from 'element-plus/es/locale/lang/en'
import { useSettingsStore } from '@/stores/settings'

const { locale } = useI18n()
const settings = useSettingsStore()

// Sync Element Plus locale with i18n locale
const elementLocale = computed(() => {
  return locale.value === 'en' ? en : zhCn
})

// Watch dark mode changes
watchEffect(() => {
  document.documentElement.classList.toggle('dark', settings.darkMode)
})
</script>
