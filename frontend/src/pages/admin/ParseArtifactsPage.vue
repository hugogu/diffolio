<template>
  <div class="page-shell">
    <div class="page-header">
      <div class="page-title-group">
        <h1 class="page-title">{{ $t('admin.parseArtifacts.title') }}</h1>
        <p class="page-desc">{{ $t('admin.parseArtifacts.description') }}</p>
      </div>
    </div>

    <div class="filter-toolbar">
      <el-input
        v-model="search"
        :placeholder="$t('common.search')"
        clearable
        style="width: 240px"
        @input="handleSearch"
      />
      <el-select v-model="status" clearable style="width: 160px" @change="loadData">
        <el-option label="READY" value="READY" />
        <el-option label="BUILDING" value="BUILDING" />
        <el-option label="FAILED" value="FAILED" />
      </el-select>
      <el-select v-model="fileType" clearable style="width: 140px" @change="loadData">
        <el-option label="TXT" value="TXT" />
        <el-option label="DOC" value="DOC" />
        <el-option label="DOCX" value="DOCX" />
        <el-option label="PDF" value="PDF" />
        <el-option label="MDX" value="MDX" />
      </el-select>
    </div>

    <SortableTable
      :columns="columns"
      :data="artifacts"
      :loading="loading"
      @sort-change="handleSortChange"
    />

    <el-pagination
      v-model:current-page="currentPage"
      :page-size="pageSize"
      :total="total"
      layout="total, prev, pager, next"
      style="margin-top: 15px; justify-content: flex-end"
      @current-change="loadData"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import SortableTable from '@/components/common/SortableTable.vue'
import type { ColumnConfig } from '@/components/common/SortableTable.vue'
import { listAdminParseArtifacts, type ParseArtifactItem } from '@/api/admin-parse-artifacts'
import { formatDate, formatFileSize } from '@/utils/format'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const loading = ref(false)
const artifacts = ref<ParseArtifactItem[]>([])
const total = ref(0)
const currentPage = ref(1)
const pageSize = 20
const search = ref('')
const status = ref('')
const fileType = ref('')
const sortBy = ref('updatedAt')
const sortOrder = ref<'asc' | 'desc'>('desc')

const columns = computed<ColumnConfig<ParseArtifactItem>[]>(() => [
  { key: 'status', title: t('common.status'), sortable: true, width: 110 },
  {
    key: 'sharedFileAsset.contentHash',
    title: t('admin.versionDetail.contentHash'),
    formatter: (row) => row.sharedFileAsset.contentHash,
  },
  {
    key: 'configVersion.versionNumber',
    title: 'Config',
    formatter: (row) => `${row.configVersion.profileName} · v${row.configVersion.versionNumber}`,
  },
  { key: 'referenceCount', title: 'Refs', sortable: true, width: 90 },
  { key: 'userCount', title: 'Users', sortable: true, width: 90 },
  { key: 'totalEntries', title: 'Entries', sortable: true, width: 100 },
  {
    key: 'sharedFileAsset.fileSize',
    title: t('admin.fileManagement.size'),
    width: 120,
    formatter: (row) => formatFileSize(row.sharedFileAsset.fileSize),
  },
  {
    key: 'updatedAt',
    title: t('common.updatedAt'),
    sortable: true,
    width: 160,
    formatter: (row) => formatDate(row.updatedAt),
  },
])

async function loadData() {
  loading.value = true
  try {
    const result = await listAdminParseArtifacts({
      page: currentPage.value,
      pageSize,
      search: search.value || undefined,
      status: status.value || undefined,
      fileType: fileType.value || undefined,
      sortBy: sortBy.value,
      sortOrder: sortOrder.value,
    })
    artifacts.value = result.data
    total.value = result.total
  } finally {
    loading.value = false
  }
}

let timer: ReturnType<typeof setTimeout> | null = null
function handleSearch() {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    currentPage.value = 1
    loadData()
  }, 300)
}

function handleSortChange(sortInfo: { prop: string; order: string | null }) {
  sortBy.value = sortInfo.prop || 'updatedAt'
  sortOrder.value = sortInfo.order === 'ascending' ? 'asc' : 'desc'
  loadData()
}

onMounted(loadData)
</script>
