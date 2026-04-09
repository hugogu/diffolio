<template>
  <div class="search-page">
    <WatermarkOverlay />

    <!-- Top: search bar + filters (full width) -->
    <el-card class="search-card">
      <div class="search-input-row">
        <el-input
          v-model="query"
          :placeholder="$t('search.placeholder')"
          size="large"
          clearable
          @keyup.enter="handleSearch"
        >
          <template #append>
            <ActionButton kind="user" type="primary" :label="$t('search.searchBtn')" :loading="loading" @click="handleSearch" />
          </template>
        </el-input>
        <el-radio-group v-model="searchScope" size="small" @change="handleFilterChange">
          <el-radio-button value="entry">{{ $t('search.scope.entry') }}</el-radio-button>
          <el-radio-button value="definition">{{ $t('search.scope.definition') }}</el-radio-button>
        </el-radio-group>
      </div>

      <div class="filter-row">
        <div class="filter-item">
          <span class="filter-label">{{ $t('search.version') }}：</span>
          <el-select
            v-model="filterVersionId"
            :placeholder="$t('search.allVersions')"
            clearable
            size="small"
            style="min-width: 180px"
            @change="handleFilterChange"
          >
            <el-option-group
              v-for="group in groupedVersions"
              :key="group.dictionaryId"
              :label="group.dictionaryName"
            >
              <el-option
                v-for="v in group.versions"
                :key="v.id"
                :label="`${v.label}${v.publishedYear ? ` (${v.publishedYear})` : ''}`"
                :value="v.id"
              />
            </el-option-group>
          </el-select>
        </div>

        <div class="filter-item">
          <span class="filter-label">{{ $t('search.type') }}：</span>
          <el-radio-group v-model="filterHeadwordType" size="small" @change="handleFilterChange">
            <el-radio-button value="all">{{ $t('search.all') }}</el-radio-button>
            <el-radio-button value="single">{{ $t('search.single') }}</el-radio-button>
            <el-radio-button value="compound">{{ $t('search.compound') }}</el-radio-button>
          </el-radio-group>
        </div>

        <div class="filter-item">
          <span class="filter-label">{{ $t('search.match') }}：</span>
          <el-radio-group v-model="filterMatchMode" size="small" @change="handleFilterChange">
            <el-radio-button value="contains">{{ $t('search.contains') }}</el-radio-button>
            <el-radio-button value="startsWith">{{ $t('search.startsWith') }}</el-radio-button>
          </el-radio-group>
        </div>

        <div class="filter-item filter-item--tags">
          <span class="filter-label">{{ $t('search.tags') }}：</span>
          <el-select
            v-model="selectedTagIds"
            multiple
            collapse-tags
            collapse-tags-tooltip
            clearable
            filterable
            :loading="tagsStore.loading"
            :placeholder="$t('search.allTags')"
            style="min-width: 220px"
            @change="handleFilterChange"
          >
            <el-option
              v-for="tag in tagsStore.tags"
              :key="tag.id"
              :label="tag.name"
              :value="tag.id"
            />
          </el-select>
        </div>
      </div>
    </el-card>

    <!-- Body: left taxonomy sidebar + right results -->
    <div class="body-row">
      <!-- Left: taxonomy filter -->
      <div class="taxonomy-sidebar">
        <TaxonomyFilterPanel
          :selected-source-id="taxonomySourceId"
          :selected-node-id="taxonomyNodeId"
          auto-select-first-source
          @filter-change="onTaxonomyFilterChange"
        />
      </div>

      <!-- Right: results -->
      <div class="results-col">
        <div v-if="loading" class="loading-skeleton">
          <el-skeleton :rows="8" animated />
        </div>

        <el-empty
          v-else-if="searched && result.total === 0"
          :description="$t('search.noResults')"
        />

        <template v-else-if="result.total > 0">
          <div class="result-summary">
            {{ $t('search.resultsSummary', { total: result.total, page: result.page, totalPages: result.totalPages }) }}
          </div>
          <HeadwordTimeline :entries="result.items" @tags-updated="handleTagsUpdated" />
          <div class="pagination-row">
            <el-pagination
              v-model:current-page="currentPage"
              v-model:page-size="pageSize"
              :total="result.total"
              :page-sizes="[10, 20, 50]"
              layout="total, sizes, prev, pager, next, jumper"
              background
              @current-change="handlePageChange"
              @size-change="handlePageSizeChange"
            />
          </div>
        </template>

        <el-empty
          v-else
          :description="$t('search.emptyHint')"
          :image-size="80"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, toRefs, watch } from 'vue'
import WatermarkOverlay from '@/components/WatermarkOverlay.vue'
import {
  searchHeadword,
  listSearchVersions,
  type PaginatedSearchResult,
  type SearchVersionInfo,
} from '@/api/search'
import HeadwordTimeline from '@/components/search/HeadwordTimeline.vue'
import TaxonomyFilterPanel from '@/components/taxonomy/TaxonomyFilterPanel.vue'
import ActionButton from '@/components/common/ActionButton.vue'
import { useTagsStore } from '@/stores/tags'
import {
  enumQueryParam,
  numberQueryParam,
  optionalStringQueryParam,
  stringArrayQueryParam,
  useRouteQueryState,
} from '@/composables/useRouteQueryState'

const loading = ref(false)
const searched = ref(false)
const tagsStore = useTagsStore()

const result = ref<PaginatedSearchResult>({ items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 })

const { state: routeState, updateQuery } = useRouteQueryState(
  {
    q: optionalStringQueryParam(),
    versionId: optionalStringQueryParam(),
    headwordType: enumQueryParam(['all', 'single', 'compound'] as const, 'all'),
    matchMode: enumQueryParam(['contains', 'startsWith'] as const, 'contains'),
    searchScope: enumQueryParam(['entry', 'definition'] as const, 'entry'),
    tagIds: stringArrayQueryParam(),
    taxonomySourceId: optionalStringQueryParam(),
    taxonomyNodeId: optionalStringQueryParam(),
    page: numberQueryParam(1, { min: 1 }),
    pageSize: numberQueryParam(20, { min: 1, max: 100 }),
  },
  {
    onQueryStateChange: async () => {
      await runSearchFromState()
    },
  }
)

const {
  q: query,
  versionId: filterVersionId,
  headwordType: filterHeadwordType,
  matchMode: filterMatchMode,
  searchScope,
  tagIds: selectedTagIds,
  taxonomySourceId,
  taxonomyNodeId,
  page: currentPage,
  pageSize,
} = toRefs(routeState)

// Versions for filter dropdown
const allVersions = ref<SearchVersionInfo[]>([])

const groupedVersions = computed(() => {
  const map = new Map<string, { dictionaryId: string; dictionaryName: string; versions: SearchVersionInfo[] }>()
  for (const v of allVersions.value) {
    if (!map.has(v.dictionaryId)) {
      map.set(v.dictionaryId, { dictionaryId: v.dictionaryId, dictionaryName: v.dictionaryName, versions: [] })
    }
    map.get(v.dictionaryId)!.versions.push(v)
  }
  return [...map.values()]
})

onMounted(async () => {
  const [versions] = await Promise.all([
    listSearchVersions().catch(() => []),
    tagsStore.loadTags().catch(() => []),
  ])
  allVersions.value = versions
})

watch(
  () => tagsStore.tags.map((tag) => `${tag.id}:${tag.name}:${tag.usageCount}`),
  (current, previous) => {
    if (!searched.value) return
    if (!previous || previous.length === 0) return

    const availableTagIds = new Set(tagsStore.tags.map((tag) => tag.id))
    const nextSelectedTagIds = selectedTagIds.value.filter((tagId) => availableTagIds.has(tagId))
    const selectionChanged = nextSelectedTagIds.length !== selectedTagIds.value.length
    if (selectionChanged) {
      selectedTagIds.value = nextSelectedTagIds
      void updateQuery({ tagIds: nextSelectedTagIds })
    }

    if (selectionChanged || selectedTagIds.value.length > 0) {
      void doSearch(currentPage.value)
    }
  }
)

function hasSearchCriteria() {
  return Boolean(
    query.value?.trim() ||
    filterVersionId.value ||
    taxonomyNodeId.value ||
    selectedTagIds.value.length > 0
  )
}

async function doSearch(page = 1) {
  if (!hasSearchCriteria()) {
    result.value = { items: [], total: 0, page: 1, pageSize: pageSize.value, totalPages: 0 }
    searched.value = false
    return
  }
  loading.value = true
  searched.value = false
  try {
    result.value = await searchHeadword({
      q: query.value?.trim() || undefined,
      versionId: filterVersionId.value,
      matchMode: filterMatchMode.value,
      headwordType: filterHeadwordType.value,
      searchScope: searchScope.value,
      page,
      pageSize: pageSize.value,
      taxonomySourceId: taxonomySourceId.value ?? undefined,
      taxonomyNodeId: taxonomyNodeId.value ?? undefined,
      tagIds: selectedTagIds.value,
    })
    currentPage.value = result.value.page
    searched.value = true
  } finally {
    loading.value = false
  }
}

async function runSearchFromState() {
  if (!hasSearchCriteria()) {
    result.value = { items: [], total: 0, page: 1, pageSize: pageSize.value, totalPages: 0 }
    searched.value = false
    return
  }
  await doSearch(currentPage.value)
}

async function handleSearch() {
  currentPage.value = 1
  await updateQuery({ page: 1 })
  await doSearch(1)
}

async function handleFilterChange() {
  currentPage.value = 1
  await updateQuery({ page: 1 })
  if (hasSearchCriteria()) {
    await doSearch(1)
  } else {
    result.value = { items: [], total: 0, page: 1, pageSize: pageSize.value, totalPages: 0 }
    searched.value = false
  }
}

async function handlePageChange(page: number) {
  currentPage.value = page
  await updateQuery({ page })
  await doSearch(page)
}

async function handlePageSizeChange(_size: number) {
  currentPage.value = 1
  await updateQuery({ page: 1 })
  await runSearchFromState()
}

async function onTaxonomyFilterChange(filter: { taxonomySourceId: string | null; taxonomyNodeId: string | null }) {
  taxonomySourceId.value = filter.taxonomySourceId ?? undefined
  taxonomyNodeId.value = filter.taxonomyNodeId ?? undefined
  currentPage.value = 1
  await updateQuery({ page: 1 })
  await runSearchFromState()
}

function handleTagsUpdated(payload: { entryId: string; tags: PaginatedSearchResult['items'][number]['entry']['tags'] }) {
  result.value = {
    ...result.value,
    items: result.value.items.map((item) =>
      item.entry.id === payload.entryId
        ? {
            ...item,
            entry: {
              ...item.entry,
              tags: payload.tags,
            },
          }
        : item
    ),
  }

  if (selectedTagIds.value.length > 0) {
    void doSearch(currentPage.value)
  }
}
</script>

<style scoped>
/* Page root: flex column filling el-main height */
.search-page {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 100px); /* 60px header + 40px el-main padding */
}

.search-card {
  flex-shrink: 0;
  margin-bottom: 12px;
}

/* Body row fills remaining height */
.body-row {
  flex: 1;
  display: flex;
  gap: 12px;
  min-height: 0; /* allow flex children to shrink/scroll */
  overflow: hidden;
}

/* Left taxonomy sidebar */
.taxonomy-sidebar {
  width: 224px;
  flex-shrink: 0;
  overflow-y: auto;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  padding: 12px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}

/* Right results column */
.results-col {
  flex: 1;
  overflow-y: auto;
  min-width: 0;
}

/* Search input row with scope toggle */
.search-input-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.search-input-row .el-radio-group {
  display: flex;
  flex-direction: row;
  flex-shrink: 0;
}

.filter-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-top: 10px;
}

.filter-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.filter-label {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}

.loading-skeleton { padding: 8px 0; }

.result-summary {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  margin-bottom: 10px;
}

.pagination-row {
  display: flex;
  justify-content: center;
  margin-top: 20px;
  padding-bottom: 20px;
}

@media (max-width: 900px) {
  .search-page {
    height: auto;
    min-height: 0;
  }

  .body-row {
    flex-direction: column;
    overflow: visible;
  }

  .taxonomy-sidebar {
    width: 100%;
  }

  .results-col {
    overflow: visible;
  }

  .search-input-row {
    flex-direction: column;
    align-items: stretch;
  }

  .filter-item {
    flex-wrap: wrap;
  }
}
</style>
