<template>
  <div class="page-shell">
    <div class="page-header">
      <div class="page-title-group">
        <h2 class="page-title">{{ $t('admin.systemConfigs.title') }}</h2>
      </div>
      <div class="page-actions">
        <ActionButton kind="admin" type="primary" :icon="Plus" :label="$t('admin.systemConfigs.newConfig')" @click="openCreateDialog" />
      </div>
    </div>

    <div class="toolbar">
      <el-input
        v-model="searchQuery"
        :placeholder="$t('admin.systemConfigs.searchConfig')"
        clearable
        style="width: 240px"
        @input="handleSearch"
      />
    </div>

    <el-table :data="configs" v-loading="loading" style="width: 100%">
      <el-table-column prop="name" :label="$t('common.name')" min-width="160" />
      <el-table-column prop="description" :label="$t('common.description')" min-width="200" show-overflow-tooltip />
      <el-table-column :label="$t('admin.systemConfigs.status')" width="110">
        <template #default="{ row }">
          <el-tag :type="statusTagType(row.validationStatus)" size="small">{{ row.validationStatus }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="$t('admin.systemConfigs.visibility')" width="130">
        <template #default="{ row }">
          <el-tag :type="row.visibility === 'ALL_USERS' ? 'success' : 'warning'" size="small">
            {{ row.visibility === 'ALL_USERS' ? $t('admin.systemConfigs.allUsers') : $t('admin.systemConfigs.specificUsers') }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="$t('common.email')" width="150" show-overflow-tooltip>
        <template #default="{ row }">{{ row.createdBy?.email }}</template>
      </el-table-column>
      <el-table-column :label="$t('comparisons.actions')" width="156" fixed="right" align="right" header-align="right">
        <template #default="{ row }">
          <div class="table-actions is-admin">
            <ActionButton kind="admin" :icon="Edit" :label="$t('admin.systemConfigs.edit')" @click="openEditDialog(row.id)" />
            <ActionButton kind="admin" type="warning" :icon="Setting" :label="$t('admin.systemConfigs.visibility')" @click="openVisibilityDialog(row.id)" />
            <ActionButton kind="admin" type="danger" :icon="Delete" :label="$t('admin.systemConfigs.delete')" @click="handleDelete(row.id, row.name)" />
          </div>
        </template>
      </el-table-column>
    </el-table>

    <div class="pagination-bar">
      <el-pagination
        v-model:current-page="currentPage"
        :page-size="pageSize"
        :total="total"
        layout="total, prev, pager, next"
        @current-change="loadConfigs"
      />
    </div>

    <!-- Create / Edit dialog -->
    <el-dialog
      v-model="editDialogVisible"
      :title="editingId ? $t('admin.systemConfigs.edit') : $t('admin.systemConfigs.newConfig')"
      width="700px"
      :close-on-click-modal="false"
    >
      <el-form :model="editForm" label-position="top">
        <el-form-item :label="$t('common.name')" required>
          <el-input v-model="editForm.name" />
        </el-form-item>
        <el-form-item :label="$t('common.description')">
          <el-input v-model="editForm.description" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item :label="$t('admin.systemConfigs.visibility')">
          <el-radio-group v-model="editForm.visibility">
            <el-radio value="ALL_USERS">{{ $t('admin.systemConfigs.allUsers') }}</el-radio>
            <el-radio value="SPECIFIC_USERS">{{ $t('admin.systemConfigs.specificUsers') }}</el-radio>
          </el-radio-group>
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

    <!-- Visibility dialog -->
    <el-dialog v-model="visibilityDialogVisible" :title="$t('admin.systemConfigs.visibility')" width="500px" :close-on-click-modal="false">
      <div v-loading="loadingVisibility">
        <el-form label-width="110px">
          <el-form-item :label="$t('admin.systemConfigs.visibility')">
            <el-radio-group v-model="visibilityForm.visibility">
              <el-radio value="ALL_USERS">{{ $t('admin.systemConfigs.allUsers') }}</el-radio>
              <el-radio value="SPECIFIC_USERS">{{ $t('admin.systemConfigs.specificUsers') }}</el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item v-if="visibilityForm.visibility === 'SPECIFIC_USERS'" :label="$t('admin.systemConfigs.userIds')">
            <el-input
              v-model="visibilityForm.userIdsText"
              type="textarea"
              :rows="6"
              :placeholder="$t('admin.systemConfigs.userIdsPlaceholder')"
            />
            <div class="help-text">{{ $t('admin.systemConfigs.currentAllowedUsers') }}</div>
          </el-form-item>
        </el-form>
        <div v-if="currentAllowedUsers.length > 0" class="allowed-users">
          <div class="allowed-users-label">{{ $t('admin.systemConfigs.currentAllowedUsers') }}：</div>
          <el-tag
            v-for="u in currentAllowedUsers"
            :key="u.user.id"
            size="small"
            style="margin: 2px"
          >
            {{ u.user.email }}
          </el-tag>
        </div>
      </div>
      <template #footer>
        <el-button @click="visibilityDialogVisible = false">{{ $t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="savingVisibility" @click="handleSaveVisibility">{{ $t('common.save') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Plus, Edit, Delete, Setting } from '@element-plus/icons-vue'
import { ElMessageBox, ElMessage } from 'element-plus'
import {
  listAdminSystemConfigs,
  createSystemConfig,
  getAdminSystemConfig,
  updateSystemConfig,
  deleteSystemConfig,
  updateSystemConfigVisibility,
  type SystemConfig,
} from '@/api/configs'
import JsonEditor from '@/components/common/JsonEditor.vue'
import { useI18n } from 'vue-i18n'
import ActionButton from '@/components/common/ActionButton.vue'

const { t } = useI18n()

const loading = ref(false)
const configs = ref<(SystemConfig & { createdBy: { id: string; email: string } })[]>([])
const total = ref(0)
const currentPage = ref(1)
const pageSize = 20
const searchQuery = ref('')

// Edit dialog
const editDialogVisible = ref(false)
const editingId = ref<string | null>(null)
const saving = ref(false)
const editErrors = ref<string[]>([])
const editForm = ref({ name: '', description: '', configJson: '{}', visibility: 'ALL_USERS' as 'ALL_USERS' | 'SPECIFIC_USERS' })

// Visibility dialog
const visibilityDialogVisible = ref(false)
const visibilityConfigId = ref<string | null>(null)
const loadingVisibility = ref(false)
const savingVisibility = ref(false)
const currentAllowedUsers = ref<{ user: { id: string; email: string } }[]>([])
const visibilityForm = ref({ visibility: 'ALL_USERS' as 'ALL_USERS' | 'SPECIFIC_USERS', userIdsText: '' })

onMounted(loadConfigs)

async function loadConfigs() {
  loading.value = true
  try {
    const result = await listAdminSystemConfigs({
      page: currentPage.value,
      pageSize,
      search: searchQuery.value || undefined,
    })
    configs.value = result.data
    total.value = result.total
  } finally {
    loading.value = false
  }
}

let searchTimer: ReturnType<typeof setTimeout> | null = null
function handleSearch() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    currentPage.value = 1
    loadConfigs()
  }, 300)
}

function statusTagType(status: string) {
  if (status === 'VALID') return 'success'
  if (status === 'INVALID') return 'danger'
  return 'info'
}

function openCreateDialog() {
  editingId.value = null
  editForm.value = { name: '', description: '', configJson: '{}', visibility: 'ALL_USERS' }
  editErrors.value = []
  editDialogVisible.value = true
}

async function openEditDialog(id: string) {
  editingId.value = id
  editErrors.value = []
  try {
    const config = await getAdminSystemConfig(id)
    editForm.value = {
      name: config.name,
      description: config.description ?? '',
      configJson: JSON.stringify(config.configJson, null, 2),
      visibility: config.visibility,
    }
    editDialogVisible.value = true
  } catch {
    ElMessage.error(t('admin.systemConfigs.loadError'))
  }
}

async function handleSave() {
  if (!editForm.value.name.trim()) {
    ElMessage.warning(t('admin.systemConfigs.validation.nameRequired'))
    return
  }
  let configJson: Record<string, unknown>
  try {
    configJson = JSON.parse(editForm.value.configJson)
  } catch {
    ElMessage.error(t('admin.systemConfigs.validation.jsonInvalid'))
    return
  }
  saving.value = true
  editErrors.value = []
  try {
    if (editingId.value) {
      await updateSystemConfig(editingId.value, {
        name: editForm.value.name,
        description: editForm.value.description || undefined,
        configJson,
        visibility: editForm.value.visibility,
      })
    } else {
      await createSystemConfig({
        name: editForm.value.name,
        description: editForm.value.description || undefined,
        configJson,
        visibility: editForm.value.visibility,
      })
    }
    editDialogVisible.value = false
    ElMessage.success(t('admin.systemConfigs.saveSuccess'))
    await loadConfigs()
  } catch (e: unknown) {
    const apiErr = e as { details?: { errors?: string[] } }
    editErrors.value = apiErr.details?.errors ?? [(e instanceof Error ? e.message : t('admin.systemConfigs.saveError'))]
  } finally {
    saving.value = false
  }
}

async function handleDelete(id: string, name: string) {
  try {
    await ElMessageBox.confirm(
      t('admin.systemConfigs.deleteConfirm', { name }),
      t('admin.systemConfigs.deleteTitle'),
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
    await deleteSystemConfig(id)
    ElMessage.success(t('admin.systemConfigs.deleteSuccess'))
    await loadConfigs()
  } catch {
    ElMessage.error(t('admin.systemConfigs.deleteError'))
  }
}

async function openVisibilityDialog(id: string) {
  visibilityConfigId.value = id
  loadingVisibility.value = true
  visibilityDialogVisible.value = true
  currentAllowedUsers.value = []
  try {
    const config = await getAdminSystemConfig(id)
    visibilityForm.value = {
      visibility: config.visibility,
      userIdsText: config.allowedUsers.map((u) => u.user.id).join('\n'),
    }
    currentAllowedUsers.value = config.allowedUsers
  } catch {
    ElMessage.error(t('admin.systemConfigs.visibilityLoadError'))
    visibilityDialogVisible.value = false
  } finally {
    loadingVisibility.value = false
  }
}

async function handleSaveVisibility() {
  if (!visibilityConfigId.value) return
  const userIds = visibilityForm.value.userIdsText
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)

  savingVisibility.value = true
  try {
    await updateSystemConfigVisibility(visibilityConfigId.value, {
      visibility: visibilityForm.value.visibility,
      userIds: visibilityForm.value.visibility === 'SPECIFIC_USERS' ? userIds : [],
    })
    visibilityDialogVisible.value = false
    ElMessage.success(t('admin.systemConfigs.visibilityUpdateSuccess'))
    await loadConfigs()
  } catch {
    ElMessage.error(t('admin.systemConfigs.visibilityUpdateError'))
  } finally {
    savingVisibility.value = false
  }
}
</script>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}
.pagination-bar {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
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
  font-family: var(--app-font-family-mono);
  padding: 2px 0;
}
.help-text {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
}
.allowed-users {
  margin-top: 12px;
}
.allowed-users-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 6px;
}
</style>
