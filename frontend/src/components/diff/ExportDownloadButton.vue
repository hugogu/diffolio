<template>
  <span class="export-area">
    <el-popover placement="bottom-end" :width="360" trigger="click" v-model:visible="popoverVisible">
      <template #reference>
        <el-button
          type="primary"
          :loading="exporting || isWaiting"
          :disabled="disabled || isWaiting"
        >
          {{ isWaiting ? t('comparisons.exportDialog.generating') : t('comparisons.exportDialog.button') }}
        </el-button>
      </template>
      <el-form label-width="100px" size="small" style="margin-bottom: 8px">
        <el-form-item :label="t('comparisons.exportDialog.sortBy')">
          <el-radio-group v-model="exportOrder.orderBy">
            <el-radio value="alphabetical">{{ t('comparisons.exportDialog.alphabetical') }}</el-radio>
            <el-radio value="taxonomy">{{ t('comparisons.exportDialog.taxonomy') }}</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="exportOrder.orderBy === 'taxonomy' && props.taxonomySourceId" :label="t('comparisons.exportDialog.taxonomySource')">
          <span style="font-size: 13px; color: var(--el-text-color-regular)">
            {{ t('comparisons.exportDialog.useCurrentTaxonomy') }}
          </span>
        </el-form-item>
      </el-form>
      <div style="display: flex; justify-content: flex-end; gap: 8px">
        <el-button size="small" @click="popoverVisible = false">{{ t('comparisons.exportDialog.cancel') }}</el-button>
        <el-button
          type="primary"
          size="small"
          :disabled="exportOrder.orderBy === 'taxonomy' && !props.taxonomySourceId"
          @click="handleExport"
        >{{ t('comparisons.exportDialog.startExport') }}</el-button>
      </div>
    </el-popover>
    
    <!-- Download buttons -->
    <template v-if="exportData">
      <el-link
        type="success"
        :href="exportData.downloadUrl"
        :underline="'always'"
        style="margin-left: 8px"
        target="_blank"
      >
        Excel
      </el-link>
      <el-link
        v-if="exportData.csvDownloadUrl && isAdmin"
        type="info"
        :href="exportData.csvDownloadUrl"
        :underline="'always'"
        style="margin-left: 8px"
        target="_blank"
      >
        CSV
      </el-link>
    </template>
  </span>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { createExport, getLatestExport } from '@/api/comparisons'
import { useExportSocket } from '@/composables/useExportSocket'
import { useAuthStore } from '@/stores/auth'
import { ElMessage } from 'element-plus'

const { t } = useI18n()

const props = defineProps<{
  comparisonId: string
  disabled?: boolean
  senseChangeTypes?: string[]
  taxonomySourceId?: string | null
}>()

const authStore = useAuthStore()
const isAdmin = computed(() => authStore.user?.role === 'ADMIN')

const exporting = ref(false)
const popoverVisible = ref(false)
const exportOrder = ref<{ orderBy: 'alphabetical' | 'taxonomy'; taxonomySourceId: string | null }>({
  orderBy: 'alphabetical',
  taxonomySourceId: null,
})

interface ExportData {
  exportId: string
  comparisonId: string
  downloadUrl: string
  csvDownloadUrl?: string
  expiresAt: string
}

const exportData = ref<ExportData | null>(null)
const isWaiting = ref(false)

// Simple polling for export status
async function waitForExport(exportId: string) {
  isWaiting.value = true
  const maxAttempts = 60 // 2 minutes max
  let attempts = 0
  
  const checkStatus = async () => {
    try {
      const response = await fetch(`/api/v1/exports/${exportId}`)
      if (!response.ok) throw new Error('Failed to check export status')
      
      const data = await response.json()
      
      if (data.status === 'COMPLETED') {
        exportData.value = {
          exportId: data.id,
          comparisonId: data.comparisonId,
          downloadUrl: data.downloadUrl,
          csvDownloadUrl: data.downloadUrl + '?format=csv',
          expiresAt: data.expiresAt ?? '',
        }
        isWaiting.value = false
        ElMessage.success(t('comparisons.exportDialog.completed'))
        return
      } else if (data.status === 'FAILED') {
        isWaiting.value = false
ElMessage.error(t('comparisons.exportDialog.failed'))
        return
      }
      
      attempts++
      if (attempts < maxAttempts) {
        setTimeout(checkStatus, 2000)
      } else {
        isWaiting.value = false
        ElMessage.warning(t('comparisons.exportDialog.timeout'))
      }
    } catch (err) {
      console.error('Error checking export status:', err)
      isWaiting.value = false
      ElMessage.error(t('comparisons.exportDialog.checkStatusFailed'))
    }
  }
  
  checkStatus()
}

onMounted(async () => {
  try {
    const existing = await getLatestExport(props.comparisonId)
    if (existing?.downloadUrl) {
      exportData.value = {
        exportId: existing.id,
        comparisonId: existing.comparisonId,
        downloadUrl: existing.downloadUrl,
        csvDownloadUrl: existing.downloadUrl + '?format=csv',
        expiresAt: existing.expiresAt ?? '',
      }
    }
  } catch {
    // No existing export, silently ignore
  }
})

async function handleExport() {
  popoverVisible.value = false
  exporting.value = true
  try {
    const result = await createExport(
      props.comparisonId,
      props.senseChangeTypes?.length ? props.senseChangeTypes : undefined,
      exportOrder.value.orderBy,
      exportOrder.value.orderBy === 'taxonomy' ? (props.taxonomySourceId ?? undefined) : undefined
    ) as { id?: string }
    const exportId = result.id ?? ''
    if (exportId) {
      await waitForExport(exportId)
    } else {
      ElMessage.success(t('comparisons.exportDialog.submitted'))
    }
  } catch (err) {
    console.error('Export error:', err)
    ElMessage.error(t('comparisons.exportDialog.failed'))
  } finally {
    exporting.value = false
  }
}
</script>

<style scoped>
.export-area { display: inline-flex; align-items: center; }
</style>
