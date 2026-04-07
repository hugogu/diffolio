<template>
  <div class="change-password-page">
    <div class="page-header">
      <el-button text @click="$router.back()">
        <el-icon><ArrowLeft /></el-icon>
        {{ $t('common.back') }}
      </el-button>
      <h2>{{ $t('auth.changePassword.title') }}</h2>
    </div>

    <el-card class="form-card">
      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-width="110px"
        style="max-width: 420px"
        @submit.prevent="handleSubmit"
      >
        <el-form-item :label="$t('auth.changePassword.currentPassword')" prop="currentPassword">
          <el-input
            v-model="form.currentPassword"
            type="password"
            show-password
            autocomplete="current-password"
          />
        </el-form-item>
        <el-form-item :label="$t('auth.changePassword.newPassword')" prop="newPassword">
          <el-input
            v-model="form.newPassword"
            type="password"
            show-password
            autocomplete="new-password"
          />
          <div class="pw-hint">{{ $t('auth.register.passwordPlaceholder') }}</div>
        </el-form-item>
        <el-form-item :label="$t('auth.changePassword.confirmPassword')" prop="confirmPassword">
          <el-input
            v-model="form.confirmPassword"
            type="password"
            show-password
            autocomplete="new-password"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="loading" native-type="submit">{{ $t('common.save') }}</el-button>
          <el-button @click="$router.back()">{{ $t('common.cancel') }}</el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ArrowLeft } from '@element-plus/icons-vue'
import { changePassword } from '@/api/auth'

const router = useRouter()
const { t } = useI18n()
const formRef = ref<FormInstance>()
const loading = ref(false)
const form = ref({ currentPassword: '', newPassword: '', confirmPassword: '' })

const rules: FormRules = {
  currentPassword: [{ required: true, message: t('auth.changePassword.currentPassword'), trigger: 'blur' }],
  newPassword: [
    { required: true, message: t('auth.changePassword.newPassword'), trigger: 'blur' },
    { min: 6, message: t('auth.register.errors.passwordTooShort'), trigger: 'blur' },
  ],
  confirmPassword: [
    { required: true, message: t('auth.changePassword.confirmPassword'), trigger: 'blur' },
    {
      validator: (_rule: unknown, value: string, callback: (e?: Error) => void) => {
        if (value !== form.value.newPassword) callback(new Error(t('auth.register.errors.passwordMismatch')))
        else callback()
      },
      trigger: 'blur',
    },
  ],
}

async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  loading.value = true
  try {
    await changePassword(form.value.currentPassword, form.value.newPassword)
    ElMessage.success(t('auth.changePassword.success'))
    router.back()
  } catch (err: unknown) {
    ElMessage.error((err as { message?: string })?.message ?? t('common.error'))
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.change-password-page {
  max-width: 560px;
  padding: 24px;
}

.page-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 24px;
}

.page-header h2 {
  margin: 0;
  font-size: 20px;
}

.form-card {
  padding: 8px 0;
}

.pw-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
  line-height: 1.5;
}
</style>
