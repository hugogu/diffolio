<template>
  <div class="example-network">
    <el-empty v-if="!alignment" :description="t('diff.selectEntry')" />
    <template v-else>
      <div class="entry-header">
        <span class="hw">{{ alignment.entryA?.rawHeadword ?? alignment.entryB?.rawHeadword }}</span>
        <span class="subtitle">{{ t('diff.examples') }}</span>
      </div>

      <div v-if="rows.length === 0" class="no-examples">
        <el-empty :description="t('diff.noExamples')" />
      </div>

      <el-table v-else :data="rows" stripe border style="width: 100%">
        <el-table-column :label="t('diff.exampleColumnA')" min-width="200">
          <template #default="{ row }">
            <span v-if="row.textA" v-html="row.diffHtmlA" />
            <span v-else class="absent">—</span>
          </template>
        </el-table-column>

        <el-table-column :label="t('diff.changeColumn')" width="130" align="center">
          <template #default="{ row }">
            <el-icon v-if="!row.textA" color="#67c23a" :size="18"><Plus /></el-icon>
            <el-icon v-else-if="!row.textB" color="#f56c6c" :size="18"><Minus /></el-icon>
            <el-tag v-else-if="row.changed" type="warning" size="small">{{ t('diff.modified') }}</el-tag>
            <el-tag v-else type="success" size="small">{{ t('diff.same') }}</el-tag>
          </template>
        </el-table-column>

        <el-table-column :label="t('diff.exampleColumnB')" min-width="200">
          <template #default="{ row }">
            <span v-if="row.textB" v-html="row.diffHtmlB" />
            <span v-else class="absent">—</span>
          </template>
        </el-table-column>
      </el-table>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Plus, Minus } from '@element-plus/icons-vue'
import DiffMatchPatch from 'diff-match-patch'
import type { EntryAlignment } from '@/api/comparisons'

const { t } = useI18n()

const dmp = new DiffMatchPatch()

const props = defineProps<{
  alignment: EntryAlignment | null
}>()

interface ExampleRow {
  textA: string | null
  textB: string | null
  changed: boolean
  diffHtmlA: string
  diffHtmlB: string
}

function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function buildDiffHtml(textA: string, textB: string): { htmlA: string; htmlB: string } {
  const diffs = dmp.diff_main(textA, textB)
  dmp.diff_cleanupSemantic(diffs)
  let htmlA = ''
  let htmlB = ''
  for (const [op, text] of diffs) {
    const esc = escape(text)
    if (op === DiffMatchPatch.DIFF_EQUAL) {
      htmlA += esc
      htmlB += esc
    } else if (op === DiffMatchPatch.DIFF_DELETE) {
      htmlA += `<del class="diff-del">${esc}</del>`
    } else {
      htmlB += `<ins class="diff-ins">${esc}</ins>`
    }
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

const rows = computed<ExampleRow[]>(() => {
  if (!props.alignment) return []

  const sensesA = ((props.alignment.entryA as Record<string, unknown> | null)?.['senses'] ?? []) as Record<string, unknown>[]
  const sensesB = ((props.alignment.entryB as Record<string, unknown> | null)?.['senses'] ?? []) as Record<string, unknown>[]

  const examplesA = sensesA.flatMap((s) =>
    ((s['examples'] as Record<string, unknown>[]) ?? []).map((e) => String(e['normalizedText'] ?? ''))
  )
  const examplesB = sensesB.flatMap((s) =>
    ((s['examples'] as Record<string, unknown>[]) ?? []).map((e) => String(e['normalizedText'] ?? ''))
  )

  const maxLen = Math.max(examplesA.length, examplesB.length)
  if (maxLen === 0) return []

  const result: ExampleRow[] = []
  const usedB = new Set<number>()

  for (const textA of examplesA) {
    // Find best matching B example
    let bestIdx = -1
    let bestScore = 0
    for (let i = 0; i < examplesB.length; i++) {
      if (usedB.has(i)) continue
      const diffs = dmp.diff_main(textA, examplesB[i])
      const lev = dmp.diff_levenshtein(diffs)
      const score = 1 - lev / Math.max(textA.length, examplesB[i].length, 1)
      if (score > bestScore) { bestScore = score; bestIdx = i }
    }

    if (bestIdx >= 0 && bestScore > 0.4) {
      usedB.add(bestIdx)
      const textB = examplesB[bestIdx]
      const changed = !equalAfterComparisonStrip(textA, textB)
      if (changed) {
        const { htmlA, htmlB } = buildDiffHtml(textA, textB)
        result.push({ textA, textB, changed, diffHtmlA: htmlA, diffHtmlB: htmlB })
      } else {
        result.push({ textA, textB, changed, diffHtmlA: escape(textA), diffHtmlB: escape(textB) })
      }
    } else {
      result.push({ textA, textB: null, changed: false, diffHtmlA: escape(textA), diffHtmlB: '' })
    }
  }

  // Remaining B examples not matched
  for (let i = 0; i < examplesB.length; i++) {
    if (!usedB.has(i)) {
      result.push({ textA: null, textB: examplesB[i], changed: false, diffHtmlA: '', diffHtmlB: escape(examplesB[i]) })
    }
  }

  return result
})
</script>

<style scoped>
.example-network { display: flex; flex-direction: column; gap: 12px; }
.entry-header { display: flex; align-items: baseline; gap: 8px; }
.hw { font-size: 18px; font-weight: bold; }
.subtitle { color: var(--el-text-color-secondary); font-size: 13px; }
.absent { color: var(--el-text-color-placeholder); font-style: italic; }
.no-examples { padding: 24px; }
</style>

<style>
ins.diff-ins { background: rgba(64, 196, 64, 0.2); text-decoration: none; color: #2a8a2a; }
del.diff-del { background: rgba(220, 64, 64, 0.15); color: #c0392b; }
</style>
