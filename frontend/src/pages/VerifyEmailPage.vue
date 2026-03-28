<template>
  <div class="verify-container">
    <el-card class="verify-card">
      <div v-if="status === 'loading'" class="status-content">
        <el-icon class="spinning" :size="48"><Loading /></el-icon>
        <p>{{ $t('auth.verifyEmail.verifying') }}</p>
      </div>

      <el-result
        v-else-if="status === 'success'"
        icon="success"
        :title="$t('auth.verifyEmail.success')"
        :sub-title="$t('auth.verifyEmail.success')"
      >
        <template #extra>
          <el-button type="primary" @click="$router.push('/login')">{{ $t('auth.verifyEmail.login') }}</el-button>
        </template>
      </el-result>

      <el-result
        v-else
        icon="error"
        :title="$t('auth.verifyEmail.error')"
        :sub-title="errorMessage"
      >
        <template #extra>
          <el-button @click="$router.push('/login')">{{ $t('auth.verifyEmail.login') }}</el-button>
        </template>
      </el-result>
    </el-card>
    <AppFooter />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Loading } from '@element-plus/icons-vue'
import { apiFetch } from '@/api/client'
import AppFooter from '@/components/AppFooter.vue'

const route = useRoute()
const { t } = useI18n()
const status = ref<'loading' | 'success' | 'error'>('loading')
const errorMessage = ref(t('auth.verifyEmail.error'))

onMounted(async () => {
  const token = route.query.token as string
  if (!token) {
    status.value = 'error'
    return
  }

  try {
    await apiFetch(`/api/v1/auth/verify-email?token=${encodeURIComponent(token)}`)
    status.value = 'success'
  } catch {
    status.value = 'error'
  }
})
</script>

<style scoped>
.verify-container {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: var(--color-bg-secondary);
}

.verify-card {
  width: 440px;
  max-width: 90vw;
  margin: auto 0;
}

.status-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px 0;
  gap: 16px;
  color: var(--color-text-secondary);
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>