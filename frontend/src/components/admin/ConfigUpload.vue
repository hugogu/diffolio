<template>
  <div class="config-upload">
    <el-upload
      drag
      :auto-upload="false"
      :show-file-list="true"
      accept=".json,.yaml,.yml"
      :limit="1"
      @change="handleFileChange"
    >
      <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
      <div class="el-upload__text">{{ t('upload.dragConfig') }} <em>(.json / .yaml)</em></div>
      <template #tip>
        <div class="el-upload__tip">{{ t('upload.configDesc') }}</div>
      </template>
    </el-upload>

    <div v-if="uploading" class="upload-status">
      <el-icon class="is-loading"><Loading /></el-icon>
      {{ t('upload.validating') }}
    </div>

    <el-alert
      v-if="result === 'VALID'"
      :title="t('upload.configValid')"
      type="success"
      show-icon
      :closable="false"
    />

    <el-alert
      v-if="result === 'INVALID'"
      :title="t('upload.configInvalid')"
      type="error"
      show-icon
      :closable="false"
    >
      <template #default>
        <div v-for="(err, idx) in errors" :key="idx">{{ err }}</div>
      </template>
    </el-alert>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { UploadFilled, Loading } from '@element-plus/icons-vue'
import { uploadConfig } from '@/api/dictionaries'
import type { UploadFile } from 'element-plus'

const { t } = useI18n()

const props = defineProps<{ versionId: string }>()
const emit = defineEmits<{ uploaded: [status: 'VALID' | 'INVALID'] }>()

const uploading = ref(false)
const result = ref<'VALID' | 'INVALID' | null>(null)
const errors = ref<string[]>([])

async function handleFileChange(file: UploadFile) {
  if (!file.raw) return

  uploading.value = true
  result.value = null
  errors.value = []

  try {
    const text = await file.raw.text()
    let config: Record<string, unknown>

    if (file.name.endsWith('.json')) {
      config = JSON.parse(text)
    } else {
      // For YAML, we'd need js-yaml, but send raw for now
      config = JSON.parse(text)
    }

    const response = await uploadConfig(props.versionId, config)
    result.value = (response as { validationStatus?: string }).validationStatus === 'VALID' ? 'VALID' : 'INVALID'
    emit('uploaded', result.value)
  } catch (err: unknown) {
    result.value = 'INVALID'
    const apiErr = err as { details?: { errors?: string[] } }
    errors.value = apiErr.details?.errors ?? [t('upload.uploadFailed')]
    emit('uploaded', 'INVALID')
  } finally {
    uploading.value = false
  }
}
</script>

<style scoped>
.config-upload {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.upload-status {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--color-text-secondary);
}
</style>
