<template>
  <div>
    <div class="page-header">
      <h2>{{ $t('comparisons.title') }}</h2>
      <el-button type="primary" :icon="Plus" @click="newCompDialogVisible = true">{{ $t('comparisons.newComparison') }}</el-button>
    </div>

    <!-- History table -->
    <el-card>
      <el-table
        :data="comparisonsStore.comparisons"
        v-loading="comparisonsStore.comparisonsLoading"
        stripe
        :empty-text="$t('comparisons.empty')"
      >
        <el-table-column :label="$t('common.name') + ' A'" min-width="130">
          <template #default="{ row }">{{ row.versionA.dictionary.name }}</template>
        </el-table-column>
        <el-table-column :label="$t('comparisons.versionA')" width="100">
          <template #default="{ row }">{{ row.versionA.label }}</template>
        </el-table-column>
        <el-table-column :label="$t('common.name') + ' B'" min-width="130">
          <template #default="{ row }">{{ row.versionB.dictionary.name }}</template>
        </el-table-column>
        <el-table-column :label="$t('comparisons.versionB')" width="100">
          <template #default="{ row }">{{ row.versionB.label }}</template>
        </el-table-column>
        <el-table-column :label="$t('comparisons.status')" width="110">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="$t('comparisons.stats')" width="185">
          <template #default="{ row }">
            <span v-if="row.status === 'COMPLETED'">
              {{ row.matched ?? 0 }} / {{ row.addedInB ?? 0 }} / {{ row.deletedFromA ?? 0 }}
            </span>
            <span v-else class="text-muted">—</span>
          </template>
        </el-table-column>
        <el-table-column :label="$t('comparisons.createdAt')" width="160">
          <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column :label="$t('comparisons.actions')" width="100" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="primary" link @click="$router.push(`/comparisons/${row.id}`)">
              {{ $t('comparisons.view') }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- New comparison dialog -->
    <el-dialog v-model="newCompDialogVisible" :title="$t('comparisons.newComparison')" width="480px" :close-on-click-modal="false">
      <el-form label-width="120px">
        <el-form-item :label="$t('comparisons.versionA')">
          <el-select v-model="versionAId" :placeholder="$t('comparisons.selectVersionA')" filterable style="width: 100%">
            <el-option-group
              v-for="dict in allDictionaries"
              :key="dict.id"
              :label="dict.name"
            >
              <el-option
                v-for="v in dict.versions"
                :key="v.id"
                :label="`${dict.name} — ${v.label}`"
                :value="v.id"
              />
            </el-option-group>
          </el-select>
        </el-form-item>
        <el-form-item :label="$t('comparisons.versionB')">
          <el-select v-model="versionBId" :placeholder="$t('comparisons.selectVersionB')" filterable style="width: 100%">
            <el-option-group
              v-for="dict in allDictionaries"
              :key="dict.id"
              :label="dict.name"
            >
              <el-option
                v-for="v in dict.versions"
                :key="v.id"
                :label="`${dict.name} — ${v.label}`"
                :value="v.id"
              />
            </el-option-group>
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="newCompDialogVisible = false; versionAId = ''; versionBId = ''">{{ $t('comparisons.cancel') }}</el-button>
        <el-button
          type="primary"
          :loading="comparing"
          :disabled="!versionAId || !versionBId"
          @click="handleCompare"
        >
          {{ $t('comparisons.startCompare') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useComparisonsStore } from '@/stores/comparisons'
import { getDictionaries, getVersions, type Dictionary, type DictionaryVersion } from '@/api/dictionaries'
import { ElMessage } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'

const router = useRouter()
const comparisonsStore = useComparisonsStore()
const { t } = useI18n()

const versionAId = ref('')
const versionBId = ref('')
const comparing = ref(false)
const newCompDialogVisible = ref(false)
const allDictionaries = ref<(Dictionary & { versions: DictionaryVersion[] })[]>([])

onMounted(async () => {
  await loadComparisons()
  const result = await getDictionaries(undefined, 100)
  allDictionaries.value = await Promise.all(
    result.items.map(async (d) => {
      const versions = await getVersions(d.id)
      return { ...d, versions }
    })
  )
})

async function loadComparisons() {
  await comparisonsStore.listAllComparisons()
}

async function handleCompare() {
  comparing.value = true
  try {
    const comp = await comparisonsStore.createNewComparison(versionAId.value, versionBId.value)
    ElMessage.success(t('comparisons.compareSuccess'))
    newCompDialogVisible.value = false
    versionAId.value = ''
    versionBId.value = ''
    await loadComparisons()
    router.push(`/comparisons/${comp.id}`)
  } catch {
    ElMessage.error(t('comparisons.compareError'))
  } finally {
    comparing.value = false
  }
}

function statusTagType(status: string) {
  if (status === 'COMPLETED') return 'success'
  if (status === 'FAILED') return 'danger'
  if (status === 'RUNNING') return 'warning'
  return 'info'
}

function statusLabel(status: string) {
  return t(`comparisons.statusLabels.${status}`) ?? status
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('zh-CN', { dateStyle: 'short', timeStyle: 'short' })
}
</script>

<style scoped>
.text-muted { color: var(--el-text-color-secondary); }
</style>
