<template>
  <div class="entry-tag-editor" @click.stop>
    <TagListInline
      :tags="tags"
      :label="label"
      :empty-text="emptyText"
      :removable="!disabled"
      @remove="emit('remove', $event)"
    />

    <el-popover
      v-model:visible="popoverVisible"
      placement="bottom-start"
      :width="300"
      trigger="click"
    >
      <template #reference>
        <el-button
          :disabled="disabled"
          :loading="loading"
          link
          size="small"
          class="tag-trigger"
          @click.stop
        >
          {{ addButtonText }}
        </el-button>
      </template>

      <div class="tag-popover" @click.stop>
        <el-select
          v-model="draftValue"
          filterable
          allow-create
          default-first-option
          clearable
          :reserve-keyword="false"
          :loading="loading"
          :placeholder="placeholder"
          style="width: 100%"
          @change="handleSelect"
        >
          <el-option
            v-for="option in selectableTags"
            :key="option.id"
            :label="option.name"
            :value="option.id"
          />
        </el-select>
        <p v-if="helperText" class="tag-helper">{{ helperText }}</p>
      </div>
    </el-popover>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { TagSummary } from '@/api/tags'
import TagListInline from './TagListInline.vue'

const props = withDefaults(defineProps<{
  tags: TagSummary[]
  availableTags: TagSummary[]
  loading?: boolean
  disabled?: boolean
  label?: string
  emptyText?: string
  addButtonText?: string
  placeholder?: string
  helperText?: string
}>(), {
  loading: false,
  disabled: false,
  label: '',
  emptyText: '',
  addButtonText: '',
  placeholder: '',
  helperText: '',
})

const emit = defineEmits<{
  (event: 'add-existing', tagId: string): void
  (event: 'create', name: string): void
  (event: 'remove', tag: TagSummary): void
}>()

const popoverVisible = ref(false)
const draftValue = ref('')

const selectableTags = computed(() => {
  const selectedIds = new Set(props.tags.map((tag) => tag.id))
  return props.availableTags.filter((tag) => !selectedIds.has(tag.id))
})

function handleSelect(value: string | undefined) {
  if (!value) return

  const existing = selectableTags.value.find((tag) => tag.id === value)
  if (existing) {
    emit('add-existing', existing.id)
  } else {
    emit('create', value)
  }

  draftValue.value = ''
  popoverVisible.value = false
}
</script>

<style scoped>
.entry-tag-editor {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.tag-trigger {
  padding: 0;
  min-height: auto;
}

.tag-popover {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tag-helper {
  margin: 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.4;
}
</style>
