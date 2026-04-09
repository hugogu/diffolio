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
      <el-select v-model="status" clearable style="width: 160px" @change="handleFilterChange">
        <el-option label="READY" value="READY" />
        <el-option label="BUILDING" value="BUILDING" />
        <el-option label="FAILED" value="FAILED" />
      </el-select>
      <el-select v-model="fileType" clearable style="width: 140px" @change="handleFilterChange">
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
      @current-change="handlePageChange"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, toRefs } from 'vue'
import SortableTable from '@/components/common/SortableTable.vue'
import type { ColumnConfig } from '@/components/common/SortableTable.vue'
import { listAdminParseArtifacts, type ParseArtifactItem } from '@/api/admin-parse-artifacts'
import { formatDate, formatFileSize } from '@/utils/format'
import { useI18n } from 'vue-i18n'
import {
  enumQueryParam,
  numberQueryParam,
  optionalStringQueryParam,
  useRouteQueryState,
} from '@/composables/useRouteQueryState'

const { t } = useI18n()

const loading = ref(false)
const artifacts = ref<ParseArtifactItem[]>([])
const total = ref(0)
const pageSize = 20
const { state: routeState, updateQuery } = useRouteQueryState(
  {
    page: numberQueryParam(1, { min: 1 }),
    search: optionalStringQueryParam(),
    status: enumQueryParam(['READY', 'BUILDING', 'FAILED', ''] as const, ''),
    fileType: enumQueryParam(['TXT', 'DOC', 'DOCX', 'PDF', 'MDX', ''] as const, ''),
    sortBy: optionalStringQueryParam(),
    sortOrder: enumQueryParam(['asc', 'desc'] as const, 'desc'),
  },
  {
    onQueryStateChange: async () => {
      await loadData()
    },
  }
)
const {
  page: currentPage,
  search,
  status,
  fileType,
  sortBy,
  sortOrder,
} = toRefs(routeState)

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
      sortBy: sortBy.value || 'updatedAt',
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
    void updateQuery({ page: 1 })
    void loadData()
  }, 300)
}

function handleSortChange(sortInfo: { prop: string; order: string | null }) {
  sortBy.value = sortInfo.prop || undefined
  sortOrder.value = sortInfo.order === 'ascending' ? 'asc' : 'desc'
  void updateQuery()
  void loadData()
}

async function handleFilterChange() {
  currentPage.value = 1
  await updateQuery({ page: 1 })
  await loadData()
}

async function handlePageChange(page: number) {
  currentPage.value = page
  await updateQuery({ page })
  await loadData()
}
</script>
