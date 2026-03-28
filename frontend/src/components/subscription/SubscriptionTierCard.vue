<template>
  <el-card class="tier-card" :class="{ 'is-current': isCurrent }">
    <div class="tier-header">
      <div class="tier-name">{{ tierDisplayName }}</div>
      <div class="tier-price">
        <span class="price-amount">¥{{ plan.priceYuan }}</span>
        <span class="price-period">/月</span>
      </div>
    </div>

    <ul class="tier-features">
      <li>
        <el-icon><Grid /></el-icon>
        {{ plan.slotCount }} 个书籍栏位
      </li>
      <li>
        <el-icon><Lightning /></el-icon>
        {{ plan.monthlyEnergyAlloc.toLocaleString() }} 词电量/月
      </li>
      <li>
        <el-icon><Refresh /></el-icon>
        每月重置，未用完不累积
      </li>
      <li>
        <el-icon><Unlock /></el-icon>
        已解锁词条永久可查
      </li>
    </ul>

    <p v-if="plan.description" class="tier-desc">{{ plan.description }}</p>

    <div class="tier-action">
      <el-tag v-if="isCurrent" type="success" class="current-badge">当前方案</el-tag>
      <el-button v-else type="primary" @click="emit('subscribe', plan)">
        捐赠 ¥{{ plan.priceYuan }}/月
      </el-button>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Grid, Lightning, Refresh, Unlock } from '@element-plus/icons-vue'
import type { SubscriptionPlan } from '@/api/subscription'

const props = defineProps<{
  plan: SubscriptionPlan
  isCurrent: boolean
}>()

const emit = defineEmits<{
  (e: 'subscribe', plan: SubscriptionPlan): void
}>()

const tierDisplayName = computed(() => {
  const map: Record<string, string> = {
    BASIC: '轻量赞助',
    ADVANCED: '友情赞助',
    PREMIUM: '深度赞助',
    ELITE: '铁杆赞助',
  }
  return map[props.plan.tier] ?? props.plan.tier
})
</script>

<style scoped>
.tier-card {
  border: 2px solid var(--el-border-color);
  transition: border-color 0.2s, box-shadow 0.2s;
}

.tier-card:hover {
  border-color: var(--el-color-primary-light-5);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
}

.tier-card.is-current {
  border-color: var(--el-color-success);
}

.tier-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 16px;
}

.tier-name {
  font-size: 17px;
  font-weight: 700;
}

.price-amount {
  font-size: 24px;
  font-weight: 800;
  color: var(--el-color-primary);
}

.price-period {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.tier-features {
  list-style: none;
  padding: 0;
  margin: 0 0 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tier-features li {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  color: var(--el-text-color-regular);
}

.tier-desc {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 16px;
}

.tier-action {
  margin-top: 16px;
}

.current-badge {
  font-size: 13px;
}
</style>
