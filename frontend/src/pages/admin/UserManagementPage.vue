<template>
  <div class="user-management">
    <div class="page-header">
      <h2>{{ $t('admin.users.title') }}</h2>
      <div class="filters">
        <el-input
          v-model="filterEmail"
          :placeholder="$t('admin.users.searchEmail')"
          clearable
          style="width: 200px"
          @change="loadUsers"
        />
        <el-select v-model="filterRole" :placeholder="$t('admin.users.allRoles')" clearable style="width: 160px" @change="loadUsers">
          <el-option :label="$t('admin.users.roles.ADMIN')" value="ADMIN" />
          <el-option :label="$t('admin.users.roles.SUBSCRIBED')" value="SUBSCRIBED" />
          <el-option :label="$t('admin.users.roles.REGULAR')" value="REGULAR" />
        </el-select>
        <el-radio-group v-model="filterEmailVerified" size="small" @change="loadUsers">
          <el-radio-button label="">{{ $t('admin.users.verified') }}</el-radio-button>
          <el-radio-button label="true">{{ $t('common.yes') }}</el-radio-button>
          <el-radio-button label="false">{{ $t('common.no') }}</el-radio-button>
        </el-radio-group>
        <el-radio-group v-model="filterExportEnabled" size="small" @change="loadUsers">
          <el-radio-button label="">{{ $t('admin.users.export') }}</el-radio-button>
          <el-radio-button label="true">{{ $t('common.yes') }}</el-radio-button>
          <el-radio-button label="false">{{ $t('common.no') }}</el-radio-button>
        </el-radio-group>
        <el-radio-group v-model="filterCanEditBuiltinConfigs" size="small" @change="loadUsers">
          <el-radio-button label="">{{ $t('admin.users.editConfig') }}</el-radio-button>
          <el-radio-button label="true">{{ $t('common.yes') }}</el-radio-button>
          <el-radio-button label="false">{{ $t('common.no') }}</el-radio-button>
        </el-radio-group>
        <el-radio-group v-model="filterWatermarkEnabled" size="small" @change="loadUsers">
          <el-radio-button label="">{{ $t('admin.users.watermark') }}</el-radio-button>
          <el-radio-button label="true">{{ $t('common.yes') }}</el-radio-button>
          <el-radio-button label="false">{{ $t('common.no') }}</el-radio-button>
        </el-radio-group>
      </div>
    </div>

    <el-table v-loading="loading" :data="users" stripe>
      <el-table-column :label="$t('admin.users.email')" prop="email" min-width="140" show-overflow-tooltip />
      <el-table-column :label="$t('admin.users.role')" width="110">
        <template #default="{ row }">
          <el-tag :type="roleTagType(row.role)" size="small">{{ roleLabel(row.role) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="$t('admin.users.capacity')" width="100" align="center">
        <template #default="{ row }">
          <span style="font-size: 12px; color: #606266;">{{ row.maxVersions }}/{{ row.maxBooks }}</span>
        </template>
      </el-table-column>
      <el-table-column :label="$t('admin.users.energy')" width="80" align="center">
        <template #default="{ row }">
          <span v-if="energyMap[row.id]" :style="{ color: energyMap[row.id].total < 200 ? '#e6a23c' : undefined }">
            {{ energyMap[row.id].total }}
          </span>
          <span v-else style="color: #c0c4cc">—</span>
        </template>
      </el-table-column>
      <el-table-column :label="$t('admin.users.subscription')" width="120" align="center">
        <template #default="{ row }">
          <el-tag
            v-if="subscriptionMap[row.id]"
            :type="subscriptionMap[row.id].status === 'ACTIVE' ? 'success' : 'warning'"
            size="small"
          >
            {{ tierLabel(subscriptionMap[row.id].tier) }}
          </el-tag>
          <span v-else style="color: #c0c4cc; font-size: 12px">{{ $t('admin.users.free') }}</span>
        </template>
      </el-table-column>
      <el-table-column :label="$t('admin.users.lastLogin')" width="140">
        <template #default="{ row }">{{ row.lastLoginAt ? formatDate(row.lastLoginAt) : '—' }}</template>
      </el-table-column>
      <el-table-column :label="$t('admin.users.registeredAt')" width="140">
        <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column :label="$t('common.status')" width="90" align="center">
        <template #default="{ row }">
          <el-tag v-if="row.disabled" type="danger" size="small">{{ $t('admin.users.disabled') }}</el-tag>
          <el-tag v-else type="success" size="small">{{ $t('admin.users.active') }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="$t('common.actions')" width="120" align="center">
        <template #default="{ row }">
          <el-dropdown trigger="click">
            <el-button size="small">{{ $t('common.actions') }} <el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item @click="openEdit(row)">{{ $t('common.edit') }}</el-dropdown-item>
                <el-dropdown-item @click="openSubEdit(row)">{{ $t('admin.users.manageSubscription') }}</el-dropdown-item>
                <el-dropdown-item
                  :disabled="row.role === 'ADMIN'"
                  divided
                  @click="row.role !== 'ADMIN' && resetPassword(row)"
                >{{ $t('admin.users.resetPassword') }}</el-dropdown-item>
                <el-dropdown-item
                  :disabled="row.role === 'ADMIN'"
                  :class="row.disabled ? '' : 'danger-item'"
                  @click="row.role !== 'ADMIN' && toggleDisabled(row)"
                >{{ row.disabled ? $t('admin.users.active') : $t('admin.users.disabled') }}</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </template>
      </el-table-column>
    </el-table>

    <div class="pagination">
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[20, 50, 100]"
        layout="total, sizes, prev, pager, next"
        @change="loadUsers"
      />
    </div>

    <UserEditDialog
      v-if="editingUser"
      :user="editingUser"
      @close="editingUser = null"
      @saved="onSaved"
    />
    <SubscriptionEditDialog
      v-if="editingSubUser"
      :user="editingSubUser"
      @close="editingSubUser = null"
      @saved="loadUsers"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowDown } from '@element-plus/icons-vue'
import { listAdminUsers, adminGetUserSubscription, updateAdminUser, adminResetPassword, type AdminUser } from '@/api/admin'
import UserEditDialog from '@/components/admin/UserEditDialog.vue'
import SubscriptionEditDialog from '@/components/admin/SubscriptionEditDialog.vue'

const { t } = useI18n()

const loading = ref(false)
const users = ref<AdminUser[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const filterEmail = ref('')
const filterRole = ref('')
const filterEmailVerified = ref('')
const filterExportEnabled = ref('')
const filterCanEditBuiltinConfigs = ref('')
const filterWatermarkEnabled = ref('')
const editingUser = ref<AdminUser | null>(null)
const editingSubUser = ref<AdminUser | null>(null)
const subscriptionMap = ref<Record<string, { tier: string; status: string }>>({})
const energyMap = ref<Record<string, { total: number }>>({})

async function loadUsers() {
  loading.value = true
  try {
    const res = await listAdminUsers({
      page: page.value,
      pageSize: pageSize.value,
      search: filterEmail.value || undefined,
      role: filterRole.value || undefined,
      emailVerified: (filterEmailVerified.value as 'true' | 'false' | '') || undefined,
      exportEnabled: (filterExportEnabled.value as 'true' | 'false' | '') || undefined,
      canEditBuiltinConfigs: (filterCanEditBuiltinConfigs.value as 'true' | 'false' | '') || undefined,
      watermarkEnabled: (filterWatermarkEnabled.value as 'true' | 'false' | '') || undefined,
    })
    users.value = res.data
    total.value = res.total
    // Fetch subscription info for all users (best-effort, parallel)
    await Promise.allSettled(
      res.data.map(async (u) => {
        try {
          const detail = await adminGetUserSubscription(u.id)
          if (detail.subscription) {
            subscriptionMap.value[u.id] = { tier: detail.subscription.tier, status: detail.subscription.status }
          }
          if (detail.energyBalance) {
            energyMap.value[u.id] = { total: detail.energyBalance.monthlyRemaining + detail.energyBalance.purchasedRemaining }
          }
        } catch {/* ignore per-user errors */}
      })
    )
  } finally {
    loading.value = false
  }
}

function openEdit(user: AdminUser) {
  editingUser.value = user
}

function openSubEdit(user: AdminUser) {
  editingSubUser.value = user
}

function onSaved(updated: AdminUser) {
  const idx = users.value.findIndex((u) => u.id === updated.id)
  if (idx !== -1) users.value[idx] = updated
  editingUser.value = null
}

async function resetPassword(user: AdminUser) {
  await ElMessageBox.confirm(
    t('admin.users.resetPasswordConfirm', { email: user.email }),
    t('admin.users.resetPassword'),
    { type: 'warning', confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel') }
  )
  try {
    await adminResetPassword(user.id)
    ElMessage.success(t('admin.users.resetPasswordSuccess', { email: user.email }))
  } catch (err: unknown) {
    ElMessage.error((err as { message?: string })?.message ?? t('admin.users.resetPasswordError'))
  }
}

async function toggleDisabled(user: AdminUser) {
  const isEnabling = user.disabled
  const confirmMessage = isEnabling
    ? t('admin.users.toggleConfirmEnable', { email: user.email })
    : t('admin.users.toggleConfirmDisable', { email: user.email })
  await ElMessageBox.confirm(
    confirmMessage,
    isEnabling ? t('admin.users.active') : t('admin.users.disabled'),
    { type: isEnabling ? 'info' : 'warning', confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel') }
  )
  try {
    const updated = await updateAdminUser(user.id, { disabled: !user.disabled })
    const idx = users.value.findIndex((u) => u.id === user.id)
    if (idx !== -1) users.value[idx] = updated
    ElMessage.success(t('admin.users.toggleSuccess', { action: isEnabling ? t('admin.users.active') : t('admin.users.disabled') }))
  } catch (err: unknown) {
    ElMessage.error((err as { message?: string })?.message ?? t('admin.users.toggleError'))
  }
}

function roleLabel(role: string) {
  const key = `admin.users.roles.${role}`
  const translated = t(key)
  return translated === key ? role : translated
}

function tierLabel(tier: string) {
  const key = `subscription.tier.${tier}`
  const translated = t(key)
  return translated === key ? tier : translated
}

function roleTagType(role: string): 'danger' | 'warning' | 'info' {
  return { ADMIN: 'danger', SUBSCRIBED: 'warning', REGULAR: 'info' }[role] as 'danger' | 'warning' | 'info' ?? 'info'
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('zh-CN', { hour12: false })
}

onMounted(loadUsers)
</script>

<style scoped>
.user-management {
  padding: 24px;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.page-header h2 {
  margin: 0;
}

.filters {
  display: flex;
  gap: 12px;
}

.pagination {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}

:deep(.danger-item) {
  color: var(--el-color-danger);
}

:deep(.danger-item:hover) {
  background-color: var(--el-color-danger-light-9);
  color: var(--el-color-danger);
}
</style>
