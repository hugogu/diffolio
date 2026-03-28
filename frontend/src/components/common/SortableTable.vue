<template>
  <el-table
    v-loading="loading"
    :data="data"
    @sort-change="handleSortChange"
    @selection-change="handleSelectionChange"
  >
    <el-table-column
      v-if="selectable"
      type="selection"
      width="55"
    />
    <el-table-column
      v-for="col in columns"
      :key="col.key"
      :prop="col.key"
      :label="col.title"
      :width="col.width"
      :sortable="col.sortable ? 'custom' : false"
    >
      <template #default="{ row }">
        <template v-if="col.formatter">
          {{ col.formatter(row) }}
        </template>
        <template v-else>
          {{ row[col.key] }}
        </template>
      </template>
    </el-table-column>
  </el-table>
</template>

<script setup lang="ts">
import type { PropType } from 'vue'

export interface ColumnConfig<T = any> {
  key: string
  title: string
  sortable?: boolean
  width?: string | number
  formatter?: (row: T) => string
}

defineProps({
  columns: {
    type: Array as PropType<ColumnConfig[]>,
    required: true,
  },
  data: {
    type: Array as PropType<any[]>,
    default: () => [],
  },
  loading: {
    type: Boolean,
    default: false,
  },
  selectable: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits<{
  (e: 'sort-change', sort: { prop: string; order: string | null }): void
  (e: 'selection-change', selection: any[]): void
}>()

function handleSortChange(sort: { prop: string; order: string | null }) {
  emit('sort-change', sort)
}

function handleSelectionChange(selection: any[]) {
  emit('selection-change', selection)
}
</script>
