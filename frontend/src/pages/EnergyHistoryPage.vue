<template>
  <div class="energy-history-page">
    <div class="page-header">
      <h2>{{ $t('energyHistory.title') }}</h2>
      <p class="subtitle">{{ $t('energyHistory.subtitle') }}</p>
    </div>

    <!-- Date range filter -->
    <div class="filter-bar">
      <el-date-picker
        v-model="dateRange"
        type="daterange"
        :range-separator="$t('energyHistory.dateRange')"
        :start-placeholder="$t('energyHistory.startDate')"
        :end-placeholder="$t('energyHistory.endDate')"
        clearable
        style="width: 260px"
        @change="onFilter"
      />
      <el-button @click="resetFilter">{{ $t('energyHistory.reset') }}</el-button>
    </div>

    <el-table
      v-loading="loading"
      :data="events"
      border
      style="width: 100%"
    >
      <el-table-column :label="$t('energyHistory.time')" width="180">
        <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column :label="$t('energyHistory.eventType')" width="140">
        <template #default="{ row }">
          <el-tag :type="eventTagType(row.eventType)" size="small">
            {{ eventLabel(row.eventType) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="$t('energyHistory.description')" min-width="200">
        <template #default="{ row }">{{ row.description }}</template>
      </el-table-column>
      <el-table-column :label="$t('energyHistory.delta')" width="120" align="right">
        <template #default="{ row }">
          <span :class="row.delta >= 0 ? 'delta-positive' : 'delta-negative'">
            {{ row.delta >= 0 ? '+' : '' }}{{ row.delta }}
          </span>
        </template>
      </el-table-column>
    </el-table>

    <div v-if="events.length === 0 && !loading" class="empty-state">
      <el-empty :description="$t('energyHistory.empty')" />
    </div>

    <div class="pagination-bar">
      <el-pagination
        v-model:current-page="page"
        :page-size="pageSize"
        :total="total"
        layout="total, prev, pager, next"
        size="small"
        @current-change="loadEvents"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { listEnergyEvents } from '@/api/subscription'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const loading = ref(false)
const events = ref<Array<Record<string, unknown>>>([])
const page = ref(1)
const pageSize = 50
const total = ref(0)
const dateRange = ref<[Date, Date] | null>(null)

const EVENT_LABELS = computed<Record<string, string>>(() => ({
  WORD_UNLOCK: t('energyHistory.eventTypes.WORD_UNLOCK'),
  MONTHLY_RESET: t('energyHistory.eventTypes.MONTHLY_RESET'),
  ADMIN_CREDIT: t('energyHistory.eventTypes.ADMIN_CREDIT'),
  PURCHASE: t('energyHistory.eventTypes.PURCHASE'),
  UPLOAD_DEDUCTION: t('energyHistory.eventTypes.UPLOAD_DEDUCTION'),
  FREE_TIER_UNLOCK: t('energyHistory.eventTypes.FREE_TIER_UNLOCK'),
}))

const EVENT_TAG_TYPES: Record<string, string> = {
  WORD_UNLOCK: 'danger',
  MONTHLY_RESET: 'success',
  ADMIN_CREDIT: 'primary',
  PURCHASE: 'primary',
  UPLOAD_DEDUCTION: 'warning',
  FREE_TIER_UNLOCK: 'info',
}

function eventLabel(type: string): string {
  return EVENT_LABELS.value[type] ?? type
}

function eventTagType(type: string): string {
  return EVENT_TAG_TYPES[type] ?? 'info'
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN', { hour12: false })
}

async function loadEvents(): Promise<void> {
  loading.value = true
  try {
    const from = dateRange.value?.[0]?.toISOString().slice(0, 10)
    const to = dateRange.value?.[1]?.toISOString().slice(0, 10)
    const result = await listEnergyEvents({ page: page.value, pageSize, from, to })
    events.value = result.data as unknown as Array<Record<string, unknown>>
    total.value = result.total
  } finally {
    loading.value = false
  }
}

function onFilter(): void {
  page.value = 1
  loadEvents()
}

function resetFilter(): void {
  dateRange.value = null
  page.value = 1
  loadEvents()
}

onMounted(loadEvents)
</script>

<style scoped>
.energy-history-page {
  max-width: 900px;
  margin: 0 auto;
  padding: 24px;
}

.page-header {
  margin-bottom: 20px;
}

.page-header h2 {
  margin: 0 0 4px 0;
}

.subtitle {
  color: var(--el-text-color-secondary);
  font-size: 13px;
  margin: 0;
}

.filter-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.delta-positive {
  color: var(--el-color-success);
  font-weight: 600;
}

.delta-negative {
  color: var(--el-text-color-secondary);
  font-weight: 500;
}

.empty-state {
  padding: 32px 0;
}

.pagination-bar {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}
</style>
