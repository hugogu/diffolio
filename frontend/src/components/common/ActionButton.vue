<template>
  <el-tooltip v-if="kind === 'admin' && tooltip" :content="label" placement="top" :show-after="150">
    <el-button
      v-bind="attrs"
      class="app-action-button admin-action-button"
      :icon="icon"
      :type="type"
      :loading="loading"
      :disabled="disabled"
      circle
      plain
    />
  </el-tooltip>
  <el-button
    v-else-if="kind === 'admin'"
    v-bind="attrs"
    class="app-action-button admin-action-button"
    :icon="icon"
    :type="type"
    :loading="loading"
    :disabled="disabled"
    circle
    plain
  />
  <el-button
    v-else
    v-bind="attrs"
    class="app-action-button user-action-button"
    :icon="icon"
    :type="type"
    :loading="loading"
    :disabled="disabled"
    text
  >
    {{ label }}
  </el-button>
</template>

<script setup lang="ts">
import { useAttrs } from 'vue'

defineOptions({ inheritAttrs: false })

withDefaults(defineProps<{
  kind: 'admin' | 'user'
  label: string
  icon?: unknown
  type?: '' | 'primary' | 'success' | 'warning' | 'info' | 'danger'
  loading?: boolean
  disabled?: boolean
  tooltip?: boolean
}>(), {
  type: '',
  icon: undefined,
  loading: false,
  disabled: false,
  tooltip: true,
})

const attrs = useAttrs()
</script>
