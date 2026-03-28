import { apiFetch } from './client'

export interface HeadwordTimelineEntry {
  dictionaryId: string
  dictionaryName: string
  versionId: string
  versionLabel: string
  publishedYear?: number | null
  entry: {
    id: string
    versionId: string
    rawHeadword: string
    normalizedHeadword: string
    phonetic?: string | null
    pageNumber?: number | null
    crossReferences?: string[] | null
    senses: Array<{
      id: string
      rawNumber: string
      normalizedNumber: string
      definition: string
      rawDefinition: string
      grammaticalCat?: string | null
      register?: string | null
      position: number
      examples: Array<{
        id: string
        rawText: string
        normalizedText: string
        position: number
      }>
    }>
  }
}

export interface SearchVersionInfo {
  id: string
  label: string
  dictionaryId: string
  dictionaryName: string
  publishedYear?: number | null
}

export interface PaginatedSearchResult {
  items: HeadwordTimelineEntry[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface SearchParams {
  q?: string
  versionId?: string
  matchMode?: 'contains' | 'startsWith'
  headwordType?: 'all' | 'single' | 'compound'
  searchScope?: 'entry' | 'definition'
  page?: number
  pageSize?: number
  taxonomySourceId?: string
  taxonomyNodeId?: string
}

export async function searchHeadword(params: SearchParams): Promise<PaginatedSearchResult> {
  const urlParams = new URLSearchParams()
  if (params.q) urlParams.set('q', params.q)
  if (params.versionId) urlParams.set('versionId', params.versionId)
  if (params.matchMode) urlParams.set('matchMode', params.matchMode)
  if (params.headwordType) urlParams.set('headwordType', params.headwordType)
  if (params.searchScope) urlParams.set('searchScope', params.searchScope)
  if (params.page) urlParams.set('page', String(params.page))
  if (params.pageSize) urlParams.set('pageSize', String(params.pageSize))
  if (params.taxonomySourceId) urlParams.set('taxonomySourceId', params.taxonomySourceId)
  if (params.taxonomyNodeId) urlParams.set('taxonomyNodeId', params.taxonomyNodeId)
  return apiFetch<PaginatedSearchResult>(`/api/v1/search/headword?${urlParams}`)
}

export async function listSearchVersions(): Promise<SearchVersionInfo[]> {
  return apiFetch<SearchVersionInfo[]>('/api/v1/search/versions')
}
