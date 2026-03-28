<template>
  <el-tooltip :content="tooltipText" placement="bottom">
    <div class="energy-indicator" :class="indicatorClass" @click="goToSubscription">
      <el-icon class="energy-icon">
        <component :is="iconComponent" />
      </el-icon>
      <span class="energy-label">{{ displayText }}</span>
    </div>
  </el-tooltip>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useSubscriptionStore } from '@/stores/subscription'
import { Lightning, Warning, Lock } from '@element-plus/icons-vue'

const router = useRouter()
const subscriptionStore = useSubscriptionStore()

const totalEnergy = computed(() => subscriptionStore.totalEnergy)
const isWarningLevel = computed(() => subscriptionStore.isWarningLevel)
const isZeroEnergy = computed(() => subscriptionStore.isZeroEnergy)
const isFrozen = computed(() => subscriptionStore.isFrozen)
const isActive = computed(() => subscriptionStore.isActive)
const state = computed(() => subscriptionStore.subscriptionState)

// Next 1st of month for reset tooltip
const nextResetDate = computed(() => {
  const now = new Date()
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  return `${next.getMonth() + 1}月1日`
})

const indicatorClass = computed(() => ({
  'is-warning': isWarningLevel.value && !isZeroEnergy.value,
  'is-zero': isZeroEnergy.value,
  'is-frozen': isFrozen.value,
  'is-none': !state.value?.hasSub,
}))

const iconComponent = computed(() => {
  if (isFrozen.value) return Lock
  if (isZeroEnergy.value) return Warning
  if (isWarningLevel.value) return Warning
  return Lightning
})

const displayText = computed(() => {
  if (isFrozen.value) return '冻结'
  if (isZeroEnergy.value) return '电量耗尽'
  if (!state.value?.hasSub) {
    const used = state.value?.energyBalance?.lifetimeUsed ?? 0
    return `${used}/100 词`
  }
  return `${totalEnergy.value} 电量`
})

const tooltipText = computed(() => {
  if (isFrozen.value) return '电量已冻结，再次捐赠后恢复'
  if (isZeroEnergy.value) return `本月电量用完，将于${nextResetDate.value}重置`
  if (!state.value?.hasSub) return '免费体验电量，点击了解捐赠方案'
  if (isWarningLevel.value) return `电量偏低，距下次重置：${nextResetDate.value}`
  return '点击查看捐赠方案与电量详情'
})

function goToSubscription(): void {
  router.push('/subscription')
}
</script>

<style scoped>
.energy-indicator {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 16px;
  cursor: pointer;
  font-size: 13px;
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  transition: background 0.2s;
  user-select: none;
}

.energy-indicator:hover {
  background: var(--el-color-primary-light-7);
}

.energy-indicator.is-warning {
  color: var(--el-color-warning);
  background: var(--el-color-warning-light-9);
}

.energy-indicator.is-frozen {
  color: var(--el-color-info);
  background: var(--el-color-info-light-9);
}

.energy-indicator.is-none {
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color);
}

.energy-indicator.is-zero {
  color: var(--el-color-danger);
  background: var(--el-color-danger-light-9);
}

.energy-icon {
  font-size: 14px;
}
</style>
