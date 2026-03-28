<template>
  <div class="register-container">
    <el-card class="register-card">
      <template #header>
        <h2>{{ $t('app.name') }}</h2>
        <p class="subtitle">{{ $t('auth.register.subtitle') }}</p>
      </template>

      <div v-if="registered">
        <el-result
          :icon="emailSent ? 'success' : 'warning'"
          :title="$t('auth.register.success')"
          :sub-title="emailSent
            ? $t('auth.register.successWithEmail')
            : $t('auth.register.successEmailFailed')"
        >
          <template #extra>
            <el-button type="primary" @click="$router.push('/login')">{{ $t('auth.verifyEmail.login') }}</el-button>
          </template>
        </el-result>
      </div>

      <el-form
        v-else
        ref="formRef"
        :model="form"
        :rules="rules"
        label-position="top"
        @submit.prevent="handleSubmit"
      >
        <el-form-item :label="$t('auth.register.email')" prop="email">
          <el-input
            v-model="form.email"
            type="email"
            :placeholder="$t('auth.register.emailPlaceholder')"
            :prefix-icon="User"
            size="large"
          />
        </el-form-item>

        <el-form-item :label="$t('auth.register.password')" prop="password">
          <el-input
            v-model="form.password"
            type="password"
            :placeholder="$t('auth.register.passwordPlaceholder')"
            :prefix-icon="Lock"
            show-password
            size="large"
          />
        </el-form-item>

        <el-form-item :label="$t('auth.register.confirmPassword')" prop="confirmPassword">
          <el-input
            v-model="form.confirmPassword"
            type="password"
            :placeholder="$t('auth.register.confirmPasswordPlaceholder')"
            :prefix-icon="Lock"
            show-password
            size="large"
            @keyup.enter="handleSubmit"
          />
        </el-form-item>

        <el-form-item prop="agreedToTerms" class="terms-item">
          <el-checkbox v-model="form.agreedToTerms" size="large">
            {{ $t('auth.register.terms.agreeText') }}
            <router-link to="/terms" target="_blank" class="terms-link">
              {{ $t('auth.register.terms.serviceAgreement') }}
            </router-link>
          </el-checkbox>
        </el-form-item>

        <el-alert
          v-if="errorMessage"
          :title="errorMessage"
          type="error"
          show-icon
          :closable="false"
          style="margin-bottom: 16px"
        />

        <el-button
          type="primary"
          size="large"
          :loading="loading"
          :disabled="!form.agreedToTerms"
          style="width: 100%"
          @click="handleSubmit"
        >
          {{ $t('auth.register.submit') }}
        </el-button>

        <div class="login-link">
          {{ $t('auth.register.hasAccount') }}<router-link to="/login">{{ $t('auth.register.loginLink') }}</router-link>
        </div>

        <div class="help-link">
          <router-link to="/help">{{ $t('auth.register.helpCenter') }}</router-link>
        </div>
      </el-form>
    </el-card>
    <AppFooter />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useI18n } from 'vue-i18n'
import { User, Lock } from '@element-plus/icons-vue'
import { register } from '@/api/auth'
import type { FormInstance, FormRules } from 'element-plus'
import AppFooter from '@/components/AppFooter.vue'

const { t } = useI18n()
const formRef = ref<FormInstance>()
const loading = ref(false)
const errorMessage = ref('')
const registered = ref(false)
const emailSent = ref(true)

const form = reactive({
  email: '',
  password: '',
  confirmPassword: '',
  agreedToTerms: false,
})

const validateConfirmPassword = (_rule: unknown, value: string, callback: (e?: Error) => void) => {
  if (value !== form.password) {
    callback(new Error(t('auth.register.errors.passwordMismatch')))
  } else {
    callback()
  }
}

const validateTerms = (_rule: unknown, value: boolean, callback: (e?: Error) => void) => {
  if (!value) {
    callback(new Error(t('auth.register.errors.termsRequired')))
  } else {
    callback()
  }
}

const rules: FormRules = {
  email: [
    { required: true, message: t('auth.register.emailPlaceholder'), trigger: 'blur' },
    { type: 'email', message: t('auth.register.error'), trigger: 'blur' },
  ],
  password: [
    { required: true, message: t('auth.register.passwordPlaceholder'), trigger: 'blur' },
    { min: 6, message: t('auth.register.errors.passwordTooShort'), trigger: 'blur' },
  ],
  confirmPassword: [
    { required: true, message: t('auth.register.confirmPasswordPlaceholder'), trigger: 'blur' },
    { validator: validateConfirmPassword, trigger: 'blur' },
  ],
  agreedToTerms: [
    { validator: validateTerms, trigger: 'change' },
  ],
}

async function handleSubmit() {
  if (!formRef.value) return
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  if (!form.agreedToTerms) {
    errorMessage.value = t('auth.register.errors.termsRequired')
    return
  }

  loading.value = true
  errorMessage.value = ''

  try {
    const result = await register(form.email, form.password, form.agreedToTerms)
    emailSent.value = result.emailSent
    registered.value = true
  } catch (err: unknown) {
    const msg = (err as { message?: string })?.message ?? ''
    if (msg.includes('already')) {
      errorMessage.value = t('auth.register.errors.emailExists')
    } else if (msg.includes('password')) {
      errorMessage.value = t('auth.register.errors.passwordWeak')
    } else if (msg.includes('terms') || msg.includes('agreed')) {
      errorMessage.value = t('auth.register.errors.termsRequired')
    } else {
      errorMessage.value = msg || t('auth.register.errors.generic')
    }
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.register-container {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: var(--color-bg-secondary);
}

.register-card {
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

:deep(.el-form-item) {
  margin-bottom: 24px;
}

.terms-item {
  margin-bottom: 16px;
}

.terms-item :deep(.el-form-item__content) {
  line-height: 1.5;
}

.terms-link {
  color: var(--color-primary);
  text-decoration: none;
}

.terms-link:hover {
  text-decoration: underline;
}

.login-link {
  margin-top: 16px;
  text-align: center;
  font-size: 14px;
  color: var(--color-text-secondary);
}

.help-link {
  margin-top: 8px;
  text-align: center;
  font-size: 14px;
}

.help-link a {
  color: var(--color-text-secondary);
  text-decoration: none;
}

.help-link a:hover {
  color: var(--color-primary);
  text-decoration: underline;
}
</style>