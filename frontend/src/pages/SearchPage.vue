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
            <el-button :loading="loading" :icon="Search" @click="handleSearch">{{ $t('search.searchBtn') }}</el-button>
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
      </div>
    </el-card>

    <!-- Body: left taxonomy sidebar + right results -->
    <div class="body-row">
      <!-- Left: taxonomy filter -->
      <div class="taxonomy-sidebar">
        <TaxonomyFilterPanel @filter-change="onTaxonomyFilterChange" />
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
          <HeadwordTimeline :entries="result.items" />
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
import { ref, computed, onMounted } from 'vue'
import { Search } from '@element-plus/icons-vue'
import WatermarkOverlay from '@/components/WatermarkOverlay.vue'
import {
  searchHeadword,
  listSearchVersions,
  type HeadwordTimelineEntry,
  type PaginatedSearchResult,
  type SearchVersionInfo,
} from '@/api/search'
import HeadwordTimeline from '@/components/search/HeadwordTimeline.vue'
import TaxonomyFilterPanel from '@/components/taxonomy/TaxonomyFilterPanel.vue'

const query = ref('')
const loading = ref(false)
const searched = ref(false)

const result = ref<PaginatedSearchResult>({ items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 })
const currentPage = ref(1)
const pageSize = ref(20)

// Filter state
const filterVersionId = ref<string | undefined>(undefined)
const filterHeadwordType = ref<'all' | 'single' | 'compound'>('all')
const filterMatchMode = ref<'contains' | 'startsWith'>('contains')
const searchScope = ref<'entry' | 'definition'>('entry')

// Taxonomy filter state
const taxonomyFilter = ref<{ taxonomySourceId: string | null; taxonomyNodeId: string | null }>({
  taxonomySourceId: null,
  taxonomyNodeId: null,
})

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
  allVersions.value = await listSearchVersions().catch(() => [])
})

async function doSearch(page = 1) {
  if (!query.value.trim() && !filterVersionId.value && !taxonomyFilter.value.taxonomyNodeId) return
  loading.value = true
  searched.value = false
  try {
    result.value = await searchHeadword({
      q: query.value.trim() || undefined,
      versionId: filterVersionId.value,
      matchMode: filterMatchMode.value,
      headwordType: filterHeadwordType.value,
      searchScope: searchScope.value,
      page,
      pageSize: pageSize.value,
      taxonomySourceId: taxonomyFilter.value.taxonomySourceId ?? undefined,
      taxonomyNodeId: taxonomyFilter.value.taxonomyNodeId ?? undefined,
    })
    currentPage.value = result.value.page
    searched.value = true
  } finally {
    loading.value = false
  }
}

function handleSearch() {
  currentPage.value = 1
  doSearch(1)
}

function handleFilterChange() {
  if (searched.value) {
    currentPage.value = 1
    doSearch(1)
  }
}

function handlePageChange(page: number) {
  doSearch(page)
}

function handlePageSizeChange(_size: number) {
  currentPage.value = 1
  doSearch(1)
}

function onTaxonomyFilterChange(filter: { taxonomySourceId: string | null; taxonomyNodeId: string | null }) {
  taxonomyFilter.value = filter
  currentPage.value = 1
  doSearch(1)
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
</style>
