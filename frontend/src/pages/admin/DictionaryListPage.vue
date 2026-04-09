<template>
  <div class="page-shell">
    <div class="page-header">
      <div class="page-title-group">
        <h2 class="page-title">{{ $t('admin.dictionaryList.title') }}</h2>
      </div>
      <div class="page-actions">
        <ActionButton
          kind="admin"
          type="primary"
          :icon="Plus"
          :label="$t('admin.dictionaryList.newDictionary')"
          @click="dialogVisible = true"
        />
      </div>
    </div>

    <el-card class="page-card">
      <el-table
        ref="tableRef"
        :data="store.dictionaries"
        v-loading="loading"
        stripe
        row-key="id"
        :expand-row-keys="expandedRowKeys"
      >
        <el-table-column type="expand" width="1" class-name="expand-proxy-column">
          <template #default="{ row }">
            <div class="dictionary-versions-panel">
              <div class="dictionary-versions-header">
                <div class="dictionary-versions-title">
                  {{ row.name }} · {{ $t('admin.dictionaryDetail.versionList') }}
                </div>
                <ActionButton
                  kind="admin"
                  type="primary"
                  :icon="Plus"
                  :label="$t('admin.dictionaryDetail.addVersion')"
                  @click="openVersionDialog(row)"
                />
              </div>

              <div v-if="loadingVersions[row.id]" class="version-loading">{{ $t('common.loading') }}</div>
              <el-table
                v-else-if="versionMap[row.id]?.length"
                :data="versionMap[row.id]"
                stripe
                size="small"
                class="version-table"
              >
                <el-table-column prop="label" :label="$t('admin.dictionaryDetail.versionLabel')" min-width="150">
                  <template #default="{ row: version }">
                    <button
                      class="link link-button"
                      type="button"
                      @click="router.push(`/admin/versions/${version.id}`)"
                    >
                      {{ version.label }}
                    </button>
                  </template>
                </el-table-column>
                <el-table-column prop="publishedYear" :label="$t('admin.dictionaryDetail.publishedYear')" width="110" />
                 <el-table-column :label="$t('admin.dictionaryDetail.formatConfig')" width="140">
                   <template #default="{ row: version }">
                     <el-tag :type="configStatusType(version.formatConfig?.validationStatus)">
                       {{ version.formatConfig?.validationStatus ? t('admin.versionDetail.statusLabels.' + version.formatConfig.validationStatus) : $t('admin.versionDetail.notConfigured') }}
                     </el-tag>
                   </template>
                 </el-table-column>
                <el-table-column :label="$t('admin.dictionaryDetail.entryCount')" width="100" align="center">
                  <template #default="{ row: version }">
                    <span v-if="version.entryCount != null">{{ version.entryCount }}</span>
                    <span v-else class="version-placeholder">—</span>
                  </template>
                </el-table-column>
                <el-table-column prop="notes" :label="$t('admin.dictionaryDetail.notes')" min-width="180" show-overflow-tooltip />
                <el-table-column :label="$t('comparisons.actions')" width="72" fixed="right" align="right" header-align="right">
                  <template #default="{ row: version }">
                    <div class="table-actions is-admin">
                      <ActionButton
                        kind="admin"
                        :icon="View"
                        :label="$t('admin.dictionaryDetail.details')"
                        @click="router.push(`/admin/versions/${version.id}`)"
                      />
                    </div>
                  </template>
                </el-table-column>
              </el-table>
              <el-empty v-else :image-size="48" :description="$t('admin.dictionaryDetail.versionList')" />
            </div>
          </template>
        </el-table-column>

        <el-table-column prop="name" :label="$t('admin.dictionaryList.name')" min-width="180">
          <template #default="{ row }">
            <button class="link link-button" type="button" @click="router.push(`/admin/dictionaries/${row.id}`)">
              {{ row.name }}
            </button>
          </template>
        </el-table-column>
        <el-table-column prop="publisher" :label="$t('admin.dictionaryList.publisher')" min-width="150" />
        <el-table-column prop="language" :label="$t('admin.dictionaryList.language')" width="100" />
        <el-table-column prop="versionCount" :label="$t('admin.dictionaryList.versionCount')" width="100" align="center" />
        <el-table-column :label="$t('common.createdAt')" width="160">
          <template #default="{ row }">
            {{ new Date(row.createdAt).toLocaleDateString('zh-CN') }}
          </template>
        </el-table-column>
        <el-table-column :label="$t('comparisons.actions')" width="72" fixed="right" align="right" header-align="right">
          <template #default="{ row }">
            <div class="table-actions is-admin">
              <ActionButton
                kind="admin"
                :icon="expandedRowKeys.includes(row.id) ? ArrowDownBold : ArrowRightBold"
                :label="expandedRowKeys.includes(row.id) ? $t('common.collapse') : $t('common.expand')"
                @click="toggleExpanded(row)"
              />
            </div>
          </template>
        </el-table-column>
      </el-table>

      <div v-if="store.hasMore" class="page-pagination">
        <el-button :loading="loadingMore" @click="loadMore">{{ $t('common.loadMore') }}</el-button>
      </div>
    </el-card>

    <el-dialog v-model="dialogVisible" :title="$t('admin.dictionaryList.createTitle')" width="500px" @close="resetForm">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="140px">
        <el-form-item :label="$t('admin.dictionaryList.name')" prop="name">
          <el-input v-model="form.name" :placeholder="$t('admin.dictionaryList.name')" />
        </el-form-item>
        <el-form-item :label="$t('admin.dictionaryList.publisher')">
          <el-input v-model="form.publisher" :placeholder="$t('admin.dictionaryList.publisherPlaceholder')" />
        </el-form-item>
        <el-form-item :label="$t('admin.dictionaryList.language')" prop="language">
          <el-select v-model="form.language" style="width: 100%">
            <el-option :label="$t('admin.dictionaryList.languages.zh')" value="zh" />
            <el-option :label="$t('admin.dictionaryList.languages.en')" value="en" />
            <el-option :label="$t('admin.dictionaryList.languages.ja')" value="ja" />
          </el-select>
        </el-form-item>
        <el-form-item :label="$t('common.description')">
          <el-input v-model="form.description" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">{{ $t('admin.dictionaryList.cancel') }}</el-button>
        <el-button type="primary" :loading="submitting" @click="handleCreate">{{ $t('admin.dictionaryList.create') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="versionDialogVisible"
      :title="selectedDictionaryName ? `${$t('admin.dictionaryDetail.addVersionTitle')} · ${selectedDictionaryName}` : $t('admin.dictionaryDetail.addVersionTitle')"
      width="420px"
      @close="resetVersionForm"
    >
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
        <el-button type="primary" :loading="submittingVersion" @click="handleCreateVersion">{{ $t('admin.dictionaryList.create') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules, TableInstance } from 'element-plus'
import { ArrowDownBold, ArrowRightBold, Plus, View } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import ActionButton from '@/components/common/ActionButton.vue'
import { getDictionary, type Dictionary, type DictionaryVersion } from '@/api/dictionaries'
import { useDictionariesStore } from '@/stores/dictionaries'

const router = useRouter()
const store = useDictionariesStore()
const { t } = useI18n()

const loading = ref(false)
const loadingMore = ref(false)
const dialogVisible = ref(false)
const submitting = ref(false)
const formRef = ref<FormInstance>()

const versionDialogVisible = ref(false)
const submittingVersion = ref(false)
const versionFormRef = ref<FormInstance>()
const selectedDictionaryId = ref('')
const selectedDictionaryName = ref('')

const tableRef = ref<TableInstance>()
const expandedRowKeys = ref<string[]>([])
const versionMap = ref<Record<string, DictionaryVersion[]>>({})
const loadingVersions = ref<Record<string, boolean>>({})

const form = reactive({
  name: '',
  publisher: '',
  language: 'zh',
  description: '',
})

const versionForm = reactive({
  label: '',
  publishedYear: new Date().getFullYear(),
  notes: '',
})

const rules: FormRules = {
  name: [{ required: true, message: t('admin.dictionaryList.validation.nameRequired') }],
}

const versionRules: FormRules = {
  label: [{ required: true, message: t('admin.dictionaryDetail.validation.labelRequired') }],
}

onMounted(async () => {
  loading.value = true
  await store.fetchDictionaries()
  loading.value = false
})

async function loadMore() {
  loadingMore.value = true
  await store.fetchDictionaries(store.nextCursor ?? undefined)
  loadingMore.value = false
}

async function ensureVersions(dictionaryId: string, force = false) {
  if (!force && (versionMap.value[dictionaryId] || loadingVersions.value[dictionaryId])) return

  loadingVersions.value = { ...loadingVersions.value, [dictionaryId]: true }
  try {
    const dictionary = await getDictionary(dictionaryId)
    versionMap.value = {
      ...versionMap.value,
      [dictionaryId]: dictionary.versions,
    }
  } finally {
    loadingVersions.value = { ...loadingVersions.value, [dictionaryId]: false }
  }
}

async function toggleExpanded(row: Dictionary) {
  const isExpanded = expandedRowKeys.value.includes(row.id)
  if (isExpanded) {
    expandedRowKeys.value = expandedRowKeys.value.filter((id) => id !== row.id)
    return
  }

  await ensureVersions(row.id)
  expandedRowKeys.value = [...expandedRowKeys.value, row.id]
  tableRef.value?.setScrollTop?.(0)
}

function openVersionDialog(row: Dictionary) {
  selectedDictionaryId.value = row.id
  selectedDictionaryName.value = row.name
  versionDialogVisible.value = true
}

function configStatusType(status?: string) {
  if (status === 'VALID') return 'success'
  if (status === 'INVALID') return 'danger'
  return 'info'
}

function resetForm() {
  form.name = ''
  form.publisher = ''
  form.language = 'zh'
  form.description = ''
}

function resetVersionForm() {
  versionForm.label = ''
  versionForm.publishedYear = new Date().getFullYear()
  versionForm.notes = ''
  selectedDictionaryId.value = ''
  selectedDictionaryName.value = ''
}

async function handleCreate() {
  if (!formRef.value) return
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  submitting.value = true
  try {
    await store.addDictionary({ ...form })
    ElMessage.success(t('admin.dictionaryList.createSuccess'))
    dialogVisible.value = false
    resetForm()
  } catch {
    ElMessage.error(t('admin.dictionaryList.createError'))
  } finally {
    submitting.value = false
  }
}

async function handleCreateVersion() {
  if (!versionFormRef.value || !selectedDictionaryId.value) return
  const valid = await versionFormRef.value.validate().catch(() => false)
  if (!valid) return

  submittingVersion.value = true
  try {
    await store.addVersion(selectedDictionaryId.value, {
      label: versionForm.label,
      publishedYear: versionForm.publishedYear,
      notes: versionForm.notes,
    })

    await ensureVersions(selectedDictionaryId.value, true)

    const dictionary = store.dictionaries.find((item) => item.id === selectedDictionaryId.value)
    if (dictionary) {
      dictionary.versionCount = versionMap.value[selectedDictionaryId.value]?.length ?? (dictionary.versionCount ?? 0) + 1
      if (!expandedRowKeys.value.includes(dictionary.id)) {
        expandedRowKeys.value = [...expandedRowKeys.value, dictionary.id]
      }
    }

    ElMessage.success(t('admin.dictionaryDetail.createSuccess'))
    versionDialogVisible.value = false
    resetVersionForm()
  } catch {
    ElMessage.error(t('admin.dictionaryDetail.createError'))
  } finally {
    submittingVersion.value = false
  }
}
</script>

<style scoped>
.link {
  color: var(--color-primary);
  text-decoration: none;
}

.link-button {
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  font: inherit;
}

.dictionary-versions-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 8px 0;
}

.dictionary-versions-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.dictionary-versions-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.version-table {
  width: 100%;
}

.version-loading {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.version-placeholder {
  color: var(--el-text-color-placeholder);
}

:deep(.expand-proxy-column .cell) {
  padding: 0 !important;
}

:deep(.expand-proxy-column) {
  width: 1px !important;
}

@media (max-width: 768px) {
  .dictionary-versions-header {
    align-items: flex-start;
  }
}
</style>
