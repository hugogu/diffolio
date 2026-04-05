<template>
  <div class="file-upload">
    <el-upload
      drag
      :action="`/api/v1/versions/${versionId}/upload`"
      :headers="{ 'X-Skip-JSON-Stringify': 'true' }"
      :with-credentials="true"
      :show-file-list="true"
      accept=".txt,.doc,.docx,.pdf,.mdx"
      :limit="1"
      :auto-upload="true"
      :on-success="handleUploadSuccess"
      :on-error="handleUploadError"
      :before-upload="beforeUpload"
    >
      <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
      <div class="el-upload__text">{{ t('upload.dragFile') }} <em>(.txt / .doc / .docx / .pdf / .mdx)</em></div>
      <template #tip>
        <div class="el-upload__tip">{{ t('upload.maxSize', { size: maxSizeMb }) }}，{{ t('upload.fileTypes') }}</div>
      </template>
    </el-upload>

    <!-- Progress section -->
    <div v-if="taskId" class="progress-section">
      <el-alert
        v-if="uploadMeta"
        :title="uploadMetaTitle"
        :type="uploadMeta.reusedFromExistingAsset ? 'success' : 'info'"
        show-icon
        :closable="false"
      >
        <template #default>
          <div class="upload-meta-line">{{ t('upload.sharedAssetId') }}：{{ uploadMeta.sharedFileAssetId }}</div>
          <div class="upload-meta-line">{{ t('upload.contentHash') }}：{{ uploadMeta.contentHash }}</div>
        </template>
      </el-alert>

      <div class="progress-header">
        <span>{{ t('upload.parsingProgress') }}</span>
        <el-tag :type="statusTagType">{{ statusLabel }}</el-tag>
      </div>

      <el-progress
        :percentage="progressPercent"
        :status="progressStatus"
        :stroke-width="12"
      />

      <div class="progress-stats">
        <span>{{ t('upload.processed') }}：{{ currentProgress?.processedEntries ?? 0 }}</span>
        <span>{{ t('upload.failed') }}：{{ currentProgress?.failedEntries ?? 0 }}</span>
      </div>

      <el-alert
        v-if="socketStatus === 'COMPLETED'"
        :title="`${t('upload.parsingComplete')}：${currentProgress?.processedEntries} ${t('upload.entries')}，${currentProgress?.failedEntries} ${t('upload.failedEntries')}`"
        type="success"
        show-icon
        :closable="false"
      />

      <el-alert
        v-if="socketStatus === 'FAILED'"
        :title="socketError?.message ?? t('upload.parsingFailed')"
        type="error"
        show-icon
        :closable="false"
      >
        <template #default>
          <RouterLink v-if="taskId" :to="`/admin/parse-tasks/${taskId}/errors`">
            {{ t('upload.viewErrors') }}
          </RouterLink>
        </template>
      </el-alert>

      <div v-if="taskId" class="error-link">
        <el-button
          v-if="(currentProgress?.failedEntries ?? 0) > 0"
          text
          type="warning"
          @click="$router.push(`/admin/parse-tasks/${taskId}/errors`)"
        >
          {{ t('upload.viewErrorCount', { count: currentProgress?.failedEntries }) }}
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { UploadFilled } from '@element-plus/icons-vue'
import { useParseSocket } from '@/composables/useParseSocket'
import type { UploadRawFile } from 'element-plus'

const { t } = useI18n()

const props = defineProps<{ versionId: string; maxSizeMb?: number }>()
const emit = defineEmits<{ taskCreated: [taskId: string] }>()

const maxSizeMb = props.maxSizeMb ?? 500
const taskId = ref<string | null>(null)
const uploadMeta = ref<{
  sharedFileAssetId: string
  contentHash: string
  reusedFromExistingAsset: boolean
} | null>(null)

const { progress: currentProgress, status: socketStatus, error: socketError } = useParseSocket(taskId)

function beforeUpload(file: UploadRawFile): boolean {
  const maxBytes = maxSizeMb * 1024 * 1024
  if (file.size > maxBytes) {
    alert(t('upload.fileTooLarge', { size: maxSizeMb }))
    return false
  }
  return true
}

function handleUploadSuccess(response: {
  id?: string
  taskId?: string
  sharedFileAssetId?: string
  contentHash?: string
  reusedFromExistingAsset?: boolean
}) {
  const resolvedTaskId = response?.taskId ?? response?.id
  if (resolvedTaskId) {
    taskId.value = resolvedTaskId
    emit('taskCreated', resolvedTaskId)
  }
  if (response?.sharedFileAssetId && response?.contentHash) {
    uploadMeta.value = {
      sharedFileAssetId: response.sharedFileAssetId,
      contentHash: response.contentHash,
      reusedFromExistingAsset: Boolean(response.reusedFromExistingAsset),
    }
  }
}

function handleUploadError() {
  alert(t('upload.uploadFailedRetry'))
}

/** Called by parent to track a task that was started externally (e.g. re-parse). */
function trackTask(id: string) {
  taskId.value = id
  emit('taskCreated', id)
}

defineExpose({ trackTask })

const uploadMetaTitle = computed(() => {
  if (!uploadMeta.value) return ''
  return uploadMeta.value.reusedFromExistingAsset
    ? t('upload.reusedSharedAsset')
    : t('upload.createdSharedAsset')
})

const progressPercent = computed(() => {
  if (!currentProgress.value) return 0
  if (socketStatus.value === 'COMPLETED') return 100
  return currentProgress.value.percentage ?? 0
})

const progressStatus = computed(() => {
  if (socketStatus.value === 'COMPLETED') return 'success'
  if (socketStatus.value === 'FAILED') return 'exception'
  return undefined
})

const statusTagType = computed(() => {
  switch (socketStatus.value) {
    case 'COMPLETED': return 'success'
    case 'FAILED': return 'danger'
    case 'RUNNING': return 'warning'
    default: return 'info'
  }
})

const statusLabel = computed(() => {
  switch (socketStatus.value) {
    case 'COMPLETED': return t('upload.status.completed')
    case 'FAILED': return t('upload.status.failed')
    case 'RUNNING': return t('upload.status.running')
    default: return t('upload.status.waiting')
  }
})
</script>

<style scoped>
.file-upload {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.progress-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
}

.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 500;
}

.progress-stats {
  display: flex;
  gap: 24px;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.error-link {
  text-align: right;
}

.upload-meta-line {
  word-break: break-all;
}
</style>
