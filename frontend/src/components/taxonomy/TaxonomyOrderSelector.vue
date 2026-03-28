<template>
  <div class="taxonomy-order-selector">
    <el-form-item :label="$t('common.sortBy')">
      <el-radio-group v-model="orderBy" @change="emitChange">
        <el-radio value="alphabetical">{{ $t('common.alphabetical') }}</el-radio>
        <el-radio value="taxonomy">{{ $t('common.taxonomyOrder') }}</el-radio>
      </el-radio-group>
    </el-form-item>
    <el-form-item v-if="orderBy === 'taxonomy'" :label="$t('common.taxonomySource')">
      <el-select
        v-model="selectedSourceId"
        :placeholder="$t('common.selectTaxonomySource')"
        clearable
        @change="emitChange"
      >
        <el-option
          v-for="s in activeSources"
          :key="s.id"
          :label="s.name"
          :value="s.id"
        />
      </el-select>
    </el-form-item>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useTaxonomyStore } from '@/stores/taxonomy'

const emit = defineEmits<{
  (e: 'order-change', order: { orderBy: 'alphabetical' | 'taxonomy'; taxonomySourceId: string | null }): void
}>()

const store = useTaxonomyStore()
const orderBy = ref<'alphabetical' | 'taxonomy'>('alphabetical')
const selectedSourceId = ref<string | null>(null)

const activeSources = computed(() => store.sources.filter((s) => s.status === 'ACTIVE'))

function emitChange() {
  emit('order-change', {
    orderBy: orderBy.value,
    taxonomySourceId: orderBy.value === 'taxonomy' ? selectedSourceId.value : null,
  })
}

watch(activeSources, (sources) => {
  if (sources.length > 0 && !selectedSourceId.value) {
    selectedSourceId.value = sources[0].id
    if (orderBy.value === 'taxonomy') emitChange()
  }
}, { immediate: true })

onMounted(() => {
  if (!store.sources.length) store.fetchSources()
})
</script>
