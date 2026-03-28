import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  listTaxonomySources,
  getTaxonomySource,
  deleteTaxonomySource,
  reimportTaxonomySource,
  getTaxonomyTree,
  getTaxonomyNodeEntries,
  updateTaxonomyNode,
  updateTaxonomyNodeEntries,
  type TaxonomySourceSummary,
  type TaxonomySource,
  type TaxonomyNodeTree,
} from '@/api/taxonomy'

export const useTaxonomyStore = defineStore('taxonomy', () => {
  const sources = ref<TaxonomySourceSummary[]>([])
  const sourcesLoading = ref(false)
  const treeBySourceId = ref<Record<string, TaxonomyNodeTree[]>>({})
  const treeLoading = ref<Record<string, boolean>>({})

  async function fetchSources() {
    sourcesLoading.value = true
    try {
      const result = await listTaxonomySources()
      sources.value = result.data
    } finally {
      sourcesLoading.value = false
    }
  }

  async function fetchSource(id: string): Promise<TaxonomySource> {
    return getTaxonomySource(id)
  }

  async function removeSource(id: string) {
    await deleteTaxonomySource(id)
    sources.value = sources.value.filter((s) => s.id !== id)
    delete treeBySourceId.value[id]
  }

  async function reimportSource(id: string) {
    const task = await reimportTaxonomySource(id)
    // Update status in list
    const idx = sources.value.findIndex((s) => s.id === id)
    if (idx !== -1) sources.value[idx] = { ...sources.value[idx], status: 'IMPORTING' }
    return task
  }

  async function fetchTree(sourceId: string) {
    if (treeLoading.value[sourceId]) return
    treeLoading.value[sourceId] = true
    try {
      const result = await getTaxonomyTree(sourceId)
      treeBySourceId.value[sourceId] = result.nodes
    } finally {
      treeLoading.value[sourceId] = false
    }
  }

  async function fetchNodeEntries(sourceId: string, nodeId: string, cursor?: string) {
    return getTaxonomyNodeEntries(sourceId, nodeId, cursor)
  }

  async function renameNode(sourceId: string, nodeId: string, label: string) {
    const result = await updateTaxonomyNode(sourceId, nodeId, label)
    // Invalidate cached tree
    delete treeBySourceId.value[sourceId]
    return result
  }

  async function saveNodeEntries(sourceId: string, nodeId: string, headwords: string[]) {
    return updateTaxonomyNodeEntries(sourceId, nodeId, headwords)
  }

  return {
    sources,
    sourcesLoading,
    treeBySourceId,
    treeLoading,
    fetchSources,
    fetchSource,
    removeSource,
    reimportSource,
    fetchTree,
    fetchNodeEntries,
    renameNode,
    saveNodeEntries,
  }
})
