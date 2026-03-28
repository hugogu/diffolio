<template>
  <div class="taxonomy-tree-browser">
    <div v-if="loading" style="padding: 8px; color: #909399; font-size: 13px">{{ $t('common.loading') }}</div>
    <div v-else-if="!nodes.length" style="padding: 8px; color: #909399; font-size: 13px">{{ $t('admin.taxonomy.noData') }}</div>
    <el-tree
      v-else
      :data="displayTree"
      :props="treeProps"
      node-key="id"
      highlight-current
      :expand-on-click-node="false"
      @node-click="onNodeClick"
      @node-expand="onNodeExpand"
      style="font-size: 13px"
    >
      <template #default="{ data }">
        <span class="tree-node" :class="{ 'tree-entry': data.isEntry }">
          <span>{{ data.label }}</span>
          <el-tag
            v-if="!data.isEntry && data.level === 4 && data.entryCount !== undefined"
            size="small"
            type="info"
            style="margin-left: 6px; font-size: 11px"
          >
            {{ data.entryCount }}
          </el-tag>
          <el-tag
            v-if="!data.isEntry && selectedNodeId === data.id"
            size="small"
            type="primary"
            style="margin-left: 4px; font-size: 11px"
          >{{ $t('common.selected') }}</el-tag>
        </span>
      </template>
    </el-tree>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { useTaxonomyStore } from '@/stores/taxonomy'
import { getTaxonomyNodeEntries } from '@/api/taxonomy'
import type { TaxonomyNodeTree } from '@/api/taxonomy'

const props = defineProps<{
  sourceId: string
  selectedNodeId?: string | null
}>()

const emit = defineEmits<{
  (e: 'node-selected', nodeId: string | null): void
}>()

interface DisplayNode {
  id: string
  label: string
  level: number
  entryCount?: number
  isEntry: boolean
  children: DisplayNode[]
}

const store = useTaxonomyStore()
const loading = computed(() => store.treeLoading[props.sourceId] ?? false)
const nodes = computed(() => store.treeBySourceId[props.sourceId] ?? [])

// Lazily-loaded entries keyed by node ID
const loadedEntries = reactive<Record<string, { id: string; headword: string }[]>>({})
const loadingNodes = reactive(new Set<string>())

const treeProps = {
  label: 'label',
  children: 'children',
  // Level-4 nodes with entries are NOT leaves so el-tree shows an expand arrow
  isLeaf: (data: DisplayNode) => data.isEntry || (data.level === 4 && !(data.entryCount ?? 0)),
}

function buildDisplayNodes(treeNodes: TaxonomyNodeTree[]): DisplayNode[] {
  return treeNodes.map((node) => {
    const entryChildren: DisplayNode[] =
      node.level === 4 && loadedEntries[node.id]
        ? loadedEntries[node.id].map((e) => ({
            id: `__entry__${e.id}`,
            label: e.headword,
            level: 5,
            isEntry: true,
            children: [],
          }))
        : []
    return {
      id: node.id,
      label: node.label,
      level: node.level,
      entryCount: node.entryCount,
      isEntry: false,
      children: [...buildDisplayNodes(node.children), ...entryChildren],
    }
  })
}

const displayTree = computed(() => buildDisplayNodes(nodes.value))

watch(
  () => props.sourceId,
  (id) => {
    // Clear stale entries when source changes
    for (const key of Object.keys(loadedEntries)) delete loadedEntries[key]
    loadingNodes.clear()
    if (id && !store.treeBySourceId[id]) {
      store.fetchTree(id)
    }
  },
  { immediate: true }
)

async function loadEntries(nodeId: string) {
  if (loadedEntries[nodeId] !== undefined || loadingNodes.has(nodeId)) return
  loadingNodes.add(nodeId)
  try {
    const result = await getTaxonomyNodeEntries(props.sourceId, nodeId, undefined, 200)
    loadedEntries[nodeId] = result.data
  } finally {
    loadingNodes.delete(nodeId)
  }
}

function onNodeExpand(data: DisplayNode) {
  if (!data.isEntry && data.level === 4 && (data.entryCount ?? 0) > 0) {
    loadEntries(data.id)
  }
}

function onNodeClick(data: DisplayNode) {
  if (data.isEntry) return
  // Only toggle off if clicking the same node; otherwise select the new node
  const newId = props.selectedNodeId === data.id ? null : data.id
  emit('node-selected', newId)
}
</script>

<style scoped>
.tree-entry {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  cursor: default;
}
</style>
