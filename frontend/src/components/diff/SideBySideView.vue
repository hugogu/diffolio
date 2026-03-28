<template>
  <div class="side-by-side">
    <vxe-table
      :data="alignments"
      border
      stripe
      @row-click="onRowClick"
    >
      <vxe-column type="seq" width="50" fixed="left" />

      <vxe-column title="词头" width="120" fixed="left">
        <template #default="{ row }">
          <div class="hw">{{ row.entryA?.rawHeadword ?? row.entryB?.rawHeadword ?? '—' }}</div>
        </template>
      </vxe-column>

      <vxe-column title="变更" width="80" fixed="left">
        <template #default="{ row }">
          <el-tag :type="statusTag(row)" size="small">{{ statusLabel(row) }}</el-tag>
        </template>
      </vxe-column>

      <vxe-column title="版本 A 释义" min-width="280">
        <template #default="{ row }">
          <WordLockOverlay :locked="!!row.locked" @unlock="handleUnlock(row)">
            <template v-if="row.entryA">
              <div
                v-for="sense in row.entryA.senses ?? []"
                :key="sense.id"
                class="sense-line"
              >
                <span class="sense-num">{{ sense.rawNumber }}</span>
                <span v-html="renderSense(row, sense, 'A')" />
              </div>
              <div
                v-if="(row.entryA as any)?.crossReferences?.length"
                class="cross-ref-row"
              >
                <span class="cross-ref-label">另见：</span>
                <span>{{ (row.entryA as any).crossReferences.join('；') }}</span>
              </div>
            </template>
            <span v-else class="empty-cell">(新增)</span>
          </WordLockOverlay>
        </template>
      </vxe-column>

      <vxe-column title="版本 B 释义" min-width="280">
        <template #default="{ row }">
          <WordLockOverlay :locked="!!row.locked" @unlock="handleUnlock(row)">
            <template v-if="row.entryB">
              <div
                v-for="sense in row.entryB.senses ?? []"
                :key="sense.id"
                class="sense-line"
              >
                <span class="sense-num">{{ sense.rawNumber }}</span>
                <span v-html="renderSense(row, sense, 'B')" />
              </div>
              <div
                v-if="(row.entryB as any)?.crossReferences?.length"
                class="cross-ref-row"
              >
                <span class="cross-ref-label">另见：</span>
                <span>{{ (row.entryB as any).crossReferences.join('；') }}</span>
              </div>
            </template>
            <span v-else class="empty-cell">(已删除)</span>
          </WordLockOverlay>
        </template>
      </vxe-column>
    </vxe-table>
  </div>
</template>

<script setup lang="ts">
import DiffMatchPatch from 'diff-match-patch'
import { ElMessage } from 'element-plus'
import type { EntryAlignment } from '@/api/comparisons'
import WordLockOverlay from '@/components/subscription/WordLockOverlay.vue'
import { useSubscriptionStore } from '@/stores/subscription'

const props = defineProps<{
  alignments: EntryAlignment[]
  dictionaryId: string
}>()

const subscriptionStore = useSubscriptionStore()

const emit = defineEmits<{
  'select': [alignment: EntryAlignment]
  'unlocked': [normalizedHeadword: string]
}>()

function onRowClick({ row }: { row: EntryAlignment }) {
  emit('select', row)
}

async function handleUnlock(row: EntryAlignment) {
  const normalizedHeadword =
    (row.entryA as Record<string, unknown> | null)?.['normalizedHeadword'] as string ??
    (row.entryB as Record<string, unknown> | null)?.['normalizedHeadword'] as string
  if (!normalizedHeadword) return

  try {
    await subscriptionStore.unlockWord(props.dictionaryId, normalizedHeadword)
    row.locked = false
    emit('unlocked', normalizedHeadword)
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string }
    if (e?.code === 'INSUFFICIENT_ENERGY' || e?.code === 'FREE_TIER_CAP') {
      ElMessage.warning('电量不足，请购买快充包或等待下月刷新')
    } else if (e?.code === 'SUBSCRIPTION_REQUIRED') {
      ElMessage.warning('需要捐赠权限才能解锁词条，请先前往捐赠方案页')
    } else {
      ElMessage.error('解锁失败，请稍后重试')
    }
  }
}

function hasRealChange(row: EntryAlignment): boolean {
  if (row.changeType !== 'MATCHED') return true
  // MATCHED senseDiffs are stored for all compared senses (even unchanged ones).
  // Only non-MATCHED sense diffs represent actual content changes.
  return (row.senseDiffs ?? []).some(
    (sd) => (sd as Record<string, unknown>)['changeType'] !== 'MATCHED'
  )
}

function statusLabel(row: EntryAlignment) {
  return hasRealChange(row) ? '有变更' : '全匹配'
}

function statusTag(row: EntryAlignment) {
  return hasRealChange(row) ? 'warning' : 'success'
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Render a sense cell: diff HTML if available, otherwise plain escaped definition. */
function renderSense(row: EntryAlignment, sense: Record<string, unknown>, side: 'A' | 'B'): string {
  const diffs = (row.senseDiffs ?? []) as Record<string, unknown>[]
  const sd = diffs.find((d) =>
    side === 'A' ? d['senseAId'] === sense['id'] : d['senseBId'] === sense['id']
  )
  if (!sd) return escapeHtml(String(sense['definition'] ?? ''))

  const summary = sd['diffSummary'] as Record<string, unknown> | null
  const rawDiffs = summary?.['diffA'] as [number, string][] | undefined
  if (!rawDiffs) return escapeHtml(String(sense['definition'] ?? ''))

  let html = ''
  for (const [op, text] of rawDiffs) {
    const escaped = escapeHtml(text)
    if (op === DiffMatchPatch.DIFF_EQUAL) {
      html += escaped
    } else if (op === DiffMatchPatch.DIFF_INSERT && side === 'B') {
      html += `<ins class="diff-ins">${escaped}</ins>`
    } else if (op === DiffMatchPatch.DIFF_DELETE && side === 'A') {
      html += `<del class="diff-del">${escaped}</del>`
    }
  }
  return html || escapeHtml(String(sense['definition'] ?? ''))
}
</script>

<style scoped>
.hw { font-weight: bold; font-size: 14px; }
.sense-line { font-size: 13px; margin: 2px 0; display: flex; gap: 6px; }
.sense-num { color: var(--el-color-primary); font-weight: bold; flex-shrink: 0; }
.empty-cell { color: var(--el-text-color-placeholder); font-style: italic; }
.cross-ref-row {
  margin-top: 6px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
}
.cross-ref-label {
  font-weight: 600;
  margin-right: 2px;
}
</style>

<style>
/* Global so v-html spans pick it up */
ins.diff-ins { background: rgba(64, 196, 64, 0.2); text-decoration: none; color: #2a8a2a; }
del.diff-del { background: rgba(220, 64, 64, 0.15); color: #c0392b; }
</style>
