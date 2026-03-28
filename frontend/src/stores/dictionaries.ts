import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  getDictionaries,
  getDictionary,
  createDictionary,
  getVersions,
  createVersion,
  type Dictionary,
  type DictionaryVersion,
} from '@/api/dictionaries'

export const useDictionariesStore = defineStore('dictionaries', () => {
  const dictionaries = ref<Dictionary[]>([])
  const selectedDictionary = ref<(Dictionary & { versions: DictionaryVersion[] }) | null>(null)
  const versions = ref<DictionaryVersion[]>([])
  const nextCursor = ref<string | null>(null)
  const hasMore = ref(false)

  async function fetchDictionaries(cursor?: string) {
    const result = await getDictionaries(cursor)
    if (cursor) {
      dictionaries.value.push(...result.items)
    } else {
      dictionaries.value = result.items
    }
    nextCursor.value = result.nextCursor
    hasMore.value = result.hasMore
  }

  async function fetchDictionary(id: string) {
    const dict = await getDictionary(id)
    selectedDictionary.value = dict
    return dict
  }

  async function addDictionary(data: Parameters<typeof createDictionary>[0]) {
    const dict = await createDictionary(data)
    dictionaries.value.unshift(dict)
    return dict
  }

  async function fetchVersions(dictionaryId: string) {
    versions.value = await getVersions(dictionaryId)
    return versions.value
  }

  async function addVersion(dictionaryId: string, data: Parameters<typeof createVersion>[1]) {
    const version = await createVersion(dictionaryId, data)
    versions.value.push(version)
    return version
  }

  return {
    dictionaries,
    selectedDictionary,
    versions,
    nextCursor,
    hasMore,
    fetchDictionaries,
    fetchDictionary,
    addDictionary,
    fetchVersions,
    addVersion,
  }
})
