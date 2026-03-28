<template>
  <div v-loading="loading">
    <div class="page-header">
      <div>
        <el-breadcrumb>
          <el-breadcrumb-item :to="{ path: '/admin/dictionaries' }">{{ $t('admin.dictionaryList.title') }}</el-breadcrumb-item>
          <el-breadcrumb-item>{{ dict?.name }}</el-breadcrumb-item>
        </el-breadcrumb>
        <h2>{{ dict?.name }}</h2>
        <p>{{ [dict?.publisher, dict?.language].filter(Boolean).join(' · ') }}</p>
      </div>
      <el-button type="primary" :icon="Plus" @click="versionDialogVisible = true">
        {{ $t('admin.dictionaryDetail.addVersion') }}
      </el-button>
    </div>

    <el-card>
      <template #header>{{ $t('admin.dictionaryDetail.versionList') }}</template>
      <el-table :data="dict?.versions ?? []" stripe>
        <el-table-column prop="label" :label="$t('admin.dictionaryDetail.versionLabel')" min-width="120">
          <template #default="{ row }">
            <RouterLink :to="`/admin/versions/${row.id}`" class="link">{{ row.label }}</RouterLink>
          </template>
        </el-table-column>
        <el-table-column prop="publishedYear" :label="$t('admin.dictionaryDetail.publishedYear')" width="100" />
        <el-table-column :label="$t('admin.dictionaryDetail.formatConfig')" width="120">
          <template #default="{ row }">
            <el-tag :type="configStatusType(row.formatConfig?.validationStatus)">
              {{ row.formatConfig?.validationStatus ?? $t('admin.versionDetail.notConfigured') }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="$t('admin.dictionaryDetail.entryCount')" width="90" align="center">
          <template #default="{ row }">
            <span v-if="row.entryCount != null">{{ row.entryCount }}</span>
            <span v-else style="color: #c0c4cc">—</span>
          </template>
        </el-table-column>
        <el-table-column prop="notes" :label="$t('admin.dictionaryDetail.notes')" />
        <el-table-column :label="$t('comparisons.actions')" width="100" fixed="right">
          <template #default="{ row }">
            <el-button text size="small" @click="router.push(`/admin/versions/${row.id}`)">
              {{ $t('admin.dictionaryDetail.details') }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- Add version dialog -->
    <el-dialog v-model="versionDialogVisible" :title="$t('admin.dictionaryDetail.addVersionTitle')" width="400px">
      <el-form ref="versionFormRef" :model="versionForm" :rules="versionRules" label-width="100px">
        <el-form-item :label="$t('admin.dictionaryDetail.versionLabel')" prop="label">
          <el-input v-model="versionForm.label" :placeholder="$t('admin.dictionaryDetail.versionLabelPlaceholder')" />
        </el-form-item>
        <el-form-item :label="$t('admin.dictionaryDetail.publishedYear')">
          <el-input-number v-model="versionForm.publishedYear" :min="1900" :max="2100" />
        </el-form-item>
        <el-form-item :label="$t('admin.dictionaryDetail.notes')">
          <el-input v-model="versionForm.notes" type="textarea" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="versionDialogVisible = false">{{ $t('admin.dictionaryList.cancel') }}</el-button>
        <el-button type="primary" :loading="submitting" @click="handleCreateVersion">{{ $t('admin.dictionaryList.create') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDictionariesStore } from '@/stores/dictionaries'
import { Plus } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { useI18n } from 'vue-i18n'

const route = useRoute()
const router = useRouter()
const store = useDictionariesStore()
const { t } = useI18n()

const loading = ref(false)
const dict = ref(store.selectedDictionary)
const versionDialogVisible = ref(false)
const submitting = ref(false)
const versionFormRef = ref<FormInstance>()
const versionForm = reactive({ label: '', publishedYear: new Date().getFullYear(), notes: '' })
const versionRules: FormRules = {
  label: [{ required: true, message: t('admin.dictionaryDetail.validation.labelRequired') }],
}

onMounted(async () => {
  loading.value = true
  dict.value = await store.fetchDictionary(route.params.id as string)
  loading.value = false
})

function configStatusType(status?: string) {
  if (status === 'VALID') return 'success'
  if (status === 'INVALID') return 'danger'
  return 'info'
}

async function handleCreateVersion() {
  if (!versionFormRef.value) return
  const valid = await versionFormRef.value.validate().catch(() => false)
  if (!valid) return

  submitting.value = true
  try {
    await store.addVersion(route.params.id as string, {
      label: versionForm.label,
      publishedYear: versionForm.publishedYear,
      notes: versionForm.notes,
    })
    ElMessage.success(t('admin.dictionaryDetail.createSuccess'))
    versionDialogVisible.value = false
    // Refresh
    dict.value = await store.fetchDictionary(route.params.id as string)
  } catch {
    ElMessage.error(t('admin.dictionaryDetail.createError'))
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
}
.link { color: var(--color-primary); text-decoration: none; }
</style>
