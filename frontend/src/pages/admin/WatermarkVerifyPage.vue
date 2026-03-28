<template>
  <div class="watermark-verify">
    <div class="page-header">
      <h2>{{ $t('admin.watermark.pageTitle') }}</h2>
    </div>

    <el-card style="margin-bottom: 20px">
      <template #header>
        <span>{{ $t('admin.watermark.inputLabel') }}</span>
      </template>
      <p style="font-size: 13px; color: var(--el-text-color-secondary); margin: 0 0 12px">
        {{ $t('admin.watermark.inputHint') }}
      </p>
      <el-input
        v-model="inputText"
        type="textarea"
        :rows="4"
        :placeholder="$t('admin.watermark.inputPlaceholder')"
        style="font-family: monospace; margin-bottom: 12px"
      />
      <el-button type="primary" :loading="loading" @click="lookup">{{ $t('admin.watermark.identifyUser') }}</el-button>
      <el-button @click="clear">{{ $t('admin.watermark.clear') }}</el-button>
    </el-card>

    <el-card v-if="searched">
      <template #header>
        <span>{{ $t('admin.watermark.resultTitle') }}</span>
      </template>

      <el-empty v-if="results.length === 0" :description="$t('admin.watermark.noMatch')" />

      <el-table v-else :data="results" stripe>
        <el-table-column :label="$t('admin.watermark.email')" prop="email" min-width="200" />
        <el-table-column :label="$t('admin.watermark.userId')" prop="id" min-width="300" />
        <el-table-column :label="$t('admin.watermark.role')" width="110">
          <template #default="{ row }">
            <el-tag :type="roleTagType(row.role)" size="small">{{ roleLabel(row.role) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="$t('admin.watermark.emailVerified')" width="100" align="center">
          <template #default="{ row }">
            <el-icon v-if="row.emailVerified" color="#67c23a"><Check /></el-icon>
            <el-icon v-else color="#e6a23c"><Warning /></el-icon>
          </template>
        </el-table-column>
        <el-table-column :label="$t('admin.watermark.watermarkEnabled')" width="70" align="center">
          <template #default="{ row }">
            <el-icon v-if="row.watermarkEnabled" color="#67c23a"><Check /></el-icon>
            <span v-else style="color: #c0c4cc">—</span>
          </template>
        </el-table-column>
        <el-table-column :label="$t('admin.watermark.registeredAt')" width="160">
          <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-card style="margin-top: 20px">
      <template #header>
        <span>{{ $t('admin.watermark.formatTitle') }}</span>
      </template>
      <el-descriptions :column="1" border>
        <el-descriptions-item :label="$t('admin.watermark.formatStructure')">
          <code>{{ $t('admin.watermark.formatStructureValue') }}</code>
        </el-descriptions-item>
        <el-descriptions-item :label="$t('admin.watermark.formatExample')">
          <code>user@example.com | a1b2c3d4 | 2026-03</code>
        </el-descriptions-item>
        <el-descriptions-item :label="$t('admin.watermark.formatLogic')">
          {{ $t('admin.watermark.formatLogicDesc') }}
        </el-descriptions-item>
      </el-descriptions>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Check, Warning } from '@element-plus/icons-vue'
import { lookupWatermark, type AdminUser } from '@/api/admin'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const inputText = ref('')
const loading = ref(false)
const searched = ref(false)
const results = ref<AdminUser[]>([])

async function lookup() {
  if (!inputText.value.trim()) {
    ElMessage.warning(t('admin.watermark.inputRequired'))
    return
  }
  loading.value = true
  searched.value = false
  try {
    const res = await lookupWatermark(inputText.value)
    results.value = res.users
    searched.value = true
  } catch (err: unknown) {
    ElMessage.error((err as { message?: string })?.message ?? t('admin.watermark.identifyError'))
  } finally {
    loading.value = false
  }
}

function clear() {
  inputText.value = ''
  results.value = []
  searched.value = false
}

function roleLabel(role: string) {
  return t(`admin.watermark.roleLabels.${role}`) ?? role
}

function roleTagType(role: string): 'danger' | 'warning' | 'info' {
  return ({ ADMIN: 'danger', SUBSCRIBED: 'warning', REGULAR: 'info' } as Record<string, 'danger' | 'warning' | 'info'>)[role] ?? 'info'
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('zh-CN', { hour12: false })
}
</script>

<style scoped>
.watermark-verify {
  padding: 24px;
}
.page-header {
  margin-bottom: 20px;
}
.page-header h2 {
  margin: 0;
}
</style>
