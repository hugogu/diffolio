<template>
  <div class="forgot-container">
    <el-card class="forgot-card">
      <template #header>
        <h2>{{ $t('auth.forgotPassword.title') }}</h2>
        <p class="subtitle">{{ $t('auth.forgotPassword.subtitle') }}</p>
      </template>

      <el-result
        v-if="submitted"
        icon="success"
        :title="$t('auth.forgotPassword.successTitle')"
        :sub-title="$t('auth.forgotPassword.successMessage')"
      >
        <template #extra>
          <el-button type="primary" @click="$router.push('/login')">{{ $t('auth.verifyEmail.login') }}</el-button>
          <el-button @click="resetForm">{{ $t('common.back') }}</el-button>
        </template>
      </el-result>

      <el-form
        v-else
        ref="formRef"
        :model="form"
        :rules="rules"
        label-position="top"
        @submit.prevent="handleSubmit"
      >
        <el-form-item :label="$t('auth.forgotPassword.email')" prop="email">
          <el-input
            v-model="form.email"
            type="email"
            :placeholder="$t('auth.forgotPassword.emailPlaceholder')"
            :prefix-icon="Message"
            size="large"
          />
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
          style="width: 100%"
          @click="handleSubmit"
        >
          {{ $t('auth.forgotPassword.submit') }}
        </el-button>

        <div class="login-link">
          <router-link to="/login">{{ $t('auth.verifyEmail.login') }}</router-link>
        </div>
      </el-form>
    </el-card>
    <AppFooter />
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { Message } from '@element-plus/icons-vue'
import { forgotPassword } from '@/api/auth'
import AppFooter from '@/components/AppFooter.vue'

const { t } = useI18n()
const formRef = ref<FormInstance>()
const loading = ref(false)
const submitted = ref(false)
const errorMessage = ref('')

const form = reactive({
  email: '',
})

const rules: FormRules = {
  email: [
    { required: true, message: t('auth.forgotPassword.emailPlaceholder'), trigger: 'blur' },
    { type: 'email', message: t('auth.login.error'), trigger: 'blur' },
  ],
}

function resetForm() {
  submitted.value = false
  errorMessage.value = ''
}

async function handleSubmit() {
  if (!formRef.value) return
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  loading.value = true
  errorMessage.value = ''

  try {
    await forgotPassword(form.email)
    submitted.value = true
  } catch (error: any) {
    errorMessage.value = error?.message || t('common.error')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.forgot-container {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: var(--color-bg-secondary);
}

.forgot-card {
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

.login-link {
  margin-top: 16px;
  text-align: center;
  font-size: 14px;
}
</style>
