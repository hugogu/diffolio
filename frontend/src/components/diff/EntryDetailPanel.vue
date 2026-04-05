<template>
  <div class="detail-panel">
    <!-- Entry header -->
    <div class="entry-header">
      <div class="entry-header-main">
        <span class="hw">{{ headword }}</span>
        <span v-if="phonetic" class="phonetic">{{ phonetic }}</span>
        <el-tag :type="entryChangeTagType" size="small">{{ entryChangeLabel }}</el-tag>
      </div>
      <div class="entry-header-tags">
        <EntryTagEditor
          :tags="alignment.tags"
          :available-tags="availableTags"
          :loading="tagLoading"
          :label="t('tags.label')"
          :empty-text="t('tags.empty')"
          :add-button-text="t('tags.addButton')"
          :placeholder="t('tags.selectOrCreate')"
          :helper-text="t('tags.helper')"
          @add-existing="emit('add-tag', { tagId: $event })"
          @create="emit('add-tag', { name: $event })"
          @remove="emit('remove-tag', $event.id)"
        />
      </div>
    </div>

    <!-- Sense comparison -->
    <div class="section">
      <div class="section-title">{{ t('diff.senseComparison') }}</div>
      <div v-if="sensePairs.length === 0" class="empty-hint">{{ t('diff.noSenseData') }}</div>
      <table v-else class="diff-table">
        <colgroup>
          <col class="col-version" />
          <col class="col-badge" />
          <col class="col-version" />
        </colgroup>
        <thead>
          <tr>
            <th>{{ labelA || t('diff.versionA') }}</th>
            <th>{{ t('diff.changeColumn') }}</th>
            <th>{{ labelB || t('diff.versionB') }}</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="(pair, i) in sensePairs" :key="i">
            <!-- Definition row -->
            <tr :class="pairRowClass(pair.changeType)">
              <td>
                <div v-if="pair.senseA" class="sense-cell">
                  <span v-if="pair.senseA.rawNumber" class="sense-num">{{ pair.senseA.rawNumber }}</span>
                  <span v-html="pair.diffHtmlA" />
                </div>
              </td>
              <td class="badge-col">
                <el-tag :type="senseTagType(pair.changeType)" size="small">{{ senseLabel(pair.changeType) }}</el-tag>
              </td>
              <td>
                <div v-if="pair.senseB" class="sense-cell">
                  <span v-if="pair.senseB.rawNumber" class="sense-num">{{ pair.senseB.rawNumber }}</span>
                  <span v-html="pair.diffHtmlB" />
                </div>
              </td>
            </tr>
            <!-- POS sub-row -->
            <tr v-if="showPosDiff && (pair.posA || pair.posB)" class="pos-row">
              <td class="pos-cell">
                <span class="pos-label">{{ t('diff.pos') }}：</span>
                <el-tag v-if="pair.posA" type="success" size="small" :class="pair.posChanged ? 'pos-tag-del' : ''">{{ pair.posA }}</el-tag>
                <span v-else class="pos-empty">—</span>
              </td>
              <td class="badge-col">
                <el-tag v-if="!pair.posChanged" size="small">{{ t('diff.posMatch') }}</el-tag>
                <el-tag v-else type="warning" size="small">{{ t('diff.posChanged') }}</el-tag>
              </td>
              <td class="pos-cell">
                <span class="pos-label">{{ t('diff.pos') }}：</span>
                <el-tag v-if="pair.posB" type="success" size="small" :class="pair.posChanged ? 'pos-tag-ins' : ''">{{ pair.posB }}</el-tag>
                <span v-else class="pos-empty">—</span>
              </td>
            </tr>
            <!-- Register sub-row -->
            <tr v-if="showRegisterDiff && (pair.registerA || pair.registerB)" class="reg-row">
              <td class="pos-cell">
                <span class="pos-label">{{ t('diff.register') }}：</span>
                <el-tag v-if="pair.registerA" type="warning" size="small" :class="pair.registerChanged ? 'pos-tag-del' : ''">{{ pair.registerA }}</el-tag>
                <span v-else class="pos-empty">—</span>
              </td>
              <td class="badge-col">
                <el-tag v-if="!pair.registerChanged" size="small">{{ t('diff.registerMatch') }}</el-tag>
                <el-tag v-else type="warning" size="small">{{ t('diff.registerChanged') }}</el-tag>
              </td>
              <td class="pos-cell">
                <span class="pos-label">{{ t('diff.register') }}：</span>
                <el-tag v-if="pair.registerB" type="warning" size="small" :class="pair.registerChanged ? 'pos-tag-ins' : ''">{{ pair.registerB }}</el-tag>
                <span v-else class="pos-empty">—</span>
              </td>
            </tr>
            <!-- Etymology sub-row -->
            <tr v-if="showEtymology && (pair.etymologyA || pair.etymologyB)" class="etym-row">
              <td class="pos-cell">
                <span class="pos-label">{{ t('diff.etymology') }}：</span>
                <span v-if="pair.etymologyA" class="etym-val" v-html="pair.etymologyDiffA" />
                <span v-else class="pos-empty">—</span>
              </td>
              <td class="badge-col">
                <el-tag v-if="!pair.etymologyChanged" size="small">{{ t('diff.etymologyMatch') }}</el-tag>
                <el-tag v-else type="info" size="small">{{ t('diff.etymologyChanged') }}</el-tag>
              </td>
              <td class="pos-cell">
                <span class="pos-label">{{ t('diff.etymology') }}：</span>
                <span v-if="pair.etymologyB" class="etym-val" v-html="pair.etymologyDiffB" />
                <span v-else class="pos-empty">—</span>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>

    <!-- Example comparison -->
    <div v-if="showExamples && filteredExampleRows.length > 0" class="section">
      <div class="section-title">{{ t('diff.examples') }}</div>
      <table class="diff-table">
        <colgroup>
          <col class="col-version" />
          <col class="col-badge" />
          <col class="col-version" />
        </colgroup>
        <thead>
          <tr>
            <th>{{ labelA || t('diff.versionA') }} {{ t('diff.examples') }}</th>
            <th>{{ t('diff.status') }}</th>
            <th>{{ labelB || t('diff.versionB') }} {{ t('diff.examples') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, i) in filteredExampleRows" :key="i" :class="exRowClass(row)">
            <td class="ex-cell"><span v-if="row.textA" v-html="row.htmlA" /></td>
            <td class="badge-col">
              <el-tag v-if="!row.textA" type="success" size="small">{{ t('diff.added') }}</el-tag>
              <el-tag v-else-if="!row.textB" type="danger" size="small">{{ t('diff.deleted') }}</el-tag>
              <el-tag v-else-if="row.changed" type="warning" size="small">{{ t('diff.modified') }}</el-tag>
              <el-tag v-else size="small">{{ t('diff.same') }}</el-tag>
            </td>
            <td class="ex-cell"><span v-if="row.textB" v-html="row.htmlB" /></td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import DiffMatchPatch from 'diff-match-patch'
import type { EntryAlignment } from '@/api/comparisons'
import type { TagSummary } from '@/api/tags'
import EntryTagEditor from '@/components/tags/EntryTagEditor.vue'

const { t } = useI18n()

const props = defineProps<{
  alignment: EntryAlignment
  labelA?: string
  labelB?: string
  showExamples?: boolean
  showRegisterDiff?: boolean
  showPosDiff?: boolean
  showEtymology?: boolean
  onlyNonMatched?: boolean
  availableTags?: TagSummary[]
  tagLoading?: boolean
}>()

const emit = defineEmits<{
  (event: 'add-tag', payload: { tagId?: string; name?: string }): void
  (event: 'remove-tag', tagId: string): void
}>()

const dmp = new DiffMatchPatch()

// ── Helpers ─────────────────────────────────────────────────────────────────
type Rec = Record<string, unknown>

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function diffHtml(textA: string, textB: string): { htmlA: string; htmlB: string } {
  const diffs = dmp.diff_main(textA, textB)
  dmp.diff_cleanupSemantic(diffs)
  let htmlA = ''
  let htmlB = ''
  for (const [op, text] of diffs) {
    const e = esc(text)
    if (op === DiffMatchPatch.DIFF_EQUAL) { htmlA += e; htmlB += e }
    else if (op === DiffMatchPatch.DIFF_DELETE) { htmlA += `<del class="diff-del">${e}</del>` }
    else { htmlB += `<ins class="diff-ins">${e}</ins>` }
  }
  return { htmlA, htmlB }
}

function stripForComparison(text: string): string {
  let s = text.normalize('NFC')
  s = s.replace(/[\u00ad\u200b\u200c\u200d\u2060\ufeff]/g, '')
  s = s.replace(/[\uff01-\uff5e]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
  s = s
    .replace(/\u3001/g, ',')
    .replace(/\u3002/g, '.')
    .replace(/\u3008/g, '<')
    .replace(/\u3009/g, '>')
    .replace(/[\u300a\u300b]/g, '"')
    .replace(/[\u300c\u300d\u300e\u300f]/g, '"')
    .replace(/\u3010/g, '[')
    .replace(/\u3011/g, ']')
    .replace(/[\u3014\u3016]/g, '(')
    .replace(/[\u3015\u3017]/g, ')')
    .replace(/[\u2018\u2019\u201a\u201b]/g, "'")
    .replace(/[\u201c\u201d\u201e\u201f\u301d\u301e\u301f]/g, '"')
    .replace(/[\u2014\u2013]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[\u00b7\u30fb\u2027]/g, '.')
    .replace(/\u3000/g, ' ')
  return s.replace(/\s+/g, '')
}

function equalAfterComparisonStrip(a: string, b: string): boolean {
  return stripForComparison(a) === stripForComparison(b)
}

// ── Header ───────────────────────────────────────────────────────────────────
const entryA = computed(() => props.alignment.entryA as Rec | null)
const entryB = computed(() => props.alignment.entryB as Rec | null)

const headword = computed(() =>
  String(entryA.value?.rawHeadword ?? entryB.value?.rawHeadword ?? '')
)
const phonetic = computed(() =>
  String(entryA.value?.phonetic ?? entryB.value?.phonetic ?? '')
)

const entryChangeTagType = computed(() => {
  switch (props.alignment.changeType) {
    case 'ADDED': return 'success'
    case 'DELETED': return 'danger'
    case 'MATCHED_VARIANT': return 'info'
    default: {
      const any = (props.alignment.senseDiffs ?? []).some(
        (sd) => (sd as Rec)['changeType'] !== 'MATCHED'
      )
      return any ? 'warning' : ''
    }
  }
})

const entryChangeLabel = computed(() => {
  switch (props.alignment.changeType) {
    case 'ADDED': return t('diff.entryChange.added')
    case 'DELETED': return t('diff.entryChange.deleted')
    case 'MATCHED_VARIANT': return t('diff.entryChange.matchedVariant')
    default: {
      const any = (props.alignment.senseDiffs ?? []).some(
        (sd) => (sd as Rec)['changeType'] !== 'MATCHED'
      )
      return any ? t('diff.entryChange.hasChanges') : t('diff.entryChange.matched')
    }
  }
})

// ── Sense pairs ──────────────────────────────────────────────────────────────
interface SensePair {
  senseA: Rec | null
  senseB: Rec | null
  changeType: string
  diffHtmlA: string
  diffHtmlB: string
  posA: string
  posB: string
  posChanged: boolean
  registerA: string
  registerB: string
  registerChanged: boolean
  etymologyA: string
  etymologyB: string
  etymologyChanged: boolean
  etymologyDiffA: string
  etymologyDiffB: string
}

const showExamples = computed(() => props.showExamples !== false)
const showRegisterDiff = computed(() => props.showRegisterDiff !== false)
const showPosDiff = computed(() => props.showPosDiff !== false)
const showEtymology = computed(() => props.showEtymology !== false)
const onlyNonMatched = computed(() => props.onlyNonMatched === true)
const availableTags = computed(() => props.availableTags ?? [])

const rawSensePairs = computed<SensePair[]>(() => {
  const senseDiffs = (props.alignment.senseDiffs ?? []) as Rec[]
  const sensesA = ((entryA.value?.senses ?? []) as Rec[])
  const sensesB = ((entryB.value?.senses ?? []) as Rec[])

  function makePosFields(sA: Rec | null, sB: Rec | null) {
    const posA = String(sA?.['grammaticalCat'] ?? '')
    const posB = String(sB?.['grammaticalCat'] ?? '')
    return { posA, posB, posChanged: !equalAfterComparisonStrip(posA, posB) }
  }

  function makeRegisterFields(sA: Rec | null, sB: Rec | null) {
    const registerA = String(sA?.['register'] ?? '')
    const registerB = String(sB?.['register'] ?? '')
    return {
      registerA,
      registerB,
      registerChanged: !equalAfterComparisonStrip(registerA, registerB),
    }
  }

  function makeEtymologyFields(sA: Rec | null, sB: Rec | null) {
    const etymologyA = String(sA?.['etymology'] ?? '')
    const etymologyB = String(sB?.['etymology'] ?? '')
    const etymologyChanged = !equalAfterComparisonStrip(etymologyA, etymologyB)
    if (etymologyA && etymologyB && etymologyChanged) {
      const { htmlA, htmlB } = diffHtml(etymologyA, etymologyB)
      return { etymologyA, etymologyB, etymologyChanged, etymologyDiffA: htmlA, etymologyDiffB: htmlB }
    }
    return { etymologyA, etymologyB, etymologyChanged, etymologyDiffA: esc(etymologyA), etymologyDiffB: esc(etymologyB) }
  }

  // No diffs recorded: synthesise from available senses
  if (senseDiffs.length === 0) {
    if (sensesA.length > 0 && sensesB.length === 0) {
      return sensesA.map((s) => ({
        senseA: s, senseB: null, changeType: 'DELETED',
        diffHtmlA: esc(String(s['rawDefinition'] ?? '')), diffHtmlB: '',
        ...makePosFields(s, null),
        ...makeRegisterFields(s, null),
        ...makeEtymologyFields(s, null),
      }))
    }
    if (sensesB.length > 0 && sensesA.length === 0) {
      return sensesB.map((s) => ({
        senseA: null, senseB: s, changeType: 'ADDED',
        diffHtmlA: '', diffHtmlB: esc(String(s['rawDefinition'] ?? '')),
        ...makePosFields(null, s),
        ...makeRegisterFields(null, s),
        ...makeEtymologyFields(null, s),
      }))
    }
    return []
  }

  const mapA = new Map(sensesA.map((s) => [String(s['id']), s]))
  const mapB = new Map(sensesB.map((s) => [String(s['id']), s]))

  return senseDiffs.map((sd) => {
    const ct = String(sd['changeType'])
    const sA = sd['senseAId'] ? (mapA.get(String(sd['senseAId'])) ?? null) : null
    const sB = sd['senseBId'] ? (mapB.get(String(sd['senseBId'])) ?? null) : null
    const textA = String(sA?.['rawDefinition'] ?? '')
    const textB = String(sB?.['rawDefinition'] ?? '')
    const posFields = makePosFields(sA, sB)

    if (sA && sB && ct !== 'MATCHED') {
      const { htmlA, htmlB } = diffHtml(textA, textB)
      return { senseA: sA, senseB: sB, changeType: ct, diffHtmlA: htmlA, diffHtmlB: htmlB, ...posFields, ...makeRegisterFields(sA, sB), ...makeEtymologyFields(sA, sB) }
    }
    return {
      senseA: sA, senseB: sB, changeType: ct,
      diffHtmlA: esc(textA), diffHtmlB: esc(textB),
      ...posFields, ...makeRegisterFields(sA, sB), ...makeEtymologyFields(sA, sB),
    }
  })
})

function pairHasVisibleDifference(pair: SensePair): boolean {
  if (pair.changeType !== 'MATCHED') return true
  if (showPosDiff.value && pair.posChanged) return true
  if (showRegisterDiff.value && pair.registerChanged) return true
  if (showEtymology.value && pair.etymologyChanged) return true
  return false
}

const sensePairs = computed(() => {
  if (!onlyNonMatched.value) return rawSensePairs.value
  return rawSensePairs.value.filter(pairHasVisibleDifference)
})

function pairRowClass(ct: string): string {
  if (ct === 'ADDED') return 'row-added'
  if (ct === 'DELETED') return 'row-deleted'
  if (ct === 'MATCHED') return 'row-matched'
  return 'row-changed'
}

function senseTagType(ct: string): string {
  if (ct === 'ADDED') return 'success'
  if (ct === 'DELETED') return 'danger'
  if (ct === 'MATCHED') return 'info'
  return 'warning'
}

function senseLabel(ct: string): string {
  const map: Record<string, string> = {
    MATCHED: t('diff.senseChange.matched'),
    DEFINITION_CHANGED: t('diff.senseChange.definitionChanged'),
    POS_CHANGED: t('diff.senseChange.posChanged'),
    EXAMPLE_CHANGED: t('diff.senseChange.exampleChanged'),
    RENUMBERED: t('diff.senseChange.renumbered'),
    SPLIT: t('diff.senseChange.split'),
    MERGED: t('diff.senseChange.merged'),
    ADDED: t('diff.senseChange.added'),
    DELETED: t('diff.senseChange.deleted'),
  }
  return map[ct] ?? ct
}

// ── Example rows ─────────────────────────────────────────────────────────────
interface ExRow { textA: string | null; textB: string | null; changed: boolean; htmlA: string; htmlB: string }

const exampleRows = computed<ExRow[]>(() => {
  const exA = ((entryA.value?.senses ?? []) as Rec[])
    .flatMap((s) => ((s['examples'] ?? []) as Rec[]).map((e) => String(e['rawText'] ?? '')))
    .filter(Boolean)
  const exB = ((entryB.value?.senses ?? []) as Rec[])
    .flatMap((s) => ((s['examples'] ?? []) as Rec[]).map((e) => String(e['rawText'] ?? '')))
    .filter(Boolean)

  if (exA.length === 0 && exB.length === 0) return []

  const result: ExRow[] = []
  const usedB = new Set<number>()

  for (const textA of exA) {
    let bestIdx = -1; let bestScore = 0
    for (let i = 0; i < exB.length; i++) {
      if (usedB.has(i)) continue
      const d = dmp.diff_main(textA, exB[i])
      const score = 1 - dmp.diff_levenshtein(d) / Math.max(textA.length, exB[i].length, 1)
      if (score > bestScore) { bestScore = score; bestIdx = i }
    }
    if (bestIdx >= 0 && bestScore > 0.4) {
      usedB.add(bestIdx)
      const textB = exB[bestIdx]
      const changed = !equalAfterComparisonStrip(textA, textB)
      if (changed) {
        const { htmlA, htmlB } = diffHtml(textA, textB)
        result.push({ textA, textB, changed, htmlA, htmlB })
      } else {
        result.push({ textA, textB, changed, htmlA: esc(textA), htmlB: esc(textB) })
      }
    } else {
      result.push({ textA, textB: null, changed: false, htmlA: esc(textA), htmlB: '' })
    }
  }
  for (let i = 0; i < exB.length; i++) {
    if (!usedB.has(i)) result.push({ textA: null, textB: exB[i], changed: false, htmlA: '', htmlB: esc(exB[i]) })
  }
  return result
})

const filteredExampleRows = computed(() => {
  if (!onlyNonMatched.value) return exampleRows.value
  return exampleRows.value.filter((row) => !row.textA || !row.textB || row.changed)
})

function exRowClass(row: ExRow): string {
  if (!row.textA) return 'row-added'
  if (!row.textB) return 'row-deleted'
  if (row.changed) return 'row-changed'
  return ''
}
</script>

<style scoped>
.detail-panel { font-size: 13px; }

.entry-header {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--el-border-color-light);
  margin-bottom: 12px;
  position: sticky;
  top: 0;
  background: var(--el-bg-color);
  z-index: 1;
}
.entry-header-main {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 10px;
}
.entry-header-tags {
  display: flex;
  flex-wrap: wrap;
}
.hw { font-size: 20px; font-weight: bold; }
.phonetic { font-size: 14px; color: var(--el-text-color-secondary); }

.section { padding: 0 16px 20px; }
.section-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 8px;
}
.empty-hint { color: var(--el-text-color-placeholder); font-size: 13px; }

.diff-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  line-height: 1.55;
}
.diff-table th,
.diff-table td {
  padding: 6px 8px;
  border: 1px solid var(--el-border-color-lighter);
  vertical-align: top;
}
.diff-table th {
  background: var(--el-fill-color-light);
  font-weight: 500;
  font-size: 12px;
  text-align: left;
}
.col-version { width: 46%; }
.col-badge { width: 8%; min-width: 70px; }
.badge-col { text-align: center; white-space: nowrap; }

.row-added td { background: rgba(103, 194, 58, 0.05); }
.row-deleted td { background: rgba(245, 108, 108, 0.05); }
.row-matched td { color: var(--el-text-color-secondary); }

.sense-cell { display: flex; gap: 5px; align-items: flex-start; }
.sense-num { color: var(--el-color-primary); font-weight: bold; flex-shrink: 0; }
.ex-cell { white-space: pre-wrap; word-break: break-all; }

/* Register sub-row */
.reg-row td {
  background: rgba(230, 162, 60, 0.04);
  padding: 4px 8px;
  font-size: 12px;
}

/* Etymology sub-row */
.etym-row td {
  background: rgba(64, 158, 255, 0.05);
  padding: 4px 8px;
  font-size: 12px;
}
.etym-val {
  color: var(--el-text-color-regular);
  font-size: 12px;
}

/* POS sub-row */
.pos-row td {
  background: rgba(230, 162, 60, 0.06);
  padding: 4px 8px;
  font-size: 12px;
}
.pos-cell {
  display: flex;
  align-items: center;
  gap: 6px;
}
.pos-label {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  flex-shrink: 0;
}
.pos-empty {
  color: var(--el-text-color-placeholder);
  font-size: 12px;
}
.pos-tag-del {
  text-decoration: line-through;
  opacity: 0.7;
}
.pos-tag-ins {
  font-weight: 600;
}
</style>

<style>
ins.diff-ins { background: rgba(64, 196, 64, 0.2); text-decoration: none; color: #2a8a2a; }
del.diff-del { background: rgba(220, 64, 64, 0.15); color: #c0392b; }
</style>
