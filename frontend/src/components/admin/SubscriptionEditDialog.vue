<template>
  <el-dialog
    :model-value="true"
    :title="t('admin.subscriptionDialog.title', { email: user.email })"
    width="520px"
    @close="emit('close')"
  >
    <div v-if="loadingDetail" class="loading">
      <el-skeleton :rows="4" animated />
    </div>

    <!-- Step 2: Slot downgrade dict picker -->
    <template v-else-if="downgradeConflict">
      <el-alert
        type="warning"
        :closable="false"
        show-icon
        style="margin-bottom: 16px"
        :title="t('admin.subscriptionDialog.downgradeTitle', { tier: tierLabel(form.tier), count: downgradeConflict.newSlotCount })"
        :description="t('admin.subscriptionDialog.downgradeDesc')"
      />
      <el-checkbox-group v-model="keepDictIds">
        <div
          v-for="dict in downgradeConflict.dicts"
          :key="dict.id"
          class="dict-option"
        >
          <el-checkbox
            :label="dict.id"
            :disabled="keepDictIds.length >= downgradeConflict.newSlotCount && !keepDictIds.includes(dict.id)"
          >
            {{ dict.name }}
            <span class="dict-access">{{ t('admin.subscriptionDialog.lastAccessed', { date: formatDate(dict.lastAccessedAt) }) }}</span>
          </el-checkbox>
        </div>
      </el-checkbox-group>
    </template>

    <!-- Step 1: Normal form -->
    <el-form v-else :model="form" label-width="100px">
      <el-alert
        v-if="detail?.subscription"
        class="current-status"
        :title="t('admin.subscriptionDialog.currentStatus', { status: statusLabel(detail.subscription.status), tier: tierLabel(detail.subscription.tier) })"
        :type="detail.subscription.status === 'ACTIVE' ? 'success' : 'warning'"
        :closable="false"
        show-icon
      />

      <el-form-item :label="t('admin.subscriptionDialog.donationPlan')" required>
        <el-select v-model="form.tier" :placeholder="t('admin.subscriptionDialog.selectPlan')">
          <el-option :label="t('admin.subscriptionDialog.tierOption', { tier: t('admin.subscriptionPlans.tierLabels.BASIC'), price: 9 })" value="BASIC" />
          <el-option :label="t('admin.subscriptionDialog.tierOption', { tier: t('admin.subscriptionPlans.tierLabels.ADVANCED'), price: 17 })" value="ADVANCED" />
          <el-option :label="t('admin.subscriptionDialog.tierOption', { tier: t('admin.subscriptionPlans.tierLabels.PREMIUM'), price: 24 })" value="PREMIUM" />
          <el-option :label="t('admin.subscriptionDialog.tierOption', { tier: t('admin.subscriptionPlans.tierLabels.ELITE'), price: 38 })" value="ELITE" />
          <el-option :label="t('admin.subscriptionDialog.cancelOption')" value="FREE" :style="{ color: 'var(--el-color-danger)' }" />
        </el-select>
      </el-form-item>

      <el-alert
        v-if="form.tier === 'FREE'"
        type="error"
        :closable="false"
        show-icon
        :title="t('admin.subscriptionDialog.cancelAlertTitle')"
        :description="t('admin.subscriptionDialog.cancelAlertDesc')"
        style="margin-bottom: 8px"
      />

      <el-form-item v-if="form.tier !== 'FREE'" :label="t('admin.subscriptionDialog.expiresAt')" required>
        <el-date-picker
          v-model="form.expiresAt"
          type="datetime"
          :placeholder="t('admin.subscriptionDialog.selectExpiresAt')"
          format="YYYY-MM-DD HH:mm"
          value-format="YYYY-MM-DDTHH:mm:ss"
          style="width: 100%"
        />
      </el-form-item>

      <el-form-item v-if="form.tier !== 'FREE'" :label="t('admin.subscriptionDialog.quickRenew')">
        <div class="quick-dates">
          <el-button size="small" @click="setExpiry(30)">{{ t('admin.subscriptionDialog.addDays', { days: 30 }) }}</el-button>
          <el-button size="small" @click="setExpiry(90)">{{ t('admin.subscriptionDialog.addDays', { days: 90 }) }}</el-button>
          <el-button size="small" @click="setExpiry(365)">{{ t('admin.subscriptionDialog.addYear') }}</el-button>
        </div>
      </el-form-item>

      <template v-if="form.tier !== 'FREE'">
      <el-divider>{{ t('admin.subscriptionDialog.creditEnergyOptional') }}</el-divider>

      <el-form-item :label="t('admin.subscriptionDialog.creditEnergy')">
        <el-input-number
          v-model="form.creditAmount"
          :min="0"
          :step="1000"
          :placeholder="t('admin.subscriptionDialog.creditPlaceholder')"
          style="width: 180px"
        />
        <span class="credit-hint">{{ t('admin.subscriptionDialog.pointsHint') }}</span>
      </el-form-item>

      <el-form-item v-if="form.creditAmount && form.creditAmount > 0" :label="t('admin.subscriptionDialog.creditNoteLabel')">
        <el-input v-model="form.creditNote" :placeholder="t('admin.subscriptionDialog.creditNotePlaceholder')" />
      </el-form-item>
      </template>
    </el-form>

    <template #footer>
      <el-button @click="emit('close')">{{ t('common.cancel') }}</el-button>
      <template v-if="downgradeConflict">
        <el-button @click="downgradeConflict = null">{{ t('common.back') }}</el-button>
        <el-button
          type="danger"
          :loading="saving"
          :disabled="keepDictIds.length !== downgradeConflict.newSlotCount"
          @click="handleSlotDowngrade"
        >
          {{ t('admin.subscriptionDialog.confirmDowngrade') }}
        </el-button>
      </template>
      <el-button
        v-else
        :type="form.tier === 'FREE' ? 'danger' : 'primary'"
        :loading="saving"
        @click="handleSave"
      >
        {{ form.tier === 'FREE' ? t('admin.subscriptionDialog.confirmCancel') : t('admin.subscriptionDialog.renewCoffee') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import {
  adminGetUserSubscription,
  adminUpdateUserSubscription,
  adminCreditEnergy,
  adminSlotDowngrade,
  adminCancelSubscription,
  type AdminSubscriptionDetail,
  type AdminUser,
} from '@/api/admin'

const { t } = useI18n()

interface DowngradeConflict {
  dicts: { id: string; name: string; lastAccessedAt: string | null }[]
  newSlotCount: number
  currentDictCount: number
}

const props = defineProps<{ user: AdminUser }>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'saved'): void
}>()

const loadingDetail = ref(true)
const saving = ref(false)
const detail = ref<AdminSubscriptionDetail | null>(null)
const downgradeConflict = ref<DowngradeConflict | null>(null)
const keepDictIds = ref<string[]>([])

const form = ref({
  tier: 'BASIC',
  expiresAt: '',
  creditAmount: 0,
  creditNote: '',
})

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    ACTIVE: t('profile.status.active'),
    GRACE: t('profile.status.grace'),
    EXPIRED: t('profile.status.expired')
  }
  return labels[status] ?? status
}

function tierLabel(tier: string): string {
  const labels: Record<string, string> = {
    BASIC: t('admin.subscriptionPlans.tierLabels.BASIC'),
    ADVANCED: t('admin.subscriptionPlans.tierLabels.ADVANCED'),
    PREMIUM: t('admin.subscriptionPlans.tierLabels.PREMIUM'),
    ELITE: t('admin.subscriptionPlans.tierLabels.ELITE')
  }
  return labels[tier] ?? tier
}

function setExpiry(days: number): void {
  const base = detail.value?.subscription?.expiresAt
    ? new Date(detail.value.subscription.expiresAt)
    : new Date()
  const d = new Date(Math.max(base.getTime(), Date.now()) + days * 86400000)
  form.value.expiresAt = d.toISOString().slice(0, 19)
}

function formatDate(iso: string | null): string {
  if (!iso) return t('admin.subscriptionDialog.neverAccessed')
  return new Date(iso).toLocaleDateString()
}

async function handleSave(): Promise<void> {
  if (!form.value.tier) {
    ElMessage.warning(t('admin.subscriptionDialog.selectPlanWarning'))
    return
  }

  // Handle cancellation separately
  if (form.value.tier === 'FREE') {
    saving.value = true
    try {
      await adminCancelSubscription(props.user.id)
      ElMessage.success(t('admin.subscriptionDialog.cancelSuccess'))
      emit('saved')
      emit('close')
    } catch (err: unknown) {
      ElMessage.error((err as { message?: string })?.message ?? t('admin.subscriptionDialog.operationFailed'))
    } finally {
      saving.value = false
    }
    return
  }

  if (!form.value.expiresAt) {
    ElMessage.warning(t('admin.subscriptionDialog.expiresAtRequired'))
    return
  }
  saving.value = true
  try {
    await adminUpdateUserSubscription(props.user.id, {
      tier: form.value.tier,
      expiresAt: new Date(form.value.expiresAt).toISOString(),
    })
    if (form.value.creditAmount && form.value.creditAmount > 0) {
      await adminCreditEnergy(props.user.id, form.value.creditAmount, form.value.creditNote || undefined)
    }
    ElMessage.success(t('admin.subscriptionDialog.renewSuccess'))
    emit('saved')
    emit('close')
  } catch (err: unknown) {
    const e = err as { code?: string; details?: DowngradeConflict; message?: string }
    if (e?.code === 'SLOT_DOWNGRADE_CONFLICT' && e.details) {
      // Show step 2: dict picker
      downgradeConflict.value = e.details
      // Pre-select most recently accessed dicts up to slot count
      keepDictIds.value = e.details.dicts
        .slice(0, e.details.newSlotCount)
        .map((d) => d.id)
    } else {
      ElMessage.error(e?.message ?? t('admin.subscriptionDialog.operationFailed'))
    }
  } finally {
    saving.value = false
  }
}

async function handleSlotDowngrade(): Promise<void> {
  if (!downgradeConflict.value) return
  saving.value = true
  try {
    await adminSlotDowngrade(props.user.id, {
      keepDictionaryIds: keepDictIds.value,
      newSlotCount: downgradeConflict.value.newSlotCount,
      tier: form.value.tier,
      expiresAt: new Date(form.value.expiresAt).toISOString(),
    })
    if (form.value.creditAmount && form.value.creditAmount > 0) {
      await adminCreditEnergy(props.user.id, form.value.creditAmount, form.value.creditNote || undefined)
    }
    ElMessage.success(t('admin.subscriptionDialog.downgradeSuccess'))
    emit('saved')
    emit('close')
  } catch (err: unknown) {
    ElMessage.error((err as { message?: string })?.message ?? t('admin.subscriptionDialog.operationFailed'))
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  try {
    detail.value = await adminGetUserSubscription(props.user.id)
    if (detail.value.subscription) {
      form.value.tier = detail.value.subscription.tier
      // Default next expiry: same tier, +30 days
      setExpiry(30)
    } else {
      setExpiry(30)
    }
  } finally {
    loadingDetail.value = false
  }
})
</script>

<style scoped>
.current-status {
  margin-bottom: 16px;
}

.quick-dates {
  display: flex;
  gap: 8px;
}

.credit-hint {
  margin-left: 8px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.dict-option {
  padding: 6px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.dict-access {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}
</style>
