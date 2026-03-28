<template>
  <el-dialog
    v-model="visible"
    width="420px"
    :close-on-click-modal="false"
    :show-close="true"
    @close="handleDismiss"
  >
    <template #header>
      <span style="font-size: 18px; font-weight: 700">
        {{ isRenewer ? '继续赞助？' : '您的赞助权限即将到期' }}
      </span>
    </template>

    <div class="modal-body">
      <p v-if="isRenewer" class="hint">
        您的捐赠权限还剩 <strong class="days-left">{{ daysLeft }} 天</strong>，继续赞助后电量和解锁记录全部保留，继续您的研习之旅。
      </p>
      <p v-else class="hint">
        您的捐赠权限将于 {{ expiryStr }} 到期，还剩 <strong class="days-left">{{ daysLeft }} 天</strong>。<br />
        现在继续赞助，历史解锁的词条和电量余额都会保留。
      </p>

      <el-alert
        type="info"
        :closable="false"
        style="margin-top: 12px"
      >
        捐赠方式：点击下方按钮前往捐赠方案页，扫码捐赠后备注邮箱，管理员确认后即可恢复。
      </el-alert>
    </div>

    <template #footer>
      <el-button @click="handleDismiss">下次再说</el-button>
      <el-button type="primary" @click="handleGoSubscribe">去捐赠</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useSubscriptionStore } from '@/stores/subscription'

const router = useRouter()
const subscriptionStore = useSubscriptionStore()

const visible = ref(false)

const daysLeft = computed(() => subscriptionStore.subscriptionState?.daysUntilExpiry ?? 0)
const isRenewer = computed(() => {
  // Renewer: already subscribed before (has subscription record), daysLeft <= 3
  return daysLeft.value <= 3
})
const expiryStr = computed(() => {
  const expiresAt = subscriptionStore.subscriptionState?.subscription?.expiresAt
  if (!expiresAt) return ''
  return new Date(expiresAt).toLocaleDateString('zh-CN')
})

// Show modal when showRenewalReminder is true and not dismissed this session
watch(
  () => subscriptionStore.showRenewalReminder,
  (should) => {
    if (should && !sessionStorage.getItem('renewalReminderDismissed')) {
      visible.value = true
    }
  },
  { immediate: true }
)

function handleDismiss(): void {
  visible.value = false
  sessionStorage.setItem('renewalReminderDismissed', '1')
}

function handleGoSubscribe(): void {
  visible.value = false
  router.push('/subscription')
}
</script>

<style scoped>
.modal-body {
  padding: 4px 0;
}

.hint {
  font-size: 15px;
  line-height: 1.7;
  color: var(--el-text-color-regular);
}

.days-left {
  color: var(--el-color-warning);
}
</style>
