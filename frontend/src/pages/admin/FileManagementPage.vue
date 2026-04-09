<template>
  <div class="file-management-page page-shell">
    <div class="page-header">
      <div class="page-title-group">
        <h1 class="page-title">{{ $t('admin.fileManagement.title') }}</h1>
      </div>
    </div>
    
    <el-tabs v-model="activeTab" @tab-change="handleTabChange">
      <!-- File Management Tab -->
      <el-tab-pane :label="$t('admin.fileManagement.files')" name="files">
        <!-- Filters -->
        <div class="filter-bar filter-toolbar">
          <el-select
            v-model="filterUserId"
            :placeholder="$t('admin.fileManagement.selectUser')"
            clearable
            style="width: 220px"
            @change="handleFilterChange"
          >
            <el-option
              v-for="user in userOptions"
              :key="user.id"
              :label="user.email"
              :value="user.id"
            />
          </el-select>
          
          <el-select
            v-model="filterFileType"
            :placeholder="$t('admin.fileManagement.fileType')"
            clearable
            style="width: 180px; margin-left: 10px"
            @change="handleFilterChange"
          >
            <el-option label="TXT" value="TXT" />
            <el-option label="DOC" value="DOC" />
            <el-option label="DOCX" value="DOCX" />
            <el-option label="PDF" value="PDF" />
          </el-select>
          
          <el-input
            v-model="filterSearch"
            :placeholder="$t('admin.fileManagement.searchFile')"
            style="width: 200px; margin-left: 10px"
            clearable
            @keyup.enter="handleFilterChange"
            @clear="handleFilterChange"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>

          <el-select
            v-model="filterUnreferenced"
            :placeholder="$t('admin.fileManagement.referenceStatus')"
            clearable
            style="width: 160px; margin-left: 10px"
            @change="handleFilterChange"
          >
            <el-option :label="$t('admin.fileManagement.allReferenceStates')" value="" />
            <el-option :label="$t('admin.fileManagement.unreferencedOnly')" value="true" />
            <el-option :label="$t('admin.fileManagement.referencedOnly')" value="false" />
          </el-select>
        </div>

        <!-- Action buttons -->
        <div class="action-bar action-toolbar">
          <span class="selection-summary muted-text compact-text">
            {{ selectedFiles.length > 0 ? `${selectedFiles.length} ${$t('common.selected')}` : $t('common.actions') }}
          </span>
          <div class="table-actions is-admin">
            <ActionButton
              kind="admin"
              type="primary"
              :icon="Download"
              :label="$t('admin.fileManagement.downloadSelected')"
              :disabled="selectedFiles.length === 0"
              @click="handleDownloadSelected"
            />
            <ActionButton
              kind="admin"
              type="danger"
              :icon="Delete"
              :label="$t('admin.fileManagement.deleteSelected')"
              :disabled="selectedFiles.length === 0"
              @click="handleDeleteSelected"
            />
          </div>
        </div>

        <!-- File list table -->
        <SortableTable
          :columns="fileColumns"
          :data="fileList"
          :loading="loading"
          selectable
          @sort-change="handleSortChange"
          @selection-change="handleSelectionChange"
        />

        <!-- Pagination -->
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :total="total"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next"
          style="margin-top: 15px; justify-content: flex-end"
          @change="handlePaginationChange"
        />
      </el-tab-pane>
      
      <!-- User Stats Tab -->
      <el-tab-pane :label="$t('admin.fileManagement.userStats')" name="stats">
        <SortableTable
          :columns="statsColumns"
          :data="userStats"
          :loading="statsLoading"
          @sort-change="handleStatsSortChange"
        />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, toRefs } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Download, Delete } from '@element-plus/icons-vue'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import SortableTable from '@/components/common/SortableTable.vue'
import type { ColumnConfig } from '@/components/common/SortableTable.vue'
import type { FileItem, UserFileStats, UserOption } from '@/api/admin-files'
import { listFiles, getFileUsers, getFileStats, deleteFiles, getFileDownloadUrl } from '@/api/admin-files'
import { formatFileSize, formatDate } from '@/utils/format'
import { useI18n } from 'vue-i18n'
import ActionButton from '@/components/common/ActionButton.vue'
import {
  enumQueryParam,
  numberQueryParam,
  optionalStringQueryParam,
  useRouteQueryState,
} from '@/composables/useRouteQueryState'

const { t } = useI18n()

const { state: routeState, updateQuery } = useRouteQueryState(
  {
    tab: enumQueryParam(['files', 'stats'] as const, 'files'),
    page: numberQueryParam(1, { min: 1 }),
    pageSize: numberQueryParam(20, { min: 1, max: 100 }),
    userId: optionalStringQueryParam(),
    fileType: optionalStringQueryParam(),
    search: optionalStringQueryParam(),
    unreferenced: enumQueryParam(['true', 'false', ''] as const, ''),
    sortBy: optionalStringQueryParam(),
    sortOrder: enumQueryParam(['asc', 'desc'] as const, 'desc'),
    statsSortBy: optionalStringQueryParam(),
    statsSortOrder: enumQueryParam(['asc', 'desc'] as const, 'desc'),
  },
  {
    onQueryStateChange: async () => {
      if (activeTab.value === 'stats') {
        await loadUserStats()
      } else {
        await loadFiles()
      }
    },
  }
)

const {
  tab: activeTab,
  page: currentPage,
  pageSize,
  userId: filterUserId,
  fileType: filterFileType,
  search: filterSearch,
  unreferenced: filterUnreferenced,
  sortBy,
  sortOrder,
  statsSortBy,
  statsSortOrder,
} = toRefs(routeState)

const userOptions = ref<UserOption[]>([])
const fileList = ref<FileItem[]>([])
const selectedFiles = ref<FileItem[]>([])
const total = ref(0)
const loading = ref(false)

const fileColumns: ColumnConfig<FileItem>[] = [
  { key: 'originalFileName', title: t('admin.fileManagement.fileName'), sortable: false },
  { key: 'contentHash', title: t('admin.fileManagement.contentHash'), sortable: false, width: 220 },
  { key: 'fileType', title: t('admin.fileManagement.type'), width: 100 },
  { key: 'referenceCount', title: t('admin.fileManagement.activeRefs'), sortable: true, width: 120 },
  { key: 'historicalReferenceCount', title: t('admin.fileManagement.historyRefs'), sortable: true, width: 120 },
  { key: 'userCount', title: t('admin.fileManagement.users'), sortable: true, width: 100 },
  {
    key: 'isUnreferenced',
    title: t('admin.fileManagement.state'),
    width: 120,
    formatter: (row) => row.isUnreferenced
      ? t('admin.fileManagement.stateUnreferenced')
      : t('admin.fileManagement.stateReferenced'),
  },
  { 
    key: 'fileSize', 
    title: t('admin.fileManagement.size'), 
    sortable: true, 
    width: 120,
    formatter: (row) => formatFileSize(row.fileSize),
  },
  { 
    key: 'lastReferencedAt',
    title: t('admin.fileManagement.lastReferencedAt'),
    sortable: true, 
    width: 150,
    formatter: (row) => formatDate(row.lastReferencedAt),
  },
]

// User stats state
const userStats = ref<UserFileStats[]>([])
const statsLoading = ref(false)

const statsColumns: ColumnConfig<UserFileStats>[] = [
  { key: 'userEmail', title: t('admin.fileManagement.userEmail'), sortable: true },
  { 
    key: 'fileCount', 
    title: t('admin.fileManagement.fileCount'), 
    sortable: true, 
    width: 120,
  },
  { 
    key: 'totalSize', 
    title: t('admin.fileManagement.totalSize'), 
    sortable: true, 
    width: 140,
    formatter: (row) => formatFileSize(row.totalSize),
  },
]

// Load user options (dropdown list)
async function loadUserOptions() {
  try {
    const res = await getFileUsers()
    userOptions.value = res.data
  } catch (error) {
    ElMessage.error(t('admin.fileManagement.loadUsersError'))
  }
}

// Load file list
async function loadFiles() {
  loading.value = true
  try {
    const res = await listFiles({
      page: currentPage.value,
      pageSize: pageSize.value,
      userId: filterUserId.value,
      fileType: filterFileType.value,
      search: filterSearch.value,
      unreferenced: filterUnreferenced.value || undefined,
      sortBy: sortBy.value || 'createdAt',
      sortOrder: sortOrder.value,
    })
    fileList.value = res.data
    total.value = res.total
  } catch (error) {
    ElMessage.error(t('admin.fileManagement.loadFilesError'))
  } finally {
    loading.value = false
  }
}

// Load user stats
async function loadUserStats() {
  statsLoading.value = true
  try {
    const res = await getFileStats({
      sortBy: statsSortBy.value || 'totalSize',
      sortOrder: statsSortOrder.value,
    })
    userStats.value = res.data
  } catch (error) {
    ElMessage.error(t('admin.fileManagement.loadStatsError'))
  } finally {
    statsLoading.value = false
  }
}

async function handleFilterChange() {
  currentPage.value = 1
  await updateQuery({ page: 1 })
  await loadFiles()
}

// Table selection change
function handleSelectionChange(selection: FileItem[]) {
  selectedFiles.value = selection
}

// File list sort change
function handleSortChange(sortInfo: { prop: string; order: string | null }) {
  if (sortInfo.order) {
    sortBy.value = sortInfo.prop
    sortOrder.value = sortInfo.order === 'ascending' ? 'asc' : 'desc'
  } else {
    sortBy.value = undefined
    sortOrder.value = 'desc'
  }
  void updateQuery()
  void loadFiles()
}

// User stats sort change
function handleStatsSortChange(sortInfo: { prop: string; order: string | null }) {
  if (sortInfo.order) {
    statsSortBy.value = sortInfo.prop
    statsSortOrder.value = sortInfo.order === 'ascending' ? 'asc' : 'desc'
  } else {
    statsSortBy.value = undefined
    statsSortOrder.value = 'desc'
  }
  void updateQuery()
  void loadUserStats()
}

// Batch download selected files
async function handleDownloadSelected() {
  if (selectedFiles.value.length === 0) return
  
  const zip = new JSZip()
  const folder = zip.folder('files')
  
  ElMessage.info(t('admin.fileManagement.packaging'))
  
  try {
    for (const file of selectedFiles.value) {
      const response = await fetch(getFileDownloadUrl(file.id))
      const blob = await response.blob()
      folder?.file(file.originalFileName ?? `${file.contentHash}.${file.fileType.toLowerCase()}`, blob)
    }
    
    const content = await zip.generateAsync({ type: 'blob' })
    saveAs(content, `files-${Date.now()}.zip`)
    ElMessage.success(t('admin.fileManagement.downloadSuccess'))
  } catch (error) {
    ElMessage.error(t('admin.fileManagement.downloadError'))
  }
}

// Batch delete selected files
async function handleDeleteSelected() {
  if (selectedFiles.value.length === 0) return
  
  try {
    await ElMessageBox.confirm(
      t('admin.fileManagement.deleteConfirm', { count: selectedFiles.value.length }),
      t('admin.fileManagement.deleteTitle'),
      { 
        confirmButtonText: t('common.delete'),
        cancelButtonText: t('common.cancel'),
        type: 'warning',
      }
    )
    
    const fileIds = selectedFiles.value.map((f) => f.id)
    await deleteFiles(fileIds)
    ElMessage.success(t('admin.fileManagement.deleteSuccess'))
    selectedFiles.value = []
    loadFiles()
    // Refresh stats
    if (activeTab.value === 'stats') {
      loadUserStats()
    }
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error(t('admin.fileManagement.deleteError'))
    }
  }
}

async function handlePaginationChange() {
  await updateQuery()
  await loadFiles()
}

async function handleTabChange(tabName: string | number) {
  activeTab.value = String(tabName) as 'files' | 'stats'
  await updateQuery()
  if (activeTab.value === 'stats') {
    await loadUserStats()
  } else {
    await loadFiles()
  }
}

onMounted(() => {
  void loadUserOptions()
})
</script>

<style scoped>
.filter-bar {
  margin-bottom: 15px;
}

.action-bar {
  display: flex;
  gap: 10px;
  margin: 15px 0;
}

:deep(.el-button [class*="el-icon"]) {
  margin-right: 4px;
}

@media (max-width: 768px) {
  .filter-bar :deep(.el-select),
  .filter-bar :deep(.el-input) {
    width: 100% !important;
    margin-left: 0 !important;
  }
}
</style>
