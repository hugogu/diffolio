<template>
  <div v-loading="loading" class="comparison-page">
    <WatermarkOverlay />
    <!-- Header with stats and export -->
    <div class="page-header">
      <div>
        <el-breadcrumb style="margin-bottom: 6px">
          <el-breadcrumb-item :to="{ path: '/comparisons' }">{{ $t('comparisonDetail.breadcrumb') }}</el-breadcrumb-item>
          <el-breadcrumb-item>{{ $t('comparisonDetail.breadcrumbResult') }}</el-breadcrumb-item>
        </el-breadcrumb>
        <h2 class="page-title">
          <span class="version-label">{{ versionLabelA }}</span>
          <span class="vs-sep">{{ $t('comparisonDetail.vs') }}</span>
          <span class="version-label">{{ versionLabelB }}</span>
        </h2>
      </div>
      <div class="header-right">
        <div v-if="comparison" class="stats-compact">
          <el-tag size="small" class="stat-item">{{ $t('comparisonDetail.stats.matched') }}: {{ comparison.matched ?? 0 }}</el-tag>
          <el-tag size="small" type="success" class="stat-item">{{ $t('comparisonDetail.stats.added') }}: {{ comparison.addedInB ?? 0 }}</el-tag>
          <el-tag size="small" type="danger" class="stat-item">{{ $t('comparisonDetail.stats.deleted') }}: {{ comparison.deletedFromA ?? 0 }}</el-tag>
          <el-tag size="small" type="warning" class="stat-item">{{ $t('comparisonDetail.stats.changed') }}: {{ comparison.definitionChanged ?? 0 }}</el-tag>
        </div>
        <el-button
          v-if="comparison?.status === 'COMPLETED' && pageLockedCount > 0"
          size="small"
          :loading="unlockingPage"
          @click="handlePageUnlock"
        >
          <el-icon style="margin-right: 4px"><Unlock /></el-icon>
          {{ $t('comparisonDetail.unlockPage') }} ({{ pageLockedCount }})
        </el-button>
        <el-button
          v-if="comparison?.status === 'COMPLETED'"
          size="small"
          :loading="unlockingAll"
          @click="handleBulkUnlock"
        >
          <el-icon style="margin-right: 4px"><Lock /></el-icon>
          {{ $t('comparisonDetail.unlockAll') }}
        </el-button>
        <ExportDownloadButton
          v-if="comparison"
          :comparison-id="route.params.id as string"
          :disabled="comparison.status !== 'COMPLETED'"
          :sense-change-types="senseChangeTypeFilter"
          :taxonomy-source-id="taxonomyFilter.taxonomySourceId"
        />
      </div>
    </div>

    <el-alert
      v-if="comparison?.status === 'RUNNING'"
      :title="$t('comparisonDetail.running')"
      type="info"
      show-icon
      :closable="false"
      style="margin-bottom: 12px"
    />

    <!-- Zero-energy banner -->
    <el-alert
      v-if="subscriptionStore.isZeroEnergy"
      type="warning"
      :closable="false"
      style="margin-bottom: 10px"
    >
      <template #title>
        {{ $t('comparisonDetail.zeroEnergy') }}
      </template>
      <template #default>
        <el-button size="small" link type="primary" @click="$router.push('/subscription#topup')">{{ $t('comparisonDetail.buyTopup') }}</el-button>
        <el-divider direction="vertical" />
        <span style="font-size: 12px; color: var(--el-text-color-secondary)">{{ $t('comparisonDetail.resetNextMonth') }}</span>
      </template>
    </el-alert>

    <template v-if="comparison?.status === 'COMPLETED'">
      <!-- Filter bar: search + sense change types + taxonomy inline -->
      <div class="filter-bar">
        <el-input
          v-model="searchHeadword"
          :placeholder="$t('comparisonDetail.searchHeadword')"
          clearable
          style="width: 140px"
          @input="onSearchInput"
          @clear="onSearch"
        >
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>
        <el-input
          v-model="searchText"
          :placeholder="$t('comparisonDetail.searchText')"
          clearable
          style="width: 180px"
          @input="onSearchInput"
          @clear="onSearch"
        >
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>
        
        <!-- 义项变更类型多选 -->
        <el-select
          v-model="senseChangeTypeFilter"
          multiple
          collapse-tags
          collapse-tags-tooltip
          :placeholder="$t('comparisonDetail.senseChangeTypes')"
          style="width: 180px"
          @change="onFilterChange"
        >
          <el-option :label="$t('comparisonDetail.senseChange.definition')" value="DEFINITION_CHANGED" />
          <el-option :label="$t('comparisonDetail.senseChange.pos')" value="POS_CHANGED" />
          <el-option :label="$t('comparisonDetail.senseChange.example')" value="EXAMPLE_CHANGED" />
        </el-select>
        
        <el-divider direction="vertical" style="margin: 0 4px" />
        
        <!-- 分类筛选 inline -->
        <el-select
          v-model="taxonomyFilter.taxonomySourceId"
          :placeholder="$t('comparisonDetail.taxonomy')"
          clearable
          style="width: 140px"
          @change="onTaxonomySourceChange"
        >
          <el-option
            v-for="s in activeTaxonomySources"
            :key="s.id"
            :label="s.name"
            :value="s.id"
          />
        </el-select>
        <el-tree-select
          v-if="taxonomyFilter.taxonomySourceId"
          v-model="taxonomyFilter.taxonomyNodeIds"
          :data="taxonomyTreeData"
          :props="{ label: 'label', value: 'id', children: 'children' }"
          :placeholder="$t('comparisonDetail.selectTaxonomy')"
          multiple
          check-strictly
          check-on-click-node
          clearable
          collapse-tags
          collapse-tags-tooltip
          style="width: 220px"
          @change="onFilterChange"
        />
      </div>

      <!-- Split view -->
      <div class="split-view">
        <!-- Left: entry list -->
        <div class="list-pane">
          <div class="list-scroll">
            <div
              v-for="a in alignments"
              :key="a.id"
              class="entry-item"
              :class="{ 'entry-item--active': selectedAlignment?.id === a.id }"
              @click="selectAlignment(a)"
            >
              <div class="entry-top">
                <span class="entry-hw">{{ entryHeadword(a) }}</span>
                <el-tag :type="changeTagType(a)" size="small" class="entry-tag">{{ changeLabel(a) }}</el-tag>
                <el-button
                  v-if="a.locked"
                  size="small"
                  type="primary"
                  link
                  class="entry-unlock-btn"
                  :loading="unlockingEntry === entryNormalizedHw(a)"
                  @click.stop="handleSingleUnlock(a)"
                >{{ $t('comparisonDetail.unlock') }}</el-button>
                <el-icon v-else-if="!a.locked" class="unlocked-icon-sm"><Unlock /></el-icon>
              </div>
              <div v-if="!a.locked && entryPreview(a)" class="entry-preview">{{ entryPreview(a) }}</div>
              <div v-else-if="a.locked" class="entry-preview entry-preview--locked">{{ $t('comparisonDetail.locked') }}</div>
            </div>

            <div v-if="alignments.length === 0 && !listLoading" class="list-empty">
              <el-empty :description="$t('comparisonDetail.noResults')" :image-size="56" />
            </div>
            <div v-if="listLoading" class="list-loading">
              <el-icon class="is-loading"><Loading /></el-icon> {{ $t('comparisonDetail.loading') }}
            </div>
          </div>

          <div class="list-footer">
            <el-pagination
              v-model:current-page="currentPage"
              :page-size="pageSize"
              :total="total"
              :pager-count="5"
              layout="total, prev, pager, next"
              size="small"
              class="list-pagination"
              @current-change="onPageChange"
            />
          </div>
        </div>

        <!-- Right: detail panel -->
        <div class="detail-pane">
          <el-empty
            v-if="!selectedAlignment"
            :description="$t('comparisonDetail.selectEntry')"
            style="margin-top: 80px"
          />
          <EntryDetailPanel
            v-else
            :alignment="selectedAlignment"
            :label-a="versionLabelA"
            :label-b="versionLabelB"
          />
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import WatermarkOverlay from '@/components/WatermarkOverlay.vue'
import { Search, Loading, Lock, Unlock } from '@element-plus/icons-vue'
import { useComparisonsStore } from '@/stores/comparisons'
import { ElMessage, ElMessageBox } from 'element-plus'
import EntryDetailPanel from '@/components/diff/EntryDetailPanel.vue'
import ExportDownloadButton from '@/components/diff/ExportDownloadButton.vue'
import { useTaxonomyStore } from '@/stores/taxonomy'
import { useSubscriptionStore } from '@/stores/subscription'
import { getDictionaryUnlockStats } from '@/api/subscription'
import type { EntryAlignment } from '@/api/comparisons'
import type { TaxonomyNodeTree } from '@/api/taxonomy'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const route = useRoute()
const store = useComparisonsStore()
const taxonomyStore = useTaxonomyStore()
const subscriptionStore = useSubscriptionStore()

const loading = ref(false)
const listLoading = ref(false)
const comparison = ref(store.current)
const alignments = ref(store.alignments)
const selectedAlignment = ref<EntryAlignment | null>(null)

const senseChangeTypeFilter = ref<string[]>([])
const searchHeadword = ref('')
const searchText = ref('')
const currentPage = ref(1)
const pageSize = ref(20)
const total = ref(0)
const taxonomyFilter = ref<{ taxonomySourceId: string | null; taxonomyNodeIds: string[] }>({
  taxonomySourceId: null,
  taxonomyNodeIds: [],
})

const activeTaxonomySources = computed(() => taxonomyStore.sources.filter((s) => s.status === 'ACTIVE'))
const taxonomyTreeData = computed(() => {
  const sourceId = taxonomyFilter.value.taxonomySourceId
  return sourceId ? taxonomyStore.treeBySourceId[sourceId] ?? [] : []
})

let searchTimer: ReturnType<typeof setTimeout> | null = null

const versionLabelA = computed(() => {
  const va = comparison.value?.versionA
  if (!va) return ''
  return `${va.dictionary?.name ?? ''} ${va.label}`.trim()
})

const versionLabelB = computed(() => {
  const vb = comparison.value?.versionB
  if (!vb) return ''
  return `${vb.dictionary?.name ?? ''} ${vb.label}`.trim()
})

onMounted(async () => {
  loading.value = true
  try {
    comparison.value = await store.fetchComparison(route.params.id as string)
    if (comparison.value.status === 'COMPLETED') {
      await loadAlignments()
    }
  } catch {
    ElMessage.error(t('comparisonDetail.errors.loadFailed'))
  } finally {
    loading.value = false
  }
  
  // Load taxonomy sources
  if (!taxonomyStore.sources.length) {
    taxonomyStore.fetchSources()
  }
})

// Watch for taxonomy source changes to load tree
watch(() => taxonomyFilter.value.taxonomySourceId, (newId) => {
  if (newId && !taxonomyStore.treeBySourceId[newId]) {
    taxonomyStore.fetchTree(newId)
  }
  taxonomyFilter.value.taxonomyNodeIds = []
})

async function loadAlignments() {
  listLoading.value = true
  // Allow UI to update loading state before heavy operations
  await nextTick()
  
  try {
    const result = await store.fetchAlignments(route.params.id as string, {
      page: currentPage.value,
      pageSize: pageSize.value,
      senseChangeType: senseChangeTypeFilter.value.length > 0 
        ? senseChangeTypeFilter.value.join(',') 
        : undefined,
      headword: searchHeadword.value.trim() || undefined,
      q: searchText.value.trim() || undefined,
      taxonomySourceId: taxonomyFilter.value.taxonomySourceId ?? undefined,
      taxonomyNodeId: taxonomyFilter.value.taxonomyNodeIds.length > 0
        ? taxonomyFilter.value.taxonomyNodeIds.join(',')
        : undefined,
    })
    
    // Batch updates to reduce re-renders
    alignments.value = store.alignments
    total.value = result.total
    
    // Clear selection without triggering immediate re-render of detail panel
    if (selectedAlignment.value) {
      selectedAlignment.value = null
      await nextTick()
    }
  } finally {
    listLoading.value = false
  }
}

function onSearchInput() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => { currentPage.value = 1; loadAlignments() }, 400)
}

async function onSearch() {
  currentPage.value = 1
  await loadAlignments()
}

async function onFilterChange() {
  currentPage.value = 1
  await loadAlignments()
}

function onTaxonomySourceChange() {
  onFilterChange()
}

async function onPageChange(page: number) {
  currentPage.value = page
  await loadAlignments()
}

function selectAlignment(a: EntryAlignment) {
  selectedAlignment.value = a
}

// ── Entry list helpers ────────────────────────────────────────────────────────
function entryHeadword(a: EntryAlignment): string {
  return String(
    (a.entryA as Record<string, unknown> | null)?.rawHeadword ??
    (a.entryB as Record<string, unknown> | null)?.rawHeadword ?? '—'
  )
}

function changeTagType(a: EntryAlignment): string {
  if (a.changeType === 'ADDED') return 'success'
  if (a.changeType === 'DELETED') return 'danger'
  if (a.changeType === 'MATCHED_VARIANT') return 'info'
  const hasChange = (a.senseDiffs ?? []).some(
    (sd) => (sd as Record<string, unknown>)['changeType'] !== 'MATCHED'
  )
  return hasChange ? 'warning' : 'info'
}

function changeLabel(a: EntryAlignment): string {
  if (a.changeType === 'ADDED') return t('comparisonDetail.entryStatus.added')
  if (a.changeType === 'DELETED') return t('comparisonDetail.entryStatus.deleted')
  if (a.changeType === 'MATCHED_VARIANT') return t('comparisonDetail.entryStatus.variant')
  const hasChange = (a.senseDiffs ?? []).some(
    (sd) => (sd as Record<string, unknown>)['changeType'] !== 'MATCHED'
  )
  return hasChange ? t('comparisonDetail.entryStatus.hasChanges') : t('comparisonDetail.entryStatus.matched')
}

function entryPreview(a: EntryAlignment): string {
  const entry = ((a.entryA ?? a.entryB) as Record<string, unknown> | null)
  const senses = (entry?.['senses'] ?? []) as Record<string, unknown>[]
  const first = senses[0]
  if (!first) return ''
  const def = String(first['rawDefinition'] ?? first['definition'] ?? '')
  return def.length > 55 ? def.slice(0, 55) + '…' : def
}

// ── Lock / Unlock helpers ─────────────────────────────────────────────────────
const dictionaryId = computed(() => comparison.value?.versionA?.dictionary?.id ?? '')

const pageLockedCount = computed(() => alignments.value.filter((a) => a.locked).length)

const unlockingAll = ref(false)
const unlockingPage = ref(false)
const unlockingEntry = ref<string | null>(null)

function entryNormalizedHw(a: EntryAlignment): string {
  return String(
    (a.entryA as Record<string, unknown> | null)?.normalizedHeadword ??
    (a.entryB as Record<string, unknown> | null)?.normalizedHeadword ?? ''
  )
}

function handleUnlockError(err: unknown) {
  const e = err as { code?: string }
  if (e?.code === 'INSUFFICIENT_ENERGY' || e?.code === 'FREE_TIER_CAP') {
    ElMessage.warning(t('comparisonDetail.errors.insufficientEnergy'))
  } else if (e?.code === 'SUBSCRIPTION_REQUIRED') {
    ElMessage.warning(t('comparisonDetail.errors.subscriptionRequired'))
  } else if (e?.code === 'SUBSCRIPTION_GRACE') {
    ElMessage.warning(t('comparisonDetail.errors.subscriptionGrace'))
  } else {
    ElMessage.error(t('comparisonDetail.errors.unlockFailed'))
  }
}

async function handleBulkUnlock() {
  const id = dictionaryId.value
  if (!id) return

  let lockedCount = 0
  try {
    const stats = await getDictionaryUnlockStats(id)
    lockedCount = stats.lockedCount
  } catch {
    ElMessage.error(t('comparisonDetail.errors.loadFailed'))
    return
  }

  if (lockedCount === 0) {
    ElMessage.info(t('comparisonDetail.errors.allUnlocked'))
    return
  }

  try {
    await ElMessageBox.confirm(
      t('comparisonDetail.unlockConfirm.allMessage', { count: lockedCount }),
      t('comparisonDetail.unlockConfirm.allTitle'),
      { confirmButtonText: t('comparisonDetail.unlockConfirm.confirmBtn'), cancelButtonText: t('common.cancel'), type: 'warning' }
    )
  } catch {
    return // user cancelled
  }

  unlockingAll.value = true
  try {
    await subscriptionStore.unlockAllWords(id)
    ElMessage.success(t('comparisonDetail.unlockSuccess'))
    await loadAlignments()
    await subscriptionStore.fetchEnergyBalance()
  } catch (err: unknown) {
    handleUnlockError(err)
  } finally {
    unlockingAll.value = false
  }
}

async function handlePageUnlock() {
  const id = dictionaryId.value
  if (!id) return

  const lockedOnPage = alignments.value.filter((a) => a.locked)
  if (lockedOnPage.length === 0) return

  const headwords = lockedOnPage.map((a) => entryNormalizedHw(a)).filter(Boolean)
  try {
    await ElMessageBox.confirm(
      t('comparisonDetail.unlockConfirm.pageMessage', { count: headwords.length }),
      t('comparisonDetail.unlockConfirm.pageTitle'),
      { confirmButtonText: t('comparisonDetail.unlockConfirm.confirmBtn'), cancelButtonText: t('common.cancel'), type: 'warning' }
    )
  } catch {
    return
  }

  unlockingPage.value = true
  try {
    await subscriptionStore.unlockHeadwords(id, headwords)
    ElMessage.success(t('comparisonDetail.unlockSuccess'))
    await loadAlignments()
    await subscriptionStore.fetchEnergyBalance()
  } catch (err: unknown) {
    handleUnlockError(err)
  } finally {
    unlockingPage.value = false
  }
}

async function handleSingleUnlock(a: EntryAlignment) {
  const id = dictionaryId.value
  if (!id) return

  const hw = entryNormalizedHw(a)
  if (!hw) return

  unlockingEntry.value = hw
  try {
    await subscriptionStore.unlockWord(id, hw)
    ElMessage.success(t('comparisonDetail.singleUnlockSuccess', { headword: entryHeadword(a) }))
    await Promise.all([loadAlignments(), subscriptionStore.fetchEnergyBalance()])
  } catch (err: unknown) {
    handleUnlockError(err)
  } finally {
    unlockingEntry.value = null
  }
}
</script>

<style scoped>
.comparison-page { display: flex; flex-direction: column; height: 100%; }

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
}
.page-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.version-label { font-weight: 600; }
.vs-sep { color: var(--el-text-color-secondary); font-size: 14px; font-weight: 400; }

.header-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.stats-compact {
  display: flex;
  align-items: center;
  gap: 8px;
}
.stat-item {
  font-family: var(--el-font-family);
  font-weight: 500;
}

.filter-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
  padding: 8px 0;
}

/* Ensure consistent height for all filter inputs */
.filter-bar :deep(.el-input__wrapper),
.filter-bar :deep(.el-select .el-input__wrapper) {
  height: 32px;
}

/* Split view */
.split-view {
  display: flex;
  gap: 0;
  flex: 1;
  min-height: 0;
  height: calc(100vh - 240px);
  min-height: 480px;
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  overflow: hidden;
}

/* Left pane */
.list-pane {
  width: 320px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--el-border-color);
}
.list-scroll {
  flex: 1;
  overflow-y: auto;
}
.list-footer {
  padding: 8px 12px;
  border-top: 1px solid var(--el-border-color-lighter);
  background: var(--el-fill-color-lighter);
}

.list-footer :deep(.list-pagination) {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  row-gap: 8px;
  width: 100%;
}

.list-footer :deep(.list-pagination .el-pagination__total) {
  flex: 0 0 100%;
  margin-right: 0;
}

.list-footer :deep(.list-pagination .btn-prev),
.list-footer :deep(.list-pagination .btn-next),
.list-footer :deep(.list-pagination .el-pager) {
  margin-top: 0;
}

.list-footer :deep(.list-pagination .el-pager) {
  display: flex;
  flex-wrap: nowrap;
  min-width: 0;
}
.list-empty { padding: 24px 0; }
.list-loading {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 16px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.entry-item {
  padding: 10px 14px;
  cursor: pointer;
  border-bottom: 1px solid var(--el-border-color-lighter);
  transition: background 0.15s;
}
.entry-item:hover { background: var(--el-fill-color-light); }
.entry-item--active {
  background: var(--el-color-primary-light-9);
  border-left: 3px solid var(--el-color-primary);
  padding-left: 11px;
}
.entry-top { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
.lock-icon-sm { color: var(--el-color-info); font-size: 12px; flex-shrink: 0; }
.entry-hw { font-weight: bold; font-size: 15px; word-break: break-all; }
.entry-tag { flex-shrink: 0; }
.entry-preview {
  margin-top: 3px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Right pane */
.detail-pane {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
}
</style>
