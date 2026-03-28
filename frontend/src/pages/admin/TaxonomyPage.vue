<template>
  <div class="taxonomy-page">
    <div class="page-header">
      <h2>{{ $t('admin.taxonomy.title') }}</h2>
      <el-button type="primary" @click="openUploadDialog">{{ $t('admin.taxonomy.upload') }}</el-button>
    </div>

    <el-table :data="store.sources" v-loading="store.sourcesLoading" style="width: 100%">
      <el-table-column prop="name" :label="$t('admin.taxonomy.name')" />
      <el-table-column :label="$t('admin.taxonomy.status')" width="140">
        <template #default="{ row }">
          <el-tag :type="statusType(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="totalEntries" :label="$t('admin.taxonomy.entryCount')" width="120" />
      <el-table-column :label="$t('admin.taxonomy.createdAt')" width="200">
        <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column :label="$t('comparisons.actions')" width="260">
        <template #default="{ row }">
          <el-button size="small" @click="openEditor(row.id)" :disabled="row.status !== 'ACTIVE'">{{ $t('admin.taxonomy.edit') }}</el-button>
          <el-button size="small" @click="reimport(row.id)" :disabled="row.status === 'IMPORTING'">{{ $t('admin.taxonomy.reimport') }}</el-button>
          <el-popconfirm :title="$t('common.confirmDelete')" @confirm="remove(row.id)">
            <template #reference>
              <el-button size="small" type="danger">{{ $t('admin.taxonomy.delete') }}</el-button>
            </template>
          </el-popconfirm>
        </template>
      </el-table-column>
    </el-table>

    <!-- Upload Dialog -->
    <el-dialog v-model="showUploadDialog" :title="$t('admin.taxonomy.uploadTitle')" width="700px" @closed="resetForm">
      <el-form :model="form" label-width="140px">
        <el-form-item :label="$t('admin.taxonomy.name')" required>
          <el-input v-model="form.name" :placeholder="$t('admin.taxonomy.namePlaceholder')" />
        </el-form-item>
        <el-form-item :label="$t('admin.taxonomy.description')">
          <el-input v-model="form.description" type="textarea" :rows="2" />
        </el-form-item>

        <!-- Sample config selector -->
        <el-form-item :label="$t('admin.taxonomy.sampleConfig')">
          <el-select
            v-model="selectedSample"
            :placeholder="$t('admin.taxonomy.sampleConfigPlaceholder')"
            style="width: 100%"
            clearable
            @change="applySample"
          >
            <el-option
              v-for="s in sampleConfigs"
              :key="s.filename"
              :label="s.name"
              :value="s.filename"
            />
          </el-select>
          <div class="form-tip">
            {{ $t('admin.taxonomy.sampleConfigTip') }}</div>
        </el-form-item>

        <el-form-item :label="$t('admin.taxonomy.formatConfig')" required>
          <JsonEditor
            v-model="form.configJson"
            :min-rows="10"
            :max-rows="20"
            placeholder='{"name":"...","level1Pattern":"...","level2Pattern":"...","level3Pattern":"...","level4Pattern":"...","headwordSeparator":"、"}'
          />
          <div class="form-tip">{{ $t('admin.taxonomy.formatConfigTip') }}</div>
        </el-form-item>

        <el-form-item :label="$t('admin.taxonomy.dictionaryFile')" required>
          <el-upload
            drag
            :auto-upload="false"
            :show-file-list="true"
            accept=".txt,.doc,.docx,.pdf"
            :limit="1"
            :on-change="handleFileChange"
            :on-remove="handleFileRemove"
            ref="uploadRef"
          >
            <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
            <div class="el-upload__text">{{ $t('admin.taxonomy.dragUpload') }} <em>(.txt / .doc / .docx / .pdf)</em></div>
            <template #tip>
              <div class="el-upload__tip">{{ $t('admin.taxonomy.fileTypes') }}</div>
            </template>
          </el-upload>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showUploadDialog = false">{{ $t('admin.taxonomy.cancel') }}</el-button>
        <el-button type="primary" :loading="uploading" @click="submitUpload">{{ $t('admin.taxonomy.startImport') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { UploadFilled } from '@element-plus/icons-vue'
import { useTaxonomyStore } from '@/stores/taxonomy'
import { createTaxonomySource } from '@/api/taxonomy'
import { getSampleConfigs, type SampleConfig } from '@/api/dictionaries'
import JsonEditor from '@/components/common/JsonEditor.vue'
import type { UploadFile, UploadInstance } from 'element-plus'
import { useI18n } from 'vue-i18n'

const store = useTaxonomyStore()
const router = useRouter()
const { t } = useI18n()

const showUploadDialog = ref(false)
const uploading = ref(false)
const uploadRef = ref<UploadInstance>()
const selectedFile = ref<File | null>(null)
const form = ref({ name: '', description: '', configJson: '' })

// Sample config selector
const sampleConfigs = ref<SampleConfig[]>([])
const selectedSample = ref<string | null>(null)

function statusType(status: string) {
  return (
    ({ ACTIVE: 'success', IMPORTING: 'warning', PENDING: 'info', FAILED: 'danger' } as Record<string, string>)[status] ?? 'info'
  )
}

function statusLabel(status: string) {
  return (
    t(`admin.taxonomy.statusLabels.${status}`) ?? status
  )
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('zh-CN')
}

async function openUploadDialog() {
  showUploadDialog.value = true
  // Load sample configs when opening dialog
  if (sampleConfigs.value.length === 0) {
    try {
      const configs = await getSampleConfigs()
      // Filter only taxonomy-related configs
      sampleConfigs.value = configs.filter(s => s.filename.includes('taxonomy'))
      // Auto-select and apply the first preset
      if (sampleConfigs.value.length > 0) {
        selectedSample.value = sampleConfigs.value[0].filename
        applySample()
      }
    } catch {
      sampleConfigs.value = []
    }
  }
}

function applySample() {
  const sample = sampleConfigs.value.find((s) => s.filename === selectedSample.value)
  if (!sample) {
    form.value.configJson = ''
    return
  }
  form.value.configJson = JSON.stringify(sample.config, null, 2)
}

function handleFileChange(file: UploadFile) {
  selectedFile.value = file.raw ?? null
}

function handleFileRemove() {
  selectedFile.value = null
}

async function submitUpload() {
  if (!form.value.name.trim()) {
    ElMessage.warning(t('admin.taxonomy.validation.nameRequired'))
    return
  }
  if (!form.value.configJson.trim()) {
    ElMessage.warning(t('admin.taxonomy.validation.configRequired'))
    return
  }
  if (!selectedFile.value) {
    ElMessage.warning(t('admin.taxonomy.validation.fileRequired'))
    return
  }

  let configParsed: unknown
  try {
    configParsed = JSON.parse(form.value.configJson)
  } catch {
    ElMessage.error(t('admin.taxonomy.validation.jsonInvalid'))
    return
  }

  uploading.value = true
  try {
    const fd = new FormData()
    fd.append('file', selectedFile.value)
    fd.append('name', form.value.name)
    if (form.value.description) fd.append('description', form.value.description)
    fd.append('config', JSON.stringify(configParsed))
    await createTaxonomySource(fd)
    ElMessage.success(t('admin.taxonomy.importSuccess'))
    showUploadDialog.value = false
    resetForm()
    await store.fetchSources()
  } catch (e: unknown) {
    ElMessage.error((e as Error).message ?? t('admin.taxonomy.importError'))
  } finally {
    uploading.value = false
  }
}

function resetForm() {
  form.value = { name: '', description: '', configJson: '' }
  selectedFile.value = null
  selectedSample.value = sampleConfigs.value[0]?.filename ?? null
  if (selectedSample.value) applySample()
  uploadRef.value?.clearFiles()
}

async function remove(id: string) {
  try {
    await store.removeSource(id)
    ElMessage.success(t('admin.taxonomy.deleteSuccess'))
  } catch (e: unknown) {
    ElMessage.error((e as Error).message ?? t('admin.taxonomy.deleteError'))
  }
}

async function reimport(id: string) {
  try {
    await store.reimportSource(id)
    ElMessage.success(t('admin.taxonomy.reimportSuccess'))
    await store.fetchSources()
  } catch (e: unknown) {
    ElMessage.error((e as Error).message ?? t('admin.taxonomy.reimportError'))
  }
}

function openEditor(id: string) {
  router.push(`/admin/taxonomy/${id}/edit`)
}

// Poll for status updates while any source is importing
let pollTimer: ReturnType<typeof setInterval> | null = null

function startPolling() {
  pollTimer = setInterval(async () => {
    const hasImporting = store.sources.some((s) => s.status === 'IMPORTING' || s.status === 'PENDING')
    if (hasImporting) await store.fetchSources()
  }, 3000)
}

onMounted(async () => {
  await store.fetchSources()
  startPolling()
})

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
})
</script>

<style scoped>
.form-tip {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
}
</style>
