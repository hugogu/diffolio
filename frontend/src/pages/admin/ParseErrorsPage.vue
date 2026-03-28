<template>
  <div>
    <div class="page-header">
      <div>
        <el-breadcrumb>
          <el-breadcrumb-item :to="{ path: '/admin/dictionaries' }">{{ $t('admin.dictionaryList.title') }}</el-breadcrumb-item>
          <el-breadcrumb-item>{{ $t('admin.parseErrors.title') }}</el-breadcrumb-item>
        </el-breadcrumb>
        <h2>{{ $t('admin.parseErrors.taskTitle') }} — {{ route.params.taskId }}</h2>
      </div>
      <div class="header-stats">
        <el-tag>{{ $t('admin.parseErrors.pending') }}: {{ pendingCount }}</el-tag>
        <el-tag type="success">{{ $t('admin.parseErrors.committed') }}: {{ committedCount }}</el-tag>
        <el-tag type="info">{{ $t('admin.parseErrors.dismissed') }}: {{ dismissedCount }}</el-tag>
      </div>
    </div>

    <!-- Filter bar -->
    <el-card style="margin-bottom: 12px">
      <el-radio-group v-model="statusFilter" @change="handleFilterChange">
        <el-radio-button value="">{{ $t('admin.parseErrors.all') }}</el-radio-button>
        <el-radio-button value="PENDING">{{ $t('admin.parseErrors.pending') }}</el-radio-button>
        <el-radio-button value="CORRECTED">{{ $t('admin.parseErrors.corrected') }}</el-radio-button>
        <el-radio-button value="COMMITTED">{{ $t('admin.parseErrors.committed') }}</el-radio-button>
        <el-radio-button value="DISMISSED">{{ $t('admin.parseErrors.dismissed') }}</el-radio-button>
      </el-radio-group>
    </el-card>

    <!-- Error table using vxe-table for virtual scroll -->
    <el-card>
      <vxe-table
        :data="errors"
        :loading="loading"
        border
        stripe
        height="600"
        :scroll-y="{ enabled: true, gt: 50 }"
        :edit-config="{ trigger: 'click', mode: 'row' }"
      >
        <vxe-column type="seq" width="60" title="#" />
        <vxe-column field="rawText" :title="$t('admin.parseErrors.rawText')" min-width="200" />
        <vxe-column field="fieldName" :title="$t('admin.parseErrors.field')" width="120" />
        <vxe-column field="errorCode" :title="$t('admin.parseErrors.errorCode')" width="180" />
        <vxe-column field="status" :title="$t('admin.parseErrors.status')" width="120">
          <template #default="{ row }">
            <el-tag :type="errorStatusType(row.status)">{{ row.status }}</el-tag>
          </template>
        </vxe-column>
        <vxe-column field="correctedText" :title="$t('admin.parseErrors.correctedText')" min-width="200" :edit-render="{}">
          <template #edit="{ row }">
            <el-input v-model="row.correctedText" size="small" />
          </template>
        </vxe-column>
        <vxe-column :title="$t('admin.parseErrors.actions')" width="220" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="row.status === 'PENDING' || row.status === 'CORRECTED'"
              size="small"
              type="primary"
              :loading="row._loading"
              @click="handleCorrectAndRetry(row)"
            >
              {{ $t('admin.parseErrors.correctAndRetry') }}
            </el-button>
            <el-button
              v-if="row.status === 'PENDING'"
              size="small"
              type="info"
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
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import {
  getParseErrors,
  correctError,
  dismissError,
  retryError,
  type ParseError
} from '@/api/parse-tasks'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'

const route = useRoute()
const { t } = useI18n()
const taskId = route.params.taskId as string

const loading = ref(false)
const loadingMore = ref(false)
const errors = ref<(ParseError & { _loading?: boolean })[]>([])
const cursor = ref<string | null>(null)
const hasMore = ref(false)
const statusFilter = ref('')

const pendingCount = ref(0)
const committedCount = ref(0)
const dismissedCount = ref(0)

onMounted(async () => {
  await loadErrors()
})

async function loadErrors() {
  loading.value = true
  const result = await getParseErrors(taskId, {
    limit: 50,
    status: statusFilter.value || undefined,
  })
  errors.value = result.items
  cursor.value = result.nextCursor
  hasMore.value = result.hasMore

  // Update counts
  pendingCount.value = errors.value.filter(e => e.status === 'PENDING').length
  committedCount.value = errors.value.filter(e => e.status === 'COMMITTED').length
  dismissedCount.value = errors.value.filter(e => e.status === 'DISMISSED').length
  loading.value = false
}

async function loadMore() {
  loadingMore.value = true
  const result = await getParseErrors(taskId, {
    cursor: cursor.value ?? undefined,
    limit: 50,
    status: statusFilter.value || undefined,
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

async function handleCorrectAndRetry(row: ParseError & { correctedText?: string; _loading?: boolean }) {
  if (!row.correctedText) {
    ElMessage.warning(t('admin.parseErrors.correctedTextRequired'))
    return
  }
  row._loading = true
  try {
    await correctError(taskId, row.id, row.correctedText)
    await retryError(taskId, row.id)
    row.status = 'CORRECTED'
    ElMessage.success(t('admin.parseErrors.correctedSuccess'))
  } catch {
    ElMessage.error(t('admin.parseErrors.actionError'))
  } finally {
    row._loading = false
  }
}

async function handleDismiss(row: ParseError & { _loading?: boolean }) {
  row._loading = true
  try {
    await dismissError(taskId, row.id)
    row.status = 'DISMISSED'
    ElMessage.success(t('admin.parseErrors.dismissedSuccess'))
  } catch {
    ElMessage.error(t('admin.parseErrors.actionError'))
  } finally {
    row._loading = false
  }
}

function errorStatusType(status: string) {
  if (status === 'COMMITTED') return 'success'
  if (status === 'DISMISSED') return 'info'
  if (status === 'CORRECTED') return 'warning'
  return 'danger'
}
</script>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
}
.header-stats { display: flex; gap: 8px; }
.load-more { text-align: center; padding: 16px; }
</style>
