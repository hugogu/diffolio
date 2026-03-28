<template>
  <el-dialog
    :model-value="true"
    :title="t('admin.users.editTitle', { email: user.email })"
    width="480px"
    @close="$emit('close')"
  >
    <el-form :model="form" label-width="130px">
      <el-form-item :label="t('admin.users.role')">
        <el-select v-model="form.role" style="width: 100%">
          <el-option :label="t('admin.users.roles.REGULAR')" value="REGULAR" />
          <el-option :label="t('admin.users.roles.SUBSCRIBED')" value="SUBSCRIBED" />
          <el-option :label="t('admin.users.roles.ADMIN')" value="ADMIN" />
        </el-select>
      </el-form-item>

      <el-form-item :label="t('admin.users.emailVerified')">
        <el-switch v-model="form.emailVerified" />
        <el-button
          v-if="!form.emailVerified"
          size="small"
          :loading="resending"
          style="margin-left: 12px"
          @click="resend"
        >{{ t('admin.users.resendEmail') }}</el-button>
      </el-form-item>

      <el-form-item :label="t('admin.users.allowExport')">
        <el-switch v-model="form.exportEnabled" />
      </el-form-item>

      <el-form-item :label="t('admin.users.maxVersions')">
        <el-input-number v-model="form.maxVersions" :min="0" :max="9999" style="width: 100%" />
      </el-form-item>

      <el-form-item :label="t('admin.users.maxBooks')">
        <el-input-number v-model="form.maxBooks" :min="0" :max="9999" style="width: 100%" />
      </el-form-item>

      <el-form-item :label="t('admin.users.editBuiltinConfig')">
        <el-switch v-model="form.canEditBuiltinConfigs" />
      </el-form-item>

      <el-form-item :label="t('admin.users.watermark')">
        <el-switch v-model="form.watermarkEnabled" />
      </el-form-item>
    </el-form>

    <el-alert
      v-if="successMessage"
      :title="successMessage"
      type="success"
      show-icon
      :closable="false"
      style="margin-top: 8px"
    />
    <el-alert
      v-if="errorMessage"
      :title="errorMessage"
      type="error"
      show-icon
      :closable="false"
      style="margin-top: 8px"
    />

    <template #footer>
      <el-button @click="$emit('close')">{{ $t('common.cancel') }}</el-button>
      <el-button type="primary" :loading="saving" @click="save">{{ $t('common.save') }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { updateAdminUser, resendVerificationAdmin, type AdminUser } from '@/api/admin'

const { t } = useI18n()

const props = defineProps<{ user: AdminUser }>()
const emit = defineEmits<{ close: []; saved: [AdminUser] }>()

const saving = ref(false)
const resending = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

const form = reactive({
  role: props.user.role,
  emailVerified: props.user.emailVerified,
  exportEnabled: props.user.exportEnabled,
  maxVersions: props.user.maxVersions,
  maxBooks: props.user.maxBooks,
  canEditBuiltinConfigs: props.user.canEditBuiltinConfigs,
  watermarkEnabled: props.user.watermarkEnabled,
})

async function save() {
  saving.value = true
  errorMessage.value = ''
  successMessage.value = ''
  try {
    const updated = await updateAdminUser(props.user.id, {
      role: form.role,
      emailVerified: form.emailVerified,
      exportEnabled: form.exportEnabled,
      maxVersions: form.maxVersions,
      maxBooks: form.maxBooks,
      canEditBuiltinConfigs: form.canEditBuiltinConfigs,
      watermarkEnabled: form.watermarkEnabled,
    })
    emit('saved', updated)
  } catch (err: unknown) {
    errorMessage.value = (err as { message?: string })?.message ?? t('common.saveError')
  } finally {
    saving.value = false
  }
}

async function resend() {
  resending.value = true
  errorMessage.value = ''
  successMessage.value = ''
  try {
    const result = await resendVerificationAdmin(props.user.id)
    successMessage.value = result.message
  } catch (err: unknown) {
    errorMessage.value = (err as { message?: string })?.message ?? t('admin.users.sendFailed')
  } finally {
    resending.value = false
  }
}
</script>
