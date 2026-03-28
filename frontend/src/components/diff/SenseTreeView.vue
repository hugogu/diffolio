<template>
  <div class="sense-tree">
    <el-empty v-if="!alignment" description="请从列表中选择一个条目" />
    <template v-else>
      <div class="tree-header">
        <span class="hw">{{ alignment.entryA?.rawHeadword ?? alignment.entryB?.rawHeadword }}</span>
        <span class="subtitle">义项演变树</span>
      </div>
      <v-chart class="chart" :option="chartOption" autoresize />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { TreeChart } from 'echarts/charts'
import { TooltipComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { EntryAlignment } from '@/api/comparisons'

use([TreeChart, TooltipComponent, LegendComponent, CanvasRenderer])

const props = defineProps<{
  alignment: EntryAlignment | null
}>()

function senseColor(changeType: string): string {
  switch (changeType) {
    case 'ADDED': return '#67c23a'
    case 'DELETED': return '#f56c6c'
    case 'DEFINITION_CHANGED': return '#e6a23c'
    case 'RENUMBERED': return '#409eff'
    case 'SPLIT': return '#9b59b6'
    case 'MERGED': return '#1abc9c'
    default: return '#909399'
  }
}

const chartOption = computed(() => {
  if (!props.alignment) return {}

  const senseDiffs = (props.alignment.senseDiffs ?? []) as Record<string, unknown>[]
  const sensesA = ((props.alignment.entryA as Record<string, unknown> | null)?.['senses'] ?? []) as Record<string, unknown>[]
  const sensesB = ((props.alignment.entryB as Record<string, unknown> | null)?.['senses'] ?? []) as Record<string, unknown>[]

  // Build children for left (A) and right (B) subtrees
  const rootLabel = String(
    (props.alignment.entryA as Record<string, unknown> | null)?.['rawHeadword'] ??
    (props.alignment.entryB as Record<string, unknown> | null)?.['rawHeadword'] ?? '?'
  )

  function senseNode(sense: Record<string, unknown>, side: 'A' | 'B') {
    const id = String(sense['id'])
    const diff = senseDiffs.find((d) =>
      side === 'A' ? d['senseAId'] === id : d['senseBId'] === id
    )
    const changeType = diff ? String(diff['changeType']) : 'MATCHED'
    const definition = String(sense['definition'] ?? '')
    return {
      name: `${sense['rawNumber']}: ${definition.slice(0, 30)}${definition.length > 30 ? '…' : ''}`,
      itemStyle: { color: senseColor(changeType) },
      label: { position: side === 'A' ? 'left' : 'right' },
      tooltip: { formatter: `${changeType}\n${definition}` },
    }
  }

  const leftChildren = sensesA.map((s) => senseNode(s, 'A'))
  const rightChildren = sensesB.map((s) => senseNode(s, 'B'))

  return {
    tooltip: { trigger: 'item' },
    series: [
      {
        type: 'tree',
        orient: 'LR',
        data: [
          {
            name: rootLabel,
            children: [
              { name: '版本 A', children: leftChildren, itemStyle: { color: '#409eff' } },
              { name: '版本 B', children: rightChildren, itemStyle: { color: '#67c23a' } },
            ],
          },
        ],
        top: '5%',
        left: '10%',
        bottom: '5%',
        right: '10%',
        symbolSize: 8,
        label: {
          position: 'left',
          verticalAlign: 'middle',
          align: 'right',
          fontSize: 12,
        },
        leaves: {
          label: {
            position: 'right',
            verticalAlign: 'middle',
            align: 'left',
          },
        },
        expandAndCollapse: true,
        animationDuration: 300,
      },
    ],
  }
})
</script>

<style scoped>
.sense-tree { display: flex; flex-direction: column; }
.tree-header { display: flex; align-items: baseline; gap: 8px; margin-bottom: 12px; }
.hw { font-size: 18px; font-weight: bold; }
.subtitle { color: var(--el-text-color-secondary); font-size: 13px; }
.chart { height: 500px; width: 100%; }
</style>
