<template>
  <div class="page-shell">
    <div class="page-header">
      <div class="page-title-group">
        <h2 class="page-title">{{ $t('admin.tagManagement.title') }}</h2>
        <p class="page-desc">{{ $t('admin.tagManagement.description') }}</p>
      </div>
    </div>

    <div class="toolbar">
      <el-input
        v-model="search"
        :placeholder="$t('admin.tagManagement.searchPlaceholder')"
        clearable
        class="search-input"
        @keyup.enter="loadTags"
        @clear="loadTags"
      />
      <el-button :loading="tagsStore.loading" @click="loadTags">{{ $t('common.search') }}</el-button>
    </div>

    <el-table v-loading="tagsStore.loading" :data="tagsStore.tags" style="width: 100%">
      <el-table-column prop="name" :label="$t('common.name')" min-width="220" />
      <el-table-column prop="usageCount" :label="$t('admin.tagManagement.usageCount')" width="140" />
      <el-table-column :label="$t('comparisons.actions')" width="120" align="right" header-align="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openRenameDialog(row.id, row.name)">
            {{ $t('admin.tagManagement.rename') }}
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-empty
      v-if="!tagsStore.loading && tagsStore.tags.length === 0"
      :description="$t('admin.tagManagement.empty')"
      class="empty-state"
    />

    <el-dialog
      v-model="renameDialogVisible"
      :title="$t('admin.tagManagement.renameTitle')"
      width="420px"
      :close-on-click-modal="false"
    >
      <el-form label-position="top">
        <el-form-item :label="$t('admin.tagManagement.renameField')">
          <el-input v-model="renameValue" :placeholder="$t('admin.tagManagement.renamePlaceholder')" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="renameDialogVisible = false">{{ $t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="renaming" @click="handleRename">{{ $t('common.save') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { useTagsStore } from '@/stores/tags'

const { t } = useI18n()
const tagsStore = useTagsStore()

const search = ref('')
const renameDialogVisible = ref(false)
const renaming = ref(false)
const editingTagId = ref('')
const renameValue = ref('')

onMounted(() => {
  loadTags()
})

function loadTags() {
  return tagsStore.loadTags({ q: search.value.trim() || undefined })
}

function openRenameDialog(tagId: string, currentName: string) {
  editingTagId.value = tagId
  renameValue.value = currentName
  renameDialogVisible.value = true
}

async function handleRename() {
  if (!renameValue.value.trim()) {
    ElMessage.warning(t('admin.tagManagement.validation.required'))
    return
  }

  renaming.value = true
  try {
    await tagsStore.renameExistingTag(editingTagId.value, renameValue.value)
    renameDialogVisible.value = false
    ElMessage.success(t('admin.tagManagement.renameSuccess'))
  } catch (error) {
    const message = error instanceof Error ? error.message : t('admin.tagManagement.renameError')
    ElMessage.error(message)
  } finally {
    renaming.value = false
  }
}
</script>

<style scoped>
.page-shell {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}

.page-title {
  margin: 0;
}

.page-desc {
  margin: 6px 0 0;
  color: var(--el-text-color-secondary);
}

.toolbar {
  display: flex;
  gap: 12px;
  align-items: center;
}

.search-input {
  max-width: 320px;
}

.empty-state {
  padding-top: 24px;
}
</style>
