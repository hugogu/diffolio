<template>
  <div>
    <div class="page-header">
      <el-breadcrumb separator="/">
        <el-breadcrumb-item :to="{ path: '/admin/dictionaries' }">{{ $t('admin.dictionaryList.title') }}</el-breadcrumb-item>
        <el-breadcrumb-item>{{ $t('admin.parseDebug.title') }}</el-breadcrumb-item>
      </el-breadcrumb>
      <h2>{{ $t('admin.parseDebug.title') }}</h2>
    </div>

    <!-- Load settings -->
    <el-card style="margin-bottom: 12px">
      <el-form inline>
        <el-form-item :label="$t('admin.parseDebug.maxEntries')">
          <el-input-number v-model="maxEntries" :min="5" :max="200" :step="10" />
        </el-form-item>
        <el-form-item :label="$t('admin.parseDebug.startIndex')">
          <el-input-number v-model="startIndex" :min="0" :step="10" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="loading" @click="loadPreview">{{ $t('admin.parseDebug.loadPreview') }}</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <div v-if="loading" v-loading="true" :element-loading-text="$t('admin.parseDebug.loading')" style="height: 200px" />

    <template v-else-if="preview">
      <!-- File info -->
      <el-alert
        :title="$t('admin.parseDebug.fileInfo', { versionLabel: preview.versionLabel, fileName: preview.fileName, fileType: preview.fileType, totalLines: preview.totalLinesScanned, entriesCount: preview.entries.length })"
        type="info"
        :closable="false"
        style="margin-bottom: 12px"
      />

      <!-- Stats bar -->
      <el-card style="margin-bottom: 12px">
        <el-space wrap>
          <span>{{ $t('admin.parseDebug.entryCount', { current: currentIndex + 1, total: preview.entries.length }) }}</span>
          <el-button :type="autoMode ? 'warning' : 'primary'" size="small" @click="toggleAuto">
            {{ autoMode ? $t('admin.parseDebug.stopAutoPlay') : $t('admin.parseDebug.autoPlay') }}
          </el-button>
          <el-tag type="success">{{ $t('admin.parseDebug.approved') }}: {{ approved }}</el-tag>
          <el-tag type="danger">{{ $t('admin.parseDebug.rejected') }}: {{ rejected.length }}</el-tag>
        </el-space>
      </el-card>

      <!-- Navigation + actions (moved above entry card) -->
      <el-card style="margin-bottom: 12px">
        <el-space>
          <el-button :disabled="currentIndex === 0" @click="prev">{{ $t('admin.parseDebug.prev') }}</el-button>
          <el-button :disabled="currentIndex >= preview.entries.length - 1" @click="next">{{ $t('admin.parseDebug.next') }}</el-button>
          <el-divider direction="vertical" />
          <el-button type="success" @click="approve">{{ $t('admin.parseDebug.approve') }}</el-button>
          <el-button type="danger" @click="reject">{{ $t('admin.parseDebug.reject') }}</el-button>
        </el-space>
      </el-card>

      <!-- Entry card -->
      <el-card v-if="currentEntry" style="margin-bottom: 12px">
        <el-row :gutter="20">
          <!-- Left: raw source -->
          <el-col :span="12">
            <div class="panel-label">{{ $t('admin.parseDebug.rawText') }}</div>
            <pre class="source-lines">{{ currentEntry.sourceLines.join('\n') || $t('admin.parseDebug.noSource') }}</pre>
          </el-col>

          <!-- Right: parsed data -->
          <el-col :span="12">
            <div class="panel-label">{{ $t('admin.parseDebug.parsedResult') }}</div>
            <el-descriptions :column="1" border size="small" style="margin-bottom: 12px">
              <el-descriptions-item :label="$t('admin.parseDebug.rawHeadword')">
                <code>{{ currentEntry.entry.rawHeadword }}</code>
                <el-tag v-if="currentEntry.entry.entrySequence" size="small" type="info" style="margin-left: 8px">
                  #{{ currentEntry.entry.entrySequence }}
                </el-tag>
              </el-descriptions-item>
              <el-descriptions-item :label="$t('admin.parseDebug.normalizedHeadword')">
                <code>{{ currentEntry.entry.normalizedHeadword }}</code>
              </el-descriptions-item>
              <el-descriptions-item v-if="currentEntry.entry.phonetic" :label="$t('admin.parseDebug.phonetic')">
                {{ currentEntry.entry.phonetic }}
              </el-descriptions-item>
              <el-descriptions-item :label="$t('admin.parseDebug.entrySequence')" v-if="currentEntry.entry.entrySequence !== undefined">
                {{ currentEntry.entry.entrySequence }}
              </el-descriptions-item>
              <el-descriptions-item :label="$t('admin.parseDebug.lineNumber')">
                {{ currentEntry.entry.lineNumber ?? '—' }}
              </el-descriptions-item>
              <el-descriptions-item :label="$t('admin.parseDebug.senseCount')">
                <el-tag size="small" :type="currentEntry.entry.senses.length > 0 ? 'success' : 'danger'">
                  {{ currentEntry.entry.senses.length }}
                </el-tag>
              </el-descriptions-item>
            </el-descriptions>

            <div v-if="currentEntry.entry.senses.length > 0">
              <div v-for="(sense, si) in currentEntry.entry.senses" :key="si" class="sense-item">
                <el-tag size="small" type="primary" style="margin-right: 4px; font-family: monospace">
                  {{ sense.rawNumber || '#' }}
                </el-tag>
                <el-tag v-if="sense.register" size="small" type="warning" style="margin-right: 4px">{{ sense.register }}</el-tag>
                <el-tag v-if="sense.grammaticalCat" size="small" type="success" style="margin-right: 4px">{{ sense.grammaticalCat }}</el-tag>
                <span class="sense-def">{{ sense.definition || sense.rawDefinition }}</span>
                <div v-if="sense.examples.length > 0" class="examples">
                  <div v-for="(ex, ei) in sense.examples" :key="ei" class="example">
                    ▸ {{ ex.normalizedText || ex.rawText }}
                  </div>
                </div>
              </div>
            </div>
            <el-empty v-else :description="$t('admin.parseDebug.noSenses')" :image-size="50" />

            <div
              v-if="currentEntry.entry.crossReferences?.length"
              class="cross-ref-row"
            >
              <span class="cross-ref-label">{{ $t('admin.parseDebug.crossRef') }}：</span>
              <span class="cross-ref-text">{{ currentEntry.entry.crossReferences!.join('；') }}</span>
            </div>

            <!-- Parse errors for this entry -->
            <div v-if="currentEntry.errors.length > 0" style="margin-top: 12px">
              <el-tag type="warning" size="small">{{ $t('admin.parseDebug.parseErrors', { count: currentEntry.errors.length }) }}</el-tag>
              <div v-for="(err, ei) in currentEntry.errors" :key="ei" class="parse-error">
                [{{ err.errorCode }}] {{ err.errorDetail }} — {{ err.rawText }}
              </div>
            </div>
          </el-col>
        </el-row>
      </el-card>

      <!-- Rejected log -->
      <el-collapse v-if="rejected.length > 0" v-model="activeCollapse">
        <el-collapse-item :title="$t('admin.parseDebug.rejectedLog')" name="rejected">
          <el-table :data="rejected" border size="small" style="margin-bottom: 8px">
            <el-table-column :label="$t('common.number')" prop="index" width="80">
              <template #default="{ row }">{{ row.index + 1 }}</template>
            </el-table-column>
            <el-table-column :label="$t('admin.parseDebug.rawHeadword')" prop="headword" />
            <el-table-column :label="$t('admin.parseDebug.rawText')" prop="sourceLines">
              <template #default="{ row }">
                <code style="font-size: 12px">{{ row.sourceLines }}</code>
              </template>
            </el-table-column>
          </el-table>
          <el-button size="small" @click="downloadRejected">{{ $t('admin.parseDebug.downloadRejected') }}</el-button>
        </el-collapse-item>
      </el-collapse>
    </template>

    <el-empty v-else-if="!loading" :description="$t('admin.parseDebug.emptyHint')" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { getParsePreview, type ParsePreviewResult, type ParsePreviewEntry } from '@/api/parse-debug'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'

const route = useRoute()
const { t } = useI18n()
const versionId = route.params.versionId as string

const loading = ref(false)
const preview = ref<ParsePreviewResult | null>(null)
const maxEntries = ref(30)
const startIndex = ref(0)
const currentIndex = ref(0)
const autoMode = ref(false)
const approved = ref(0)
const rejected = ref<Array<{ index: number; headword: string; sourceLines: string }>>([])
const activeCollapse = ref<string[]>([])

let autoTimer: ReturnType<typeof setInterval> | null = null

const currentEntry = computed<ParsePreviewEntry | null>(() => {
  if (!preview.value || preview.value.entries.length === 0) return null
  return preview.value.entries[currentIndex.value]
})

onMounted(() => {
  loadPreview()
})

onUnmounted(() => {
  stopAuto()
})

async function loadPreview() {
  loading.value = true
  currentIndex.value = 0
  approved.value = 0
  rejected.value = []
  preview.value = null
  try {
    preview.value = await getParsePreview(versionId, maxEntries.value, startIndex.value)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : t('common.loadError')
    ElMessage.error(msg)
  } finally {
    loading.value = false
  }
}

function prev() {
  if (currentIndex.value > 0) currentIndex.value--
}

function next() {
  if (preview.value && currentIndex.value < preview.value.entries.length - 1) {
    currentIndex.value++
  } else {
    stopAuto()
  }
}

function approve() {
  approved.value++
  next()
}

function reject() {
  if (!currentEntry.value) return
  const entry = currentEntry.value
  rejected.value.push({
    index: currentIndex.value,
    headword: entry.entry.rawHeadword,
    sourceLines: entry.sourceLines.join(' | '),
  })
  console.error(
    `[ParseDebug] REJECTED entry #${currentIndex.value + 1}:`,
    entry.entry.rawHeadword,
    '| senses:', entry.entry.senses.length,
    '| sourceLines:', entry.sourceLines
  )
  ElMessage.warning(t('admin.parseDebug.rejected', { headword: entry.entry.rawHeadword }))
  next()
}

function toggleAuto() {
  if (autoMode.value) {
    stopAuto()
  } else {
    autoMode.value = true
    autoTimer = setInterval(() => {
      if (!preview.value || currentIndex.value >= preview.value.entries.length - 1) {
        stopAuto()
        return
      }
      next()
    }, 1500)
  }
}

function stopAuto() {
  autoMode.value = false
  if (autoTimer) {
    clearInterval(autoTimer)
    autoTimer = null
  }
}

function downloadRejected() {
  const data = {
    versionId,
    versionLabel: preview.value?.versionLabel,
    fileName: preview.value?.fileName,
    rejectedCount: rejected.value.length,
    entries: rejected.value,
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `parse-debug-rejected-${versionId}.json`
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<style scoped>
.page-header {
  margin-bottom: 16px;
}

.panel-label {
  font-weight: 600;
  margin-bottom: 8px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.source-lines {
  font-family: 'Courier New', Courier, monospace;
  font-size: 13px;
  background: var(--el-fill-color-light);
  padding: 12px;
  border-radius: 4px;
  white-space: pre-wrap;
  word-break: break-all;
  min-height: 120px;
  max-height: 400px;
  overflow-y: auto;
  border: 1px solid var(--el-border-color-lighter);
}

.sense-item {
  margin-bottom: 10px;
  padding: 8px;
  background: var(--el-fill-color-extra-light);
  border-radius: 4px;
}

.sense-def {
  font-size: 14px;
  line-height: 1.6;
}

.examples {
  margin-top: 6px;
  padding-left: 20px;
}

.example {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.8;
}

.parse-error {
  font-size: 12px;
  color: var(--el-color-warning);
  margin-top: 4px;
  font-family: monospace;
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
