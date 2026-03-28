<template>
  <div>
    <div class="page-header">
      <h2>{{ $t('admin.configManagement.title') }}</h2>
      <el-button type="primary" :icon="Plus" @click="openCreateDialog">{{ $t('admin.configManagement.newConfig') }}</el-button>
    </div>
    <p class="page-desc">{{ $t('admin.configManagement.description') }}</p>

    <el-tabs v-model="activeTab">
      <!-- User Configs Tab -->
      <el-tab-pane :label="$t('admin.configManagement.userConfigs')" name="user">

        <el-table :data="configsStore.userConfigs" v-loading="loadingUser" style="width: 100%">
          <el-table-column prop="name" :label="$t('common.name')" min-width="160" />
          <el-table-column prop="description" :label="$t('common.description')" min-width="200" show-overflow-tooltip />
          <el-table-column :label="$t('admin.systemConfigs.status')" width="110">
            <template #default="{ row }">
              <el-tag :type="statusTagType(row.validationStatus)" size="small">
                {{ row.validationStatus }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column :label="$t('admin.configManagement.cloned')" width="110">
            <template #default="{ row }">
              <el-tag v-if="row.clonedFromId" type="info" size="small">{{ $t('admin.configManagement.cloned') }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column :label="$t('common.updatedAt')" width="150">
            <template #default="{ row }">{{ formatDate(row.updatedAt) }}</template>
          </el-table-column>
          <el-table-column :label="$t('comparisons.actions')" width="160" fixed="right">
            <template #default="{ row }">
              <el-button size="small" @click="openEditDialog(row.id)">{{ $t('admin.systemConfigs.edit') }}</el-button>
              <el-button size="small" type="danger" @click="handleDelete(row.id, row.name)">{{ $t('admin.systemConfigs.delete') }}</el-button>
            </template>
          </el-table-column>
        </el-table>
        <el-empty v-if="!loadingUser && configsStore.userConfigs.length === 0" :description="$t('admin.configManagement.noUserConfigs')" />
      </el-tab-pane>

      <!-- System Configs Tab -->
      <el-tab-pane :label="$t('admin.configManagement.systemConfigs')" name="system">
        <el-table :data="configsStore.systemConfigs" v-loading="loadingSystem" style="width: 100%">
          <el-table-column prop="name" :label="$t('common.name')" min-width="160" />
          <el-table-column prop="description" :label="$t('common.description')" min-width="200" show-overflow-tooltip />
          <el-table-column :label="$t('admin.systemConfigs.status')" width="110">
            <template #default="{ row }">
              <el-tag :type="statusTagType(row.validationStatus)" size="small">
                {{ row.validationStatus }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column :label="$t('admin.systemConfigs.visibility')" width="120">
            <template #default="{ row }">
              <el-tag :type="row.visibility === 'ALL_USERS' ? 'success' : 'warning'" size="small">
                {{ row.visibility === 'ALL_USERS' ? $t('common.all') : $t('common.specific') }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column :label="$t('comparisons.actions')" width="160" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" size="small" @click="openViewDialog(row.id)">{{ $t('admin.configManagement.view') }}</el-button>
            </template>
          </el-table-column>
        </el-table>
        <el-empty v-if="!loadingSystem && configsStore.systemConfigs.length === 0" :description="$t('admin.configManagement.noSystemConfigs')" />
      </el-tab-pane>
    </el-tabs>

    <!-- Create / Edit dialog -->
    <el-dialog
      v-model="editDialogVisible"
      :title="editingId ? $t('admin.configManagement.editTitle') : $t('admin.configManagement.createTitle')"
      width="700px"
      :close-on-click-modal="false"
    >
      <el-form :model="editForm" label-position="top">
        <el-form-item :label="$t('common.name')" required>
          <el-input v-model="editForm.name" :placeholder="$t('admin.configManagement.namePlaceholder')" />
        </el-form-item>
        <el-form-item :label="$t('common.description')">
          <el-input v-model="editForm.description" type="textarea" :rows="2" :placeholder="$t('admin.configManagement.descriptionPlaceholder')" />
        </el-form-item>
        <el-form-item :label="$t('admin.systemConfigs.configJson')">
          <JsonEditor v-model="editForm.configJson" :min-rows="14" :max-rows="30" />
        </el-form-item>
        <div v-if="editErrors.length > 0" class="validation-errors">
          <div v-for="(err, i) in editErrors" :key="i" class="validation-error">{{ err }}</div>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="editDialogVisible = false">{{ $t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">{{ $t('common.save') }}</el-button>
      </template>
    </el-dialog>

    <!-- View system config dialog -->
    <el-dialog
      v-model="viewDialogVisible"
      :title="viewingConfig?.name ?? $t('admin.configManagement.view')"
      width="700px"
    >
      <div v-if="viewingConfig">
        <p v-if="viewingConfig.description" class="view-description">{{ viewingConfig.description }}</p>
        <JsonEditor :model-value="JSON.stringify(viewingConfig.configJson, null, 2)" :min-rows="14" :max-rows="30" readonly />
      </div>
      <template #footer>
        <el-button @click="viewDialogVisible = false">{{ $t('common.close') }}</el-button>
        <el-button type="primary" :loading="cloning" @click="handleClone">{{ $t('admin.configManagement.clone') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Plus } from '@element-plus/icons-vue'
import { ElMessageBox, ElMessage } from 'element-plus'
import { useConfigsStore } from '@/stores/configs'
import { getUserConfig, getSystemConfig, type SystemConfigDetail } from '@/api/configs'
import JsonEditor from '@/components/common/JsonEditor.vue'
import { useI18n } from 'vue-i18n'

const configsStore = useConfigsStore()
const { t } = useI18n()

const activeTab = ref('user')
const loadingUser = ref(false)
const loadingSystem = ref(false)

// Edit / create dialog
const editDialogVisible = ref(false)
const editingId = ref<string | null>(null)
const saving = ref(false)
const editErrors = ref<string[]>([])
const editForm = ref({ name: '', description: '', configJson: '{}' })

// View system config dialog
const viewDialogVisible = ref(false)
const viewingConfig = ref<SystemConfigDetail | null>(null)
const cloning = ref(false)

onMounted(async () => {
  loadingUser.value = true
  loadingSystem.value = true
  await Promise.all([
    configsStore.loadUserConfigs().finally(() => { loadingUser.value = false }),
    configsStore.loadSystemConfigs().finally(() => { loadingSystem.value = false }),
  ])
})

function statusTagType(status: string) {
  if (status === 'VALID') return 'success'
  if (status === 'INVALID') return 'danger'
  return 'info'
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('zh-CN', { dateStyle: 'short', timeStyle: 'short' })
}

function openCreateDialog() {
  editingId.value = null
  editForm.value = { name: '', description: '', configJson: '{}' }
  editErrors.value = []
  editDialogVisible.value = true
}

async function openEditDialog(id: string) {
  editingId.value = id
  editErrors.value = []
  try {
    const config = await getUserConfig(id)
    editForm.value = {
      name: config.name,
      description: config.description ?? '',
      configJson: JSON.stringify(config.configJson, null, 2),
    }
    editDialogVisible.value = true
  } catch {
    ElMessage.error(t('admin.configManagement.loadError'))
  }
}

async function handleSave() {
  if (!editForm.value.name.trim()) {
    ElMessage.warning(t('admin.configManagement.validation.nameRequired'))
    return
  }
  let configJson: Record<string, unknown>
  try {
    configJson = JSON.parse(editForm.value.configJson)
  } catch {
    ElMessage.error(t('admin.configManagement.validation.jsonInvalid'))
    return
  }
  saving.value = true
  editErrors.value = []
  try {
    if (editingId.value) {
      await configsStore.updateConfig(editingId.value, {
        name: editForm.value.name,
        description: editForm.value.description || undefined,
        configJson,
      })
    } else {
      await configsStore.createConfig({
        name: editForm.value.name,
        description: editForm.value.description || undefined,
        configJson,
      })
    }
    editDialogVisible.value = false
    ElMessage.success(t('admin.configManagement.saveSuccess'))
  } catch (e: unknown) {
    const apiErr = e as { details?: { errors?: string[] } }
    editErrors.value = apiErr.details?.errors ?? [(e instanceof Error ? e.message : t('admin.configManagement.saveError'))]
  } finally {
    saving.value = false
  }
}

async function handleDelete(id: string, name: string) {
  try {
    await ElMessageBox.confirm(
      t('admin.configManagement.deleteConfirm', { name }),
      t('admin.configManagement.deleteTitle'),
      {
        type: 'warning',
        confirmButtonText: t('admin.systemConfigs.deleteConfirmButton'),
        cancelButtonText: t('common.cancel'),
      }
    )
  } catch {
    return
  }
  try {
    await configsStore.deleteConfig(id)
    ElMessage.success(t('admin.configManagement.deleteSuccess'))
  } catch {
    ElMessage.error(t('admin.configManagement.deleteError'))
  }
}

async function openViewDialog(id: string) {
  viewingConfig.value = null
  viewDialogVisible.value = true
  try {
    viewingConfig.value = await getSystemConfig(id)
  } catch {
    ElMessage.error(t('admin.configManagement.loadError'))
    viewDialogVisible.value = false
  }
}

async function handleClone() {
  if (!viewingConfig.value) return
  cloning.value = true
  try {
    await configsStore.cloneConfig(viewingConfig.value.id)
    viewDialogVisible.value = false
    activeTab.value = 'user'
    ElMessage.success(t('admin.configManagement.cloneSuccess'))
  } catch {
    ElMessage.error(t('admin.configManagement.cloneError'))
  } finally {
    cloning.value = false
  }
}
</script>

<style scoped>
.page-header {
  margin-bottom: 4px;
}
.page-desc {
  color: var(--el-text-color-secondary);
  font-size: 13px;
  margin-bottom: 16px;
}
.validation-errors {
  margin-top: 8px;
  padding: 8px 12px;
  background: var(--el-color-danger-light-9);
  border-radius: 4px;
}
.validation-error {
  font-size: 12px;
  color: var(--el-color-danger);
  font-family: monospace;
  padding: 2px 0;
}
.view-description {
  color: var(--el-text-color-secondary);
  font-size: 13px;
  margin-bottom: 12px;
}
</style>
