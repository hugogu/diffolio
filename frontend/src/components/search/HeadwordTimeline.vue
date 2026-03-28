<template>
  <div class="timeline-container">
    <el-timeline>
      <el-timeline-item
        v-for="item in entries"
        :key="item.versionId + '-' + item.entry.id"
        :timestamp="`${item.dictionaryName} — ${item.versionLabel}${item.publishedYear ? ` (${item.publishedYear})` : ''}`"
        placement="top"
      >
        <el-card class="entry-card">
          <div class="entry-header">
            <span class="headword">{{ item.entry.rawHeadword }}</span>
            <span v-if="item.entry.phonetic" class="phonetic">{{ item.entry.phonetic }}</span>
            <span v-if="item.entry.pageNumber" class="page-ref">第 {{ item.entry.pageNumber }} 页</span>
          </div>

          <div class="senses">
            <div
              v-for="sense in item.entry.senses"
              :key="sense.id"
              class="sense-item"
            >
              <span v-if="sense.rawNumber" class="sense-number">{{ sense.rawNumber }}</span>
              <el-tag
                v-if="sense.register"
                type="warning"
                size="small"
                class="sense-tag"
              >{{ sense.register }}</el-tag>
              <el-tag
                v-if="sense.grammaticalCat"
                type="success"
                size="small"
                class="sense-tag"
              >{{ sense.grammaticalCat }}</el-tag>
              <span class="definition">{{ sense.definition }}</span>
              <span v-if="(sense as any).etymology" class="etymology">［{{ (sense as any).etymology }}］</span>
            </div>
            <div v-if="item.entry.senses.length === 0" class="no-senses">（无义项）</div>
          </div>

          <div
            v-if="item.entry.crossReferences?.length"
            class="cross-ref-row"
          >
            <span class="cross-ref-label">另见：</span>
            <span>{{ item.entry.crossReferences!.join('；') }}</span>
          </div>
        </el-card>
      </el-timeline-item>
    </el-timeline>
  </div>
</template>

<script setup lang="ts">
import type { HeadwordTimelineEntry } from '@/api/search'

defineProps<{ entries: HeadwordTimelineEntry[] }>()
</script>

<style scoped>
.timeline-container { max-width: 960px; }

.entry-card { padding: 0; }

.entry-header {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 10px;
}

.headword {
  font-size: 20px;
  font-weight: bold;
  color: var(--el-text-color-primary);
}

.phonetic {
  color: var(--el-text-color-secondary);
  font-size: 14px;
}

.page-ref {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  margin-left: auto;
}

.senses {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.sense-item {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px;
  line-height: 1.6;
}

.sense-number {
  font-weight: 600;
  color: var(--el-color-primary);
  flex-shrink: 0;
  margin-right: 2px;
}

.sense-tag {
  flex-shrink: 0;
}

.definition {
  flex: 1;
  min-width: 0;
}

.etymology {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.no-senses {
  color: var(--el-text-color-placeholder);
  font-size: 13px;
}

.cross-ref-row {
  margin-top: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
}
.cross-ref-label {
  font-weight: 600;
  margin-right: 2px;
}
</style>
