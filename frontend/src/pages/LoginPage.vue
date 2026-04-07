<template>
  <div class="login-container">
    <el-card class="login-card">
      <template #header>
        <h2>{{ $t('app.name') }}</h2>
        <p class="subtitle">{{ $t('auth.login.subtitle') }}</p>
      </template>

      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-position="top"
        @submit.prevent="handleSubmit"
      >
        <el-form-item :label="$t('auth.login.email')" prop="email">
          <el-input
            v-model="form.email"
            type="email"
            :placeholder="$t('auth.login.emailPlaceholder')"
            :prefix-icon="User"
            size="large"
          />
        </el-form-item>

        <el-form-item :label="$t('auth.login.password')" prop="password">
          <el-input
            v-model="form.password"
            type="password"
            :placeholder="$t('auth.login.passwordPlaceholder')"
            :prefix-icon="Lock"
            show-password
            size="large"
            @keyup.enter="handleSubmit"
          />
        </el-form-item>

        <div class="login-actions">
          <router-link class="forgot-link" to="/forgot-password">{{ $t('auth.login.forgotPassword') }}</router-link>
        </div>

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
          style="width: 100%"
          @click="handleSubmit"
        >
          {{ $t('auth.login.submit') }}
        </el-button>

        <div class="register-link">
          {{ $t('auth.login.noAccount') }}<router-link to="/register">{{ $t('auth.login.registerLink') }}</router-link>
        </div>
      </el-form>
    </el-card>
    <AppFooter />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { User, Lock } from '@element-plus/icons-vue'
import type { FormInstance, FormRules } from 'element-plus'
import AppFooter from '@/components/AppFooter.vue'

const router = useRouter()
const authStore = useAuthStore()
const { t } = useI18n()

const formRef = ref<FormInstance>()
const loading = ref(false)
const errorMessage = ref('')

const form = reactive({
  email: '',
  password: '',
})

const rules: FormRules = {
  email: [
    { required: true, message: t('auth.login.emailPlaceholder'), trigger: 'blur' },
    { type: 'email', message: t('auth.login.error'), trigger: 'blur' },
  ],
  password: [{ required: true, message: t('auth.login.passwordPlaceholder'), trigger: 'blur' }],
}

async function handleSubmit() {
  if (!formRef.value) return
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  loading.value = true
  errorMessage.value = ''

  try {
    await authStore.login(form.email, form.password)
    router.push('/')
  } catch (error: any) {
    if (error?.status === 502 || error?.status === 503 || error?.status === 504) {
      errorMessage.value = t('common.error')
    } else if (error?.status === 401 || error?.code === 'UNAUTHORIZED') {
      errorMessage.value = t('auth.login.error')
    } else {
      errorMessage.value = error?.message || t('common.error')
    }
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-container {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: var(--color-bg-secondary);
}

.login-card {
  width: 400px;
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

.register-link {
  margin-top: 16px;
  text-align: center;
  font-size: 14px;
  color: var(--color-text-secondary);
}

.login-actions {
  display: flex;
  justify-content: flex-end;
  margin: -8px 0 16px;
}

.forgot-link {
  font-size: 13px;
}
</style>
