<template>
  <el-dropdown @command="handleChange" trigger="click">
    <el-button text class="language-btn">
      <span class="language-flag">{{ currentLocale.flag }}</span>
      <span class="language-name">{{ currentLocale.name }}</span>
      <el-icon class="el-icon--right"><arrow-down /></el-icon>
    </el-button>
    <template #dropdown>
      <el-dropdown-menu>
        <el-dropdown-item
          v-for="loc in availableLocales"
          :key="loc.code"
          :command="loc.code"
          :disabled="loc.code === locale"
        >
          <span class="dropdown-flag">{{ loc.flag }}</span>
          <span>{{ loc.name }}</span>
          <el-icon v-if="loc.code === locale" class="check-icon"><check /></el-icon>
        </el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowDown, Check } from '@element-plus/icons-vue'
import { availableLocales, type LocaleCode } from '@/locales'

const { locale } = useI18n()

const currentLocale = computed(() => {
  return availableLocales.find(l => l.code === locale.value) || availableLocales[0]
})

const handleChange = (code: LocaleCode) => {
  locale.value = code
  localStorage.setItem('locale', code)
  // TODO: Sync with backend user settings when logged in
}
</script>

<style scoped>
.language-btn {
  display: flex;
  align-items: center;
  gap: 6px;
}

.language-flag {
  font-size: 16px;
}

.language-name {
  font-size: 14px;
}

.dropdown-flag {
  margin-right: 8px;
  font-size: 16px;
}

.check-icon {
  margin-left: 8px;
  color: var(--el-color-success);
}
</style>