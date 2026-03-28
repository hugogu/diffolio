<template>
  <div class="word-lock-overlay">
    <!-- Locked state: blur content, show unlock prompt -->
    <div v-if="locked" class="lock-container">
      <div class="blurred-content">
        <slot />
      </div>
      <div class="lock-badge">
        <el-icon class="lock-icon"><Lock /></el-icon>
        <span class="lock-prompt">消耗 1 点电量解锁</span>
        <el-button
          size="small"
          type="primary"
          :loading="unlocking"
          @click.stop="handleUnlock"
        >
          解锁
        </el-button>
      </div>
    </div>

    <!-- Unlocked state: show content normally -->
    <slot v-else />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Lock } from '@element-plus/icons-vue'

const props = defineProps<{
  locked: boolean
}>()

const emit = defineEmits<{
  (e: 'unlock'): void
}>()

const unlocking = ref(false)

async function handleUnlock(): Promise<void> {
  if (unlocking.value) return
  unlocking.value = true
  try {
    emit('unlock')
  } finally {
    // Parent controls the locked state; reset loading after a short delay
    setTimeout(() => { unlocking.value = false }, 1500)
  }
}
</script>

<style scoped>
.word-lock-overlay {
  position: relative;
  width: 100%;
}

.lock-container {
  position: relative;
}

.blurred-content {
  filter: blur(4px);
  user-select: none;
  pointer-events: none;
  opacity: 0.6;
}

.lock-badge {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: rgba(255, 255, 255, 0.1);
}

.lock-icon {
  font-size: 16px;
  color: var(--el-color-info);
}

.lock-prompt {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
