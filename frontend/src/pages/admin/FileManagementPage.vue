<template>
  <div class="file-management-page">
    <h1>{{ $t('admin.fileManagement.title') }}</h1>
    
    <el-tabs v-model="activeTab">
      <!-- File Management Tab -->
      <el-tab-pane :label="$t('admin.fileManagement.files')" name="files">
        <!-- Filters -->
        <div class="filter-bar">
          <el-select
            v-model="filters.userId"
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
            v-model="filters.fileType"
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
            v-model="filters.search"
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
        </div>

        <!-- Action buttons -->
        <div class="action-bar" style="margin: 15px 0">
          <el-button
            type="primary"
            :disabled="selectedFiles.length === 0"
            @click="handleDownloadSelected"
          >
            <el-icon><Download /></el-icon>
            {{ $t('admin.fileManagement.downloadSelected') }} ({{ selectedFiles.length }})
          </el-button>
          <el-button
            type="danger"
            :disabled="selectedFiles.length === 0"
            @click="handleDeleteSelected"
          >
            <el-icon><Delete /></el-icon>
            {{ $t('admin.fileManagement.deleteSelected') }}
          </el-button>
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
          @change="loadFiles"
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
import { ref, reactive, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Download, Delete } from '@element-plus/icons-vue'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import SortableTable from '@/components/common/SortableTable.vue'
import type { ColumnConfig } from '@/components/common/SortableTable.vue'
import type { FileItem, UserFileStats, UserOption, FileFilters, SortParams } from '@/api/admin-files'
import { listFiles, getFileUsers, getFileStats, deleteFiles, getFileDownloadUrl } from '@/api/admin-files'
import { formatFileSize, formatDate } from '@/utils/format'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

// Tab state
const activeTab = ref('files')

// File management state
const filters = reactive<FileFilters>({
  userId: undefined,
  fileType: undefined,
  search: '',
})

const userOptions = ref<UserOption[]>([])
const fileList = ref<FileItem[]>([])
const selectedFiles = ref<FileItem[]>([])
const currentPage = ref(1)
const pageSize = ref(20)
const total = ref(0)
const loading = ref(false)

const sort = reactive<SortParams>({
  sortBy: 'createdAt',
  sortOrder: 'desc',
})

const fileColumns: ColumnConfig<FileItem>[] = [
  { key: 'originalFileName', title: t('admin.fileManagement.fileName'), sortable: true },
  { key: 'userEmail', title: t('admin.fileManagement.user'), sortable: true, width: 200 },
  { key: 'dictionaryName', title: t('admin.fileManagement.dictionary') },
  { key: 'versionLabel', title: t('admin.fileManagement.version'), width: 100 },
  { key: 'fileType', title: t('admin.fileManagement.type'), width: 100 },
  { 
    key: 'fileSize', 
    title: t('admin.fileManagement.size'), 
    sortable: true, 
    width: 120,
    formatter: (row) => formatFileSize(row.fileSize),
  },
  { 
    key: 'createdAt', 
    title: t('admin.fileManagement.uploadTime'), 
    sortable: true, 
    width: 150,
    formatter: (row) => formatDate(row.createdAt),
  },
]

// User stats state
const userStats = ref<UserFileStats[]>([])
const statsLoading = ref(false)
const statsSort = reactive<SortParams>({
  sortBy: 'totalSize',
  sortOrder: 'desc',
})

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
      ...filters,
      ...sort,
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
    const res = await getFileStats(statsSort)
    userStats.value = res.data
  } catch (error) {
    ElMessage.error(t('admin.fileManagement.loadStatsError'))
  } finally {
    statsLoading.value = false
  }
}

// Filter change
function handleFilterChange() {
  currentPage.value = 1
  loadFiles()
}

// Table selection change
function handleSelectionChange(selection: FileItem[]) {
  selectedFiles.value = selection
}

// File list sort change
function handleSortChange(sortInfo: { prop: string; order: string | null }) {
  if (sortInfo.order) {
    sort.sortBy = sortInfo.prop
    sort.sortOrder = sortInfo.order === 'ascending' ? 'asc' : 'desc'
  } else {
    sort.sortBy = 'createdAt'
    sort.sortOrder = 'desc'
  }
  loadFiles()
}

// User stats sort change
function handleStatsSortChange(sortInfo: { prop: string; order: string | null }) {
  if (sortInfo.order) {
    statsSort.sortBy = sortInfo.prop
    statsSort.sortOrder = sortInfo.order === 'ascending' ? 'asc' : 'desc'
  } else {
    statsSort.sortBy = 'totalSize'
    statsSort.sortOrder = 'desc'
  }
  loadUserStats()
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
      folder?.file(file.originalFileName, blob)
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

// Watch tab switch, load user stats
watch(activeTab, (newTab) => {
  if (newTab === 'stats' && userStats.value.length === 0) {
    loadUserStats()
  }
})

onMounted(() => {
  loadUserOptions()
  loadFiles()
})
</script>

<style scoped>
.file-management-page {
  padding: 20px;
}

.filter-bar {
  margin-bottom: 15px;
  display: flex;
  align-items: center;
}

.action-bar {
  display: flex;
  gap: 10px;
}

:deep(.el-button [class*="el-icon"]) {
  margin-right: 4px;
}
</style>
