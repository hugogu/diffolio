import { ref } from 'vue'

export interface SenseSelection {
  entryId: string
  senseId: string
}

export function useSenseLineage() {
  const selectedSense = ref<SenseSelection | null>(null)
  const highlightedSenseIds = ref<Set<string>>(new Set())

  function selectSense(selection: SenseSelection) {
    selectedSense.value = selection
    // Add current sense to highlights
    highlightedSenseIds.value = new Set([selection.senseId])
  }

  function clearSelection() {
    selectedSense.value = null
    highlightedSenseIds.value = new Set()
  }

  function isHighlighted(senseId: string): boolean {
    return highlightedSenseIds.value.has(senseId)
  }

  return { selectedSense, highlightedSenseIds, selectSense, clearSelection, isHighlighted }
}
