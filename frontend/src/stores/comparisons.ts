import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  createComparison,
  getComparison,
  getAlignments,
  listComparisons,
  type Comparison,
  type ComparisonListItem,
  type EntryAlignment,
} from '@/api/comparisons'

export const useComparisonsStore = defineStore('comparisons', () => {
  const comparisons = ref<ComparisonListItem[]>([])
  const comparisonsLoading = ref(false)
  const current = ref<Comparison | null>(null)
  const alignments = ref<EntryAlignment[]>([])
  const alignmentsTotal = ref(0)
  const alignmentsTotalPages = ref(0)
  const alignmentsPage = ref(1)

  async function listAllComparisons() {
    comparisonsLoading.value = true
    try {
      const result = await listComparisons()
      comparisons.value = result.items
    } finally {
      comparisonsLoading.value = false
    }
  }

  async function createNewComparison(versionAId: string, versionBId: string) {
    const comp = await createComparison(versionAId, versionBId)
    current.value = comp
    return comp
  }

  async function fetchComparison(id: string) {
    const comp = await getComparison(id)
    current.value = comp
    return comp
  }

  async function fetchAlignments(
    id: string,
    filters: {
      page?: number
      pageSize?: number
      changeTypes?: string[]
      senseChangeType?: string
      headword?: string
      q?: string
      taxonomySourceId?: string
      taxonomyNodeId?: string
    } = {}
  ) {
    const result = await getAlignments(id, filters)
    alignments.value = result.items
    alignmentsTotal.value = result.total
    alignmentsTotalPages.value = result.totalPages
    alignmentsPage.value = result.page
    return result
  }

  return {
    comparisons,
    comparisonsLoading,
    current,
    alignments,
    alignmentsTotal,
    alignmentsTotalPages,
    alignmentsPage,
    listAllComparisons,
    createNewComparison,
    fetchComparison,
    fetchAlignments,
  }
})
