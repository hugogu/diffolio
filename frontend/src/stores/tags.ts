import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  addAlignmentTag,
  addEntryTag,
  listTags,
  removeAlignmentTag,
  removeEntryTag,
  renameTag,
  type AlignmentTagMutationResult,
  type EntryTagMutationResult,
  type TagListItem,
  type TagSummary,
} from '@/api/tags'

export const useTagsStore = defineStore('tags', () => {
  const tags = ref<TagListItem[]>([])
  const loading = ref(false)
  const currentQuery = ref('')
  const currentLimit = ref(200)

  const tagOptions = computed<TagSummary[]>(() => tags.value.map(({ id, name }) => ({ id, name })))

  async function loadTags(params: { q?: string; limit?: number } = {}) {
    currentQuery.value = params.q ?? ''
    currentLimit.value = params.limit ?? 200
    loading.value = true
    try {
      const result = await listTags({ q: currentQuery.value || undefined, limit: currentLimit.value })
      tags.value = result.items
      return result.items
    } finally {
      loading.value = false
    }
  }

  async function refreshTags() {
    return loadTags({ q: currentQuery.value || undefined, limit: currentLimit.value })
  }

  async function renameExistingTag(tagId: string, name: string) {
    const result = await renameTag(tagId, name)
    await refreshTags()
    return result
  }

  async function addTagToEntry(entryId: string, payload: { tagId?: string; name?: string }): Promise<EntryTagMutationResult> {
    const result = await addEntryTag(entryId, payload)
    await refreshTags()
    return result
  }

  async function removeTagFromEntry(entryId: string, tagId: string): Promise<EntryTagMutationResult> {
    const result = await removeEntryTag(entryId, tagId)
    await refreshTags()
    return result
  }

  async function addTagToAlignment(
    comparisonId: string,
    alignmentId: string,
    payload: { tagId?: string; name?: string }
  ): Promise<AlignmentTagMutationResult> {
    const result = await addAlignmentTag(comparisonId, alignmentId, payload)
    await refreshTags()
    return result
  }

  async function removeTagFromAlignment(
    comparisonId: string,
    alignmentId: string,
    tagId: string
  ): Promise<AlignmentTagMutationResult> {
    const result = await removeAlignmentTag(comparisonId, alignmentId, tagId)
    await refreshTags()
    return result
  }

  return {
    tags,
    loading,
    tagOptions,
    loadTags,
    refreshTags,
    renameExistingTag,
    addTagToEntry,
    removeTagFromEntry,
    addTagToAlignment,
    removeTagFromAlignment,
  }
})
