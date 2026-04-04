<template>
  <div class="tag-list-inline">
    <span v-if="label" class="tag-list-label">{{ label }}</span>
    <template v-if="tags.length > 0">
      <el-tag
        v-for="tag in tags"
        :key="tag.id"
        :size="size"
        :closable="removable"
        effect="plain"
        class="tag-chip"
        @close="$emit('remove', tag)"
      >
        {{ tag.name }}
      </el-tag>
    </template>
    <span v-else class="tag-list-empty">{{ emptyText }}</span>
  </div>
</template>

<script setup lang="ts">
import type { TagSummary } from '@/api/tags'

withDefaults(defineProps<{
  tags: TagSummary[]
  label?: string
  emptyText?: string
  removable?: boolean
  size?: 'large' | 'default' | 'small'
}>(), {
  label: '',
  emptyText: '',
  removable: false,
  size: 'small',
})

defineEmits<{
  (event: 'remove', tag: TagSummary): void
}>()
</script>

<style scoped>
.tag-list-inline {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.tag-list-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.tag-chip {
  max-width: 100%;
}

.tag-list-empty {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}
</style>
