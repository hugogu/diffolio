<template>
  <div class="json-editor-container">
    <div class="editor-wrapper">
      <pre ref="highlightLayerRef" class="highlight-layer" aria-hidden="true"><code class="highlight-code" v-html="highlightedCode"></code></pre>
      <textarea
        ref="editLayerRef"
        v-model="localValue"
        class="edit-layer"
        :style="textareaStyle"
        spellcheck="false"
        wrap="off"
        @input="handleInput"
        @scroll="syncScroll"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import Prism from 'prismjs'
import 'prismjs/components/prism-json'

const props = defineProps<{
  modelValue: string
  minRows?: number
  maxRows?: number
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const localValue = ref(props.modelValue)
const highlightLayerRef = ref<HTMLPreElement | null>(null)
const editLayerRef = ref<HTMLTextAreaElement | null>(null)

watch(() => props.modelValue, (newVal) => {
  if (newVal !== localValue.value) {
    localValue.value = newVal
  }
})

const highlightedCode = computed(() => {
  const code = localValue.value || ''
  return Prism.highlight(code, Prism.languages.json, 'json')
})

const textareaStyle = computed(() => ({
  minHeight: props.minRows ? `${props.minRows * 1.5}em` : '18em',
  maxHeight: props.maxRows ? `${props.maxRows * 1.5}em` : undefined,
}))

function handleInput() {
  emit('update:modelValue', localValue.value)
}

function syncScroll(e: Event) {
  const textarea = (e.target as HTMLTextAreaElement) ?? editLayerRef.value
  const pre = highlightLayerRef.value
  if (textarea && pre) {
    pre.scrollTop = textarea.scrollTop
    pre.scrollLeft = textarea.scrollLeft
  }
}
</script>

<style scoped>
.json-editor-container {
  position: relative;
  width: 100%;
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  font-family: 'Courier New', Courier, monospace;
  font-size: 12px;
  line-height: 1.5;
  background: var(--el-fill-color-light);
}

.editor-wrapper {
  position: relative;
  overflow: hidden;
}

.highlight-layer,
.edit-layer {
  margin: 0;
  padding: 8px 12px;
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
  white-space: pre;
  word-wrap: normal;
  word-break: keep-all;
  overflow: auto;
  tab-size: 2;
}

.highlight-layer {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
  color: var(--el-text-color-regular);
  background: transparent;
}

.highlight-code {
  display: block;
  margin: 0;
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
  white-space: inherit;
  tab-size: inherit;
}

.edit-layer {
  position: relative;
  display: block;
  width: 100%;
  color: transparent;
  background: transparent;
  caret-color: var(--el-text-color-regular);
  border: none;
  outline: none;
  resize: vertical;
}

/* PrismJS Token Colors */
:deep(.token.property) {
  color: #905;
}

:deep(.token.string) {
  color: #690;
}

:deep(.token.number) {
  color: #905;
}

:deep(.token.boolean) {
  color: #07a;
}

:deep(.token.null) {
  color: #07a;
}

:deep(.token.punctuation) {
  color: #999;
}
</style>
