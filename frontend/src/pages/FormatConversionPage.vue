<template>
  <div class="format-conversion-page">
    <div class="page-header">
      <h1>{{ $t('conversion.title') }}</h1>
      <p class="subtitle">{{ $t('conversion.subtitle') }}</p>
    </div>

    <!-- Conversion Form -->
    <el-card class="conversion-form">
      <template #header>
        <span>{{ $t('conversion.newConversion') }}</span>
      </template>

      <el-form :model="form" label-position="top">
        <!-- File Upload -->
        <el-form-item class="upload-form-item" :label="$t('conversion.uploadFile')">
          <el-upload
            ref="uploadRef"
            class="full-width-upload"
            drag
            :auto-upload="false"
            :limit="1"
            :on-change="handleFileChange"
            :on-remove="handleFileRemove"
            accept=".mdx"
          >
            <el-icon class="el-icon--upload"><upload-filled /></el-icon>
            <div class="el-upload__text">
              {{ $t('conversion.dragOrClick') }}
            </div>
            <template #tip>
              <div class="el-upload__tip">
                {{ $t('conversion.fileLimit') }}
              </div>
            </template>
          </el-upload>
        </el-form-item>

        <!-- Format Selection -->
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item :label="$t('conversion.inputFormat')">
              <el-select v-model="form.inputFormat" placeholder="选择输入格式">
                <el-option label="MDX" value="MDX" />
              </el-select>
            </el-form-item>
          </el-col>

          <el-col :span="12">
            <el-form-item :label="$t('conversion.outputFormat')">
              <el-select v-model="form.outputFormat" placeholder="选择输出格式">
                <el-option label="TXT" value="TXT" />
                <el-option label="DOCX" value="DOCX" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <!-- Submit Button -->
        <el-form-item>
          <el-button
            type="primary"
            :loading="submitting"
            :disabled="!canSubmit"
            @click="handleSubmit"
          >
            {{ $t('conversion.start') }}
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- Conversion History -->
    <el-card class="conversion-history">
      <template #header>
        <div class="card-header">
          <span>{{ $t('conversion.history') }}</span>
          <el-button :icon="Refresh" circle size="small" @click="loadHistory" />
        </div>
      </template>

      <el-table v-loading="loading" :data="tasks" stripe>
        <el-table-column prop="inputFormat" :label="$t('conversion.inputFormat')" width="100" />
        <el-table-column prop="outputFormat" :label="$t('conversion.outputFormat')" width="100" />

        <el-table-column :label="$t('conversion.fileSize')" width="120">
          <template #default="{ row }">
            {{ formatFileSize(row.fileSize) }}
          </template>
        </el-table-column>

        <el-table-column :label="$t('conversion.status')" width="120">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)">
              {{ getStatusText(row.status) }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column :label="$t('conversion.progress')" width="150">
          <template #default="{ row }">
            <el-progress
              v-if="row.status === 'RUNNING'"
              :percentage="row.progress"
              :stroke-width="10"
            />
            <span v-else-if="row.status === 'COMPLETED'">100%</span>
            <span v-else>-</span>
          </template>
        </el-table-column>

        <el-table-column :label="$t('conversion.createdAt')" width="180">
          <template #default="{ row }">
            {{ formatDate(row.createdAt) }}
          </template>
        </el-table-column>

        <el-table-column :label="$t('common.actions')" width="200" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="row.status === 'COMPLETED'"
              size="small"
              type="primary"
              @click="handleDownload(row)"
            >
              {{ $t('common.download') }}
            </el-button>

            <el-button
              size="small"
              type="danger"
              @click="handleDelete(row)"
            >
              {{ $t('common.delete') }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- Pagination -->
      <el-pagination
        v-model:current-page="page"
        :page-size="pageSize"
        :total="total"
        layout="total, prev, pager, next"
        class="pagination"
        @current-change="loadHistory"
      />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { UploadFilled, Refresh } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import {
  createConversion,
  listConversions,
  downloadConversion,
  deleteConversion,
  type ConversionTask
} from '@/api/conversions'

const { t } = useI18n()

// Form data
const form = ref({
  inputFormat: 'MDX',
  outputFormat: 'TXT'
})

const uploadRef = ref()
const selectedFile = ref<File | null>(null)
const submitting = ref(false)

// History list
const tasks = ref<ConversionTask[]>([])
const loading = ref(false)
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)

// Computed
const canSubmit = computed(() => {
  return form.value.inputFormat && form.value.outputFormat && selectedFile.value && !submitting.value
})

// File upload handlers
function handleFileChange(file: any) {
  selectedFile.value = file.raw
}

function handleFileRemove() {
  selectedFile.value = null
}

// Submit conversion
async function handleSubmit() {
  if (!selectedFile.value) return

  submitting.value = true
  try {
    await createConversion(
      selectedFile.value,
      form.value.inputFormat as 'MDX',
      form.value.outputFormat as 'TXT' | 'DOCX'
    )

    ElMessage.success(t('conversion.started'))

    // Reset form
    selectedFile.value = null
    uploadRef.value?.clearFiles()

    // Refresh list
    await loadHistory()
  } catch (error) {
    ElMessage.error(t('conversion.failed'))
  } finally {
    submitting.value = false
  }
}

// Load history
async function loadHistory() {
  loading.value = true
  try {
    const result = await listConversions(page.value, pageSize.value)
    tasks.value = result.data
    total.value = result.total
  } finally {
    loading.value = false
  }
}

// Download
async function handleDownload(task: ConversionTask) {
  try {
    const blob = await downloadConversion(task.id)
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `converted.${task.outputFormat.toLowerCase()}`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
  } catch (error) {
    ElMessage.error(t('conversion.downloadFailed'))
  }
}

// Delete
async function handleDelete(task: ConversionTask) {
  try {
    await ElMessageBox.confirm(
      t('conversion.confirmDelete'),
      t('common.warning'),
      { type: 'warning' }
    )

    await deleteConversion(task.id)
    ElMessage.success(t('conversion.deleted'))
    await loadHistory()
  } catch {
    // User cancelled
  }
}

// Status display
function getStatusType(status: string) {
  const map: Record<string, string> = {
    PENDING: 'info',
    RUNNING: 'warning',
    COMPLETED: 'success',
    FAILED: 'danger',
    EXPIRED: 'info'
  }
  return map[status] || 'info'
}

function getStatusText(status: string) {
  return t(`conversion.statusLabels.${status}`)
}

// Formatters
function formatFileSize(bytes: number) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('zh-CN', { hour12: false })
}

// Polling
let pollInterval: ReturnType<typeof setInterval> | null = null

function startPolling() {
  if (pollInterval) clearInterval(pollInterval)
  pollInterval = setInterval(() => {
    const hasRunning = tasks.value.some(t => t.status === 'RUNNING')
    if (hasRunning) {
      loadHistory()
    }
  }, 3000)
}

onMounted(() => {
  loadHistory()
  startPolling()
})

onUnmounted(() => {
  if (pollInterval) clearInterval(pollInterval)
})
</script>

<style scoped>
.format-conversion-page {
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
}

.page-header {
  margin-bottom: 24px;
}

.page-header h1 {
  margin: 0 0 8px 0;
  font-size: 24px;
}

.subtitle {
  color: var(--el-text-color-secondary);
  margin: 0;
}

.conversion-form {
  margin-bottom: 24px;
}

.upload-form-item :deep(.el-form-item__content) {
  width: 100%;
}

.full-width-upload {
  width: 100%;
  display: block;
}

.full-width-upload :deep(.el-upload) {
  width: 100%;
  display: block;
}

.full-width-upload :deep(.el-upload-dragger) {
  width: 100%;
  display: block;
  box-sizing: border-box;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.pagination {
  margin-top: 16px;
  justify-content: flex-end;
}
</style>
