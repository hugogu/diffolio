<template>
  <div class="taxonomy-filter-panel">
    <div
      class="panel-header"
      style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px"
    >
      <span style="font-size: 13px; font-weight: 600; color: #303133">{{ t('admin.taxonomy.filter.title') }}</span>
      <el-button v-if="selectedNodeId" link size="small" @click="clear">{{ t('common.clear') }}</el-button>
    </div>

    <el-select
      v-model="selectedSourceId"
      :placeholder="t('admin.taxonomy.filter.selectSource')"
      clearable
      size="small"
      style="width: 100%; margin-bottom: 8px"
      @change="onSourceChange"
    >
      <el-option
        v-for="s in activeSources"
        :key="s.id"
        :label="s.name"
        :value="s.id"
      />
    </el-select>

    <div v-if="selectedSourceId" class="tree-container">
      <TaxonomyTreeBrowser
        :source-id="selectedSourceId"
        :selected-node-id="selectedNodeId"
        @node-selected="onNodeSelected"
      />
    </div>

    <div v-else style="font-size: 12px; color: #909399; padding: 4px 0">
      {{ t('admin.taxonomy.filter.pleaseSelectSource') }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTaxonomyStore } from '@/stores/taxonomy'
import TaxonomyTreeBrowser from './TaxonomyTreeBrowser.vue'

const { t } = useI18n()
const props = withDefaults(defineProps<{
  selectedSourceId?: string | null
  selectedNodeId?: string | null
  autoSelectFirstSource?: boolean
}>(), {
  selectedSourceId: null,
  selectedNodeId: null,
  autoSelectFirstSource: false,
})

const emit = defineEmits<{
  (e: 'filter-change', filter: { taxonomySourceId: string | null; taxonomyNodeId: string | null }): void
}>()

const store = useTaxonomyStore()
const selectedSourceId = ref<string | null>(null)
const selectedNodeId = ref<string | null>(null)

const activeSources = computed(() => store.sources.filter((s) => s.status === 'ACTIVE'))

watch(() => props.selectedSourceId, (value) => {
  selectedSourceId.value = value ?? null
}, { immediate: true })

watch(() => props.selectedNodeId, (value) => {
  selectedNodeId.value = value ?? null
}, { immediate: true })

function onSourceChange(id: string | null) {
  selectedNodeId.value = null
  emit('filter-change', { taxonomySourceId: id, taxonomyNodeId: null })
}

function onNodeSelected(nodeId: string | null) {
  selectedNodeId.value = nodeId
  emit('filter-change', { taxonomySourceId: selectedSourceId.value, taxonomyNodeId: nodeId })
}

function clear() {
  selectedNodeId.value = null
  selectedSourceId.value = null
  emit('filter-change', { taxonomySourceId: null, taxonomyNodeId: null })
}

watch(activeSources, (sources) => {
  if (props.autoSelectFirstSource && sources.length > 0 && !selectedSourceId.value) {
    selectedSourceId.value = sources[0].id
    emit('filter-change', { taxonomySourceId: sources[0].id, taxonomyNodeId: null })
  }
}, { immediate: true })

onMounted(() => {
  if (!store.sources.length) store.fetchSources()
})
</script>

<style scoped>
.taxonomy-filter-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.tree-container {
  flex: 1;
  overflow-y: auto;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
  padding: 4px;
  min-height: 0;
}
</style>
