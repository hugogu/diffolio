<template>
  <div>
    <div class="page-header">
      <h2>{{ $t('admin.parseErrors.title') }}</h2>
      <div class="header-stats">
        <el-tag type="danger">{{ $t('admin.parseErrors.pending') }}: {{ pendingCount }}</el-tag>
        <el-tag type="success">{{ $t('admin.parseErrors.committed') }}: {{ committedCount }}</el-tag>
        <el-tag type="info">{{ $t('admin.parseErrors.dismissed') }}: {{ dismissedCount }}</el-tag>
      </div>
    </div>

    <!-- Filter bar -->
    <el-card style="margin-bottom: 12px">
      <div class="filter-bar">
        <el-radio-group v-model="statusFilter" @change="handleFilterChange">
          <el-radio-button value="">{{ $t('admin.parseErrors.all') }}</el-radio-button>
          <el-radio-button value="PENDING">{{ $t('admin.parseErrors.pending') }}</el-radio-button>
          <el-radio-button value="CORRECTED">{{ $t('admin.parseErrors.corrected') }}</el-radio-button>
          <el-radio-button value="COMMITTED">{{ $t('admin.parseErrors.committed') }}</el-radio-button>
          <el-radio-button value="DISMISSED">{{ $t('admin.parseErrors.dismissed') }}</el-radio-button>
        </el-radio-group>
        <el-select
          v-model="errorCodeFilter"
          :placeholder="$t('admin.parseErrors.errorCode')"
          clearable
          style="width: 180px"
          @change="handleFilterChange"
        >
          <el-option label="WORKER_ERROR" value="WORKER_ERROR" />
          <el-option label="PARSE_ERROR" value="PARSE_ERROR" />
          <el-option label="CONFIG_ERROR" value="CONFIG_ERROR" />
        </el-select>
      </div>
    </el-card>

    <!-- Error table -->
    <el-card>
      <vxe-table
        :data="errors"
        :loading="loading"
        border
        stripe
        height="620"
        :scroll-y="{ enabled: true, gt: 50 }"
      >
        <vxe-column type="seq" width="60" title="#" />
        <vxe-column :title="$t('admin.parseErrors.user')" width="180">
          <template #default="{ row }">
            <router-link to="/admin/users" class="user-link">
              {{ row.task?.version?.dictionary?.user?.email ?? '—' }}
            </router-link>
          </template>
        </vxe-column>
        <vxe-column :title="$t('admin.parseErrors.dictionary')" width="140">
          <template #default="{ row }">{{ row.task?.version?.dictionary?.name ?? '—' }}</template>
        </vxe-column>
        <vxe-column :title="$t('admin.parseErrors.version')" width="100">
          <template #default="{ row }">{{ row.task?.version?.label ?? '—' }}</template>
        </vxe-column>
        <vxe-column :title="$t('admin.parseErrors.fileName')" width="160">
          <template #default="{ row }">{{ row.task?.originalFileName ?? '—' }}</template>
        </vxe-column>
        <vxe-column field="errorCode" :title="$t('admin.parseErrors.errorCode')" width="140" />
        <vxe-column field="fieldName" :title="$t('admin.parseErrors.field')" width="90" />
        <vxe-column field="rawText" :title="$t('admin.parseErrors.rawText')" min-width="200">
          <template #default="{ row }">
            <el-tooltip :content="row.rawText" placement="top" :show-after="300">
              <span class="truncate-cell">{{ row.rawText }}</span>
            </el-tooltip>
          </template>
        </vxe-column>
        <vxe-column field="errorDetail" :title="$t('admin.parseErrors.errorDetail')" min-width="220">
          <template #default="{ row }">
            <el-tooltip :content="row.errorDetail" placement="top" :show-after="300">
              <span class="truncate-cell">{{ row.errorDetail }}</span>
            </el-tooltip>
          </template>
        </vxe-column>
        <vxe-column field="status" :title="$t('admin.parseErrors.status')" width="90">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
          </template>
        </vxe-column>
        <vxe-column :title="$t('admin.parseErrors.actions')" width="160" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="row.status === 'PENDING' || row.status === 'CORRECTED'"
              size="small"
              type="success"
              :loading="row._loading"
              @click="handleCommit(row)"
            >
              {{ $t('admin.parseErrors.commit') }}
            </el-button>
            <el-button
              v-if="row.status === 'PENDING'"
              size="small"
              type="info"
              :loading="row._loading"
              @click="handleDismiss(row)"
            >
              {{ $t('admin.parseErrors.dismiss') }}
            </el-button>
          </template>
        </vxe-column>
      </vxe-table>

      <div v-if="hasMore" class="load-more">
        <el-button :loading="loadingMore" @click="loadMore">{{ $t('admin.parseErrors.loadMore') }}</el-button>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import {
  getAdminParseErrors,
  commitError,
  dismissError,
  type AdminParseError,
} from '@/api/parse-tasks'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const loading = ref(false)
const loadingMore = ref(false)
const errors = ref<(AdminParseError & { _loading?: boolean })[]>([])
const cursor = ref<string | null>(null)
const hasMore = ref(false)
const statusFilter = ref('')
const errorCodeFilter = ref('')

const pendingCount = computed(() => errors.value.filter(e => e.status === 'PENDING').length)
const committedCount = computed(() => errors.value.filter(e => e.status === 'COMMITTED').length)
const dismissedCount = computed(() => errors.value.filter(e => e.status === 'DISMISSED').length)

onMounted(loadErrors)

async function loadErrors() {
  loading.value = true
  const result = await getAdminParseErrors({
    limit: 50,
    status: statusFilter.value || undefined,
    errorCode: errorCodeFilter.value || undefined,
  })
  errors.value = result.items
  cursor.value = result.nextCursor
  hasMore.value = result.hasMore
  loading.value = false
}

async function loadMore() {
  loadingMore.value = true
  const result = await getAdminParseErrors({
    cursor: cursor.value ?? undefined,
    limit: 50,
    status: statusFilter.value || undefined,
    errorCode: errorCodeFilter.value || undefined,
  })
  errors.value.push(...result.items)
  cursor.value = result.nextCursor
  hasMore.value = result.hasMore
  loadingMore.value = false
}

async function handleFilterChange() {
  cursor.value = null
  await loadErrors()
}

async function handleCommit(row: AdminParseError & { _loading?: boolean }) {
  row._loading = true
  try {
    await commitError(row.task.id, row.id)
    row.status = 'COMMITTED'
    ElMessage.success(t('admin.parseErrors.committedSuccess'))
  } catch {
    ElMessage.error(t('admin.parseErrors.actionError'))
  } finally {
    row._loading = false
  }
}

async function handleDismiss(row: AdminParseError & { _loading?: boolean }) {
  row._loading = true
  try {
    await dismissError(row.task.id, row.id)
    row.status = 'DISMISSED'
    ElMessage.success(t('admin.parseErrors.dismissedSuccess'))
  } catch {
    ElMessage.error(t('admin.parseErrors.actionError'))
  } finally {
    row._loading = false
  }
}

function statusTagType(status: string) {
  if (status === 'COMMITTED') return 'success'
  if (status === 'DISMISSED') return 'info'
  if (status === 'CORRECTED') return 'warning'
  return 'danger'
}

function statusLabel(status: string) {
  return t(`admin.parseErrors.statusLabels.${status}`) ?? status
}
</script>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.header-stats { display: flex; gap: 8px; }
.filter-bar { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
.load-more { text-align: center; padding: 16px; }
.truncate-cell {
  display: block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.user-link { color: var(--el-color-primary); text-decoration: none; }
.user-link:hover { text-decoration: underline; }
</style>
