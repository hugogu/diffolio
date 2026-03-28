<template>
  <div class="subscription-plans-page">
    <div class="page-header">
      <h2>{{ $t('admin.subscriptionPlans.title') }}</h2>
    </div>

    <el-alert
      :title="$t('admin.subscriptionPlans.priceNote')"
      type="info"
      :closable="false"
      show-icon
      style="margin-bottom: 20px"
    />

    <div v-if="loading">
      <el-skeleton :rows="6" animated />
    </div>

    <el-table v-else :data="allTierRows" border>
      <el-table-column :label="$t('admin.subscriptionPlans.plan')" width="120">
        <template #default="{ row }">
          <strong>{{ tierLabel(row.tier) }}</strong>
        </template>
      </el-table-column>
      <el-table-column :label="$t('admin.subscriptionPlans.status')" width="90" align="center">
        <template #default="{ row }">
          <el-switch
            v-if="row.exists"
            v-model="row.isActive"
            @change="updatePlan(row, { isActive: row.isActive })"
          />
          <el-tag v-else type="info" size="small">{{ $t('admin.subscriptionPlans.notCreated') }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="$t('admin.subscriptionPlans.price')" width="130" align="center">
        <template #default="{ row }">
          <el-input-number
            v-if="row.exists"
            v-model="row.priceYuan"
            :min="0"
            :precision="2"
            :step="1"
            size="small"
            style="width: 100px"
            @change="updatePlan(row, { priceYuan: row.priceYuan })"
          />
          <span v-else class="placeholder-text">—</span>
        </template>
      </el-table-column>
      <el-table-column :label="$t('admin.subscriptionPlans.monthlyEnergy')" width="130" align="center">
        <template #default="{ row }">
          <el-input-number
            v-if="row.exists"
            v-model="row.monthlyEnergyAlloc"
            :min="100"
            :step="500"
            size="small"
            style="width: 100px"
            @change="updatePlan(row, { monthlyEnergyAlloc: row.monthlyEnergyAlloc })"
          />
          <span v-else class="placeholder-text">—</span>
        </template>
      </el-table-column>
      <el-table-column :label="$t('admin.subscriptionPlans.bookSlots')" width="110" align="center">
        <template #default="{ row }">
          <el-input-number
            v-if="row.exists"
            v-model="row.slotCount"
            :min="1"
            :max="10"
            :step="1"
            size="small"
            style="width: 80px"
            @change="updatePlan(row, { slotCount: row.slotCount })"
          />
          <span v-else class="placeholder-text">—</span>
        </template>
      </el-table-column>
      <el-table-column :label="$t('admin.subscriptionPlans.description')">
        <template #default="{ row }">
          <el-input
            v-if="row.exists"
            v-model="row.description"
            size="small"
            @blur="updatePlan(row, { description: row.description })"
          />
          <span v-else class="placeholder-text">—</span>
        </template>
      </el-table-column>
      <el-table-column :label="$t('comparisons.actions')" width="160" align="center">
        <template #default="{ row }">
          <span v-if="row.exists" class="updated-at">{{ formatDate(row.updatedAt) }}</span>
          <el-button
            v-else
            type="primary"
            size="small"
            @click="openCreateDialog(row.tier)"
          >
            {{ $t('admin.subscriptionPlans.created') }}
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- Create plan dialog -->
    <el-dialog v-model="createDialogVisible" :title="$t('admin.subscriptionPlans.createPlan', { tier: tierLabel(createForm.tier) })" width="420px">
      <el-form :model="createForm" label-width="100px">
        <el-form-item :label="$t('admin.subscriptionPlans.price')">
          <el-input-number v-model="createForm.priceYuan" :min="0" :precision="2" :step="1" />
        </el-form-item>
        <el-form-item :label="$t('admin.subscriptionPlans.monthlyEnergy')">
          <el-input-number v-model="createForm.monthlyEnergyAlloc" :min="100" :step="500" />
        </el-form-item>
        <el-form-item :label="$t('admin.subscriptionPlans.bookSlots')">
          <el-input-number v-model="createForm.slotCount" :min="1" :max="10" :step="1" />
        </el-form-item>
        <el-form-item :label="$t('admin.subscriptionPlans.description')">
          <el-input v-model="createForm.description" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDialogVisible = false">{{ $t('admin.subscriptionPlans.cancel') }}</el-button>
        <el-button type="primary" :loading="creating" @click="handleCreate">{{ $t('common.create') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import {
  adminListSubscriptionPlans,
  adminUpdateSubscriptionPlan,
  adminCreateSubscriptionPlan,
  type AdminSubscriptionPlan,
} from '@/api/admin'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const ALL_TIERS = ['BASIC', 'ADVANCED', 'PREMIUM', 'ELITE'] as const

const loading = ref(false)
const plans = ref<AdminSubscriptionPlan[]>([])

const creating = ref(false)
const createDialogVisible = ref(false)
const createForm = ref({
  tier: '',
  priceYuan: 0,
  monthlyEnergyAlloc: 1000,
  slotCount: 1,
  description: '',
})

const allTierRows = computed(() => {
  return ALL_TIERS.map((tier) => {
    const plan = plans.value.find((p) => p.tier === tier)
    if (plan) return { ...plan, exists: true }
    return { tier, exists: false, priceYuan: 0, monthlyEnergyAlloc: 0, slotCount: 0, description: '', isActive: false, updatedAt: '' }
  })
})

async function loadPlans() {
  loading.value = true
  try {
    const res = await adminListSubscriptionPlans()
    plans.value = res.plans
  } finally {
    loading.value = false
  }
}

async function updatePlan(plan: AdminSubscriptionPlan, changes: Partial<AdminSubscriptionPlan>) {
  try {
    await adminUpdateSubscriptionPlan(plan.tier, changes)
    ElMessage.success(t('admin.subscriptionPlans.updateSuccess'))
  } catch (err: unknown) {
    const msg = (err as { message?: string })?.message ?? t('admin.subscriptionPlans.updateError')
    ElMessage.error(msg)
    await loadPlans()
  }
}

function openCreateDialog(tier: string) {
  const defaults: Record<string, { price: number; energy: number; slots: number }> = {
    BASIC: { price: 9, energy: 2000, slots: 1 },
    ADVANCED: { price: 17, energy: 4000, slots: 2 },
    PREMIUM: { price: 24, energy: 6000, slots: 3 },
    ELITE: { price: 38, energy: 10000, slots: 5 },
  }
  const d = defaults[tier] ?? { price: 0, energy: 1000, slots: 1 }
  createForm.value = { tier, priceYuan: d.price, monthlyEnergyAlloc: d.energy, slotCount: d.slots, description: '' }
  createDialogVisible.value = true
}

async function handleCreate() {
  creating.value = true
  try {
    const plan = await adminCreateSubscriptionPlan(createForm.value)
    plans.value = [...plans.value, plan]
    createDialogVisible.value = false
    ElMessage.success(t('admin.subscriptionPlans.createSuccess', { tier: tierLabel(plan.tier) }))
  } catch (err: unknown) {
    const msg = (err as { message?: string })?.message ?? t('admin.subscriptionPlans.createError')
    ElMessage.error(msg)
  } finally {
    creating.value = false
  }
}

function tierLabel(tier: string): string {
  return t(`admin.subscriptionPlans.tierLabels.${tier}`) ?? tier
}

function formatDate(iso: string): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString('zh-CN', { hour12: false })
}

onMounted(loadPlans)
</script>

<style scoped>
.subscription-plans-page {
  padding: 24px;
}

.page-header {
  margin-bottom: 16px;
}

.page-header h2 {
  margin: 0;
}

.placeholder-text {
  color: var(--el-text-color-placeholder);
}

.updated-at {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
