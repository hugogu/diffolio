<template>
  <div class="taxonomy-tree-editor">
    <div class="editor-layout" style="display: flex; gap: 20px; height: calc(100vh - 180px)">
      <!-- Left: Tree -->
      <div
        class="tree-panel"
        style="width: 300px; overflow-y: auto; border-right: 1px solid #dcdfe6; padding-right: 16px"
      >
        <el-tree
          v-if="treeNodes.length"
          :data="treeNodes"
          :props="{ label: 'label', children: 'children' }"
          node-key="id"
          highlight-current
          :expand-on-click-node="false"
          @node-click="onNodeClick"
        >
          <template #default="{ data }">
            <span style="display: flex; align-items: center; gap: 6px; width: 100%">
              <template v-if="editingNodeId === data.id && data.level !== 4">
                <el-input
                  v-model="editingLabel"
                  size="small"
                  @blur="saveNodeLabel(data)"
                  @keyup.enter="saveNodeLabel(data)"
                  @click.stop
                  style="flex: 1"
                />
              </template>
              <template v-else>
                <span style="flex: 1">{{ data.label }}</span>
                <el-button
                  v-if="data.level !== 4"
                  link
                  size="small"
                  @click.stop="startEdit(data)"
                  :title="$t('common.rename')"
                >✏️</el-button>
              </template>
            </span>
          </template>
        </el-tree>
        <div v-else-if="loading" style="color: #909399; font-size: 13px; padding: 8px">{{ $t('common.loading') }}</div>
      </div>

      <!-- Right: Leaf entries editor -->
      <div class="entries-panel" style="flex: 1; overflow-y: auto">
        <template v-if="selectedNode?.level === 4">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px">
            <h4 style="margin: 0">{{ selectedNode.label }} — {{ $t('common.entryList') }}</h4>
            <el-button
              type="primary"
              size="small"
              :loading="saving"
              :disabled="!isDirty"
              @click="saveEntries"
            >{{ $t('common.save') }}</el-button>
          </div>
          <div style="margin-bottom: 8px; display: flex; gap: 8px">
            <el-input
              v-model="newHeadword"
              size="small"
              :placeholder="$t('common.addEntry')"
              style="width: 200px"
              @keyup.enter="addHeadword"
            />
            <el-button size="small" @click="addHeadword">{{ $t('common.add') }}</el-button>
          </div>
          <el-tag
            v-for="(hw, i) in editingEntries"
            :key="i"
            closable
            @close="removeHeadword(i)"
            style="margin: 4px"
          >{{ hw }}</el-tag>
        </template>
        <div v-else style="color: #909399; font-size: 13px; padding: 8px">
          {{ $t('admin.taxonomyEditor.selectLeafHint') }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { onBeforeRouteLeave } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useTaxonomyStore } from '@/stores/taxonomy'
import type { TaxonomyNodeTree } from '@/api/taxonomy'

const { t } = useI18n()

const props = defineProps<{ sourceId: string }>()

const store = useTaxonomyStore()
const loading = computed(() => store.treeLoading[props.sourceId] ?? false)
const treeNodes = computed(() => store.treeBySourceId[props.sourceId] ?? [])

const selectedNode = ref<TaxonomyNodeTree | null>(null)
const editingEntries = ref<string[]>([])
const originalEntries = ref<string[]>([])
const isDirty = computed(
  () => JSON.stringify(editingEntries.value) !== JSON.stringify(originalEntries.value)
)
const newHeadword = ref('')
const saving = ref(false)

const editingNodeId = ref<string | null>(null)
const editingLabel = ref('')

onMounted(async () => {
  if (!store.treeBySourceId[props.sourceId]) {
    await store.fetchTree(props.sourceId)
  }
})

async function onNodeClick(data: TaxonomyNodeTree) {
  if (isDirty.value) {
    try {
      await ElMessageBox.confirm(t('admin.taxonomyEditor.discardChanges'), t('common.warning'), { type: 'warning' })
    } catch {
      return
    }
  }
  selectedNode.value = data
  if (data.level === 4) {
    await loadEntries(data.id)
  }
}

async function loadEntries(nodeId: string) {
  const result = await store.fetchNodeEntries(props.sourceId, nodeId)
  const headwords = result.data.map((e) => e.headword)
  editingEntries.value = [...headwords]
  originalEntries.value = [...headwords]
}

function addHeadword() {
  const hw = newHeadword.value.trim()
  if (!hw) return
  if (!editingEntries.value.includes(hw)) {
    editingEntries.value.push(hw)
  }
  newHeadword.value = ''
}

function removeHeadword(i: number) {
  editingEntries.value.splice(i, 1)
}

async function saveEntries() {
  if (!selectedNode.value) return
  saving.value = true
  try {
    await store.saveNodeEntries(props.sourceId, selectedNode.value.id, editingEntries.value)
    originalEntries.value = [...editingEntries.value]
    ElMessage.success(t('common.saveSuccess'))
  } catch (e: unknown) {
    ElMessage.error((e as Error).message ?? t('common.saveError'))
  } finally {
    saving.value = false
  }
}

function startEdit(data: TaxonomyNodeTree) {
  editingNodeId.value = data.id
  editingLabel.value = data.label
}

async function saveNodeLabel(data: TaxonomyNodeTree) {
  const label = editingLabel.value.trim()
  editingNodeId.value = null
  if (!label || label === data.label) return
  try {
    await store.renameNode(props.sourceId, data.id, label)
    await store.fetchTree(props.sourceId)
    ElMessage.success(t('admin.taxonomyEditor.renameSuccess'))
  } catch (e: unknown) {
    ElMessage.error((e as Error).message ?? t('admin.taxonomyEditor.renameError'))
  }
}

onBeforeRouteLeave(async (_to, _from, next) => {
  if (isDirty.value) {
    try {
      await ElMessageBox.confirm(t('admin.taxonomyEditor.discardAndLeave'), t('common.warning'), { type: 'warning' })
      next()
    } catch {
      next(false)
    }
  } else {
    next()
  }
})
</script>
