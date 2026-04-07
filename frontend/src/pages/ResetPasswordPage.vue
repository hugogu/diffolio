<template>
  <div class="reset-container">
    <el-card class="reset-card">
      <template v-if="status === 'ready'" #header>
        <h2>{{ $t('auth.resetPassword.title') }}</h2>
        <p class="subtitle">{{ $t('auth.resetPassword.subtitle') }}</p>
      </template>

      <div v-if="status === 'loading'" class="status-content">
        <el-icon class="spinning" :size="48"><Loading /></el-icon>
        <p>{{ $t('auth.resetPassword.validating') }}</p>
      </div>

      <el-result
        v-else-if="status === 'success'"
        icon="success"
        :title="$t('auth.resetPassword.successTitle')"
        :sub-title="$t('auth.resetPassword.successMessage')"
      >
        <template #extra>
          <el-button type="primary" @click="$router.push('/login')">{{ $t('auth.verifyEmail.login') }}</el-button>
        </template>
      </el-result>

      <el-result
        v-else-if="status === 'error'"
        icon="error"
        :title="$t('auth.resetPassword.invalidTitle')"
        :sub-title="errorMessage"
      >
        <template #extra>
          <el-button type="primary" @click="$router.push('/forgot-password')">{{ $t('auth.resetPassword.requestAgain') }}</el-button>
          <el-button @click="$router.push('/login')">{{ $t('auth.verifyEmail.login') }}</el-button>
        </template>
      </el-result>

      <template v-else>
        <el-form
          ref="formRef"
          :model="form"
          :rules="rules"
          label-position="top"
          @submit.prevent="handleSubmit"
        >
          <el-form-item :label="$t('auth.resetPassword.newPassword')" prop="newPassword">
            <el-input
              v-model="form.newPassword"
              type="password"
              show-password
              autocomplete="new-password"
              :placeholder="$t('auth.register.passwordPlaceholder')"
              size="large"
            />
            <div class="pw-hint">{{ $t('auth.register.passwordPlaceholder') }}</div>
          </el-form-item>

          <el-form-item :label="$t('auth.resetPassword.confirmPassword')" prop="confirmPassword">
            <el-input
              v-model="form.confirmPassword"
              type="password"
              show-password
              autocomplete="new-password"
              :placeholder="$t('auth.register.confirmPasswordPlaceholder')"
              size="large"
            />
          </el-form-item>

          <el-alert
            v-if="submitError"
            :title="submitError"
            type="error"
            show-icon
            :closable="false"
            style="margin-bottom: 16px"
          />

          <el-button
            type="primary"
            size="large"
            :loading="submitting"
            style="width: 100%"
            @click="handleSubmit"
          >
            {{ $t('auth.resetPassword.submit') }}
          </el-button>
        </el-form>
      </template>
    </el-card>
    <AppFooter />
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Loading } from '@element-plus/icons-vue'
import { resetPassword, validateResetPasswordToken } from '@/api/auth'
import AppFooter from '@/components/AppFooter.vue'

const route = useRoute()
const { t } = useI18n()
const formRef = ref<FormInstance>()
const status = ref<'loading' | 'ready' | 'success' | 'error'>('loading')
const submitting = ref(false)
const errorMessage = ref(t('auth.resetPassword.invalidMessage'))
const submitError = ref('')
const token = ref('')

const form = reactive({
  newPassword: '',
  confirmPassword: '',
})

const rules: FormRules = {
  newPassword: [
    { required: true, message: t('auth.resetPassword.newPassword'), trigger: 'blur' },
    { min: 6, message: t('auth.register.errors.passwordTooShort'), trigger: 'blur' },
  ],
  confirmPassword: [
    { required: true, message: t('auth.resetPassword.confirmPassword'), trigger: 'blur' },
    {
      validator: (_rule: unknown, value: string, callback: (e?: Error) => void) => {
        if (value !== form.newPassword) callback(new Error(t('auth.register.errors.passwordMismatch')))
        else callback()
      },
      trigger: 'blur',
    },
  ],
}

onMounted(async () => {
  token.value = typeof route.query.token === 'string' ? route.query.token : ''
  if (!token.value) {
    status.value = 'error'
    return
  }

  try {
    await validateResetPasswordToken(token.value)
    status.value = 'ready'
  } catch (error: any) {
    errorMessage.value = error?.message || t('auth.resetPassword.invalidMessage')
    status.value = 'error'
  }
})

async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid || !token.value) return

  submitting.value = true
  submitError.value = ''

  try {
    await resetPassword(token.value, form.newPassword)
    status.value = 'success'
  } catch (error: any) {
    submitError.value = error?.message || t('common.error')
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.reset-container {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: var(--color-bg-secondary);
}

.reset-card {
  width: 440px;
  max-width: 90vw;
  margin: auto 0;
}

h2 {
  margin: 0;
  font-size: 20px;
  color: var(--color-primary);
}

.subtitle {
  margin: 4px 0 0;
  color: var(--color-text-secondary);
  font-size: 14px;
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

.pw-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
  line-height: 1.5;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
