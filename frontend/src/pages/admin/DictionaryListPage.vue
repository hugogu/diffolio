<template>
  <div>
    <div class="page-header">
      <h2>{{ $t('admin.dictionaryList.title') }}</h2>
      <el-button type="primary" :icon="Plus" @click="dialogVisible = true">{{ $t('admin.dictionaryList.newDictionary') }}</el-button>
    </div>

    <el-card>
      <el-table :data="store.dictionaries" v-loading="loading" stripe>
        <el-table-column prop="name" :label="$t('admin.dictionaryList.name')" min-width="180">
          <template #default="{ row }">
            <RouterLink :to="`/admin/dictionaries/${row.id}`" class="link">{{ row.name }}</RouterLink>
          </template>
        </el-table-column>
        <el-table-column prop="publisher" :label="$t('admin.dictionaryList.publisher')" min-width="150" />
        <el-table-column prop="language" :label="$t('admin.dictionaryList.language')" width="100" />
        <el-table-column prop="versionCount" :label="$t('admin.dictionaryList.versionCount')" width="100" align="center" />
        <el-table-column :label="$t('common.createdAt')" width="160">
          <template #default="{ row }">
            {{ new Date(row.createdAt).toLocaleDateString('zh-CN') }}
          </template>
        </el-table-column>
        <el-table-column :label="$t('comparisons.actions')" width="120" fixed="right">
          <template #default="{ row }">
            <el-button text size="small" @click="router.push(`/admin/dictionaries/${row.id}`)">
              {{ $t('admin.dictionaryList.view') }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <div v-if="store.hasMore" class="load-more">
        <el-button :loading="loadingMore" @click="loadMore">{{ $t('common.loadMore') }}</el-button>
      </div>
    </el-card>

    <!-- Create dialog -->
    <el-dialog v-model="dialogVisible" :title="$t('admin.dictionaryList.createTitle')" width="500px" @close="resetForm">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="140px">
        <el-form-item :label="$t('admin.dictionaryList.name')" prop="name">
          <el-input v-model="form.name" :placeholder="$t('admin.dictionaryList.name')" />
        </el-form-item>
        <el-form-item :label="$t('admin.dictionaryList.publisher')">
          <el-input v-model="form.publisher" :placeholder="$t('admin.dictionaryList.publisherPlaceholder')" />
        </el-form-item>
        <el-form-item :label="$t('admin.dictionaryList.language')" prop="language">
          <el-select v-model="form.language" style="width: 100%">
            <el-option :label="$t('admin.dictionaryList.languages.zh')" value="zh" />
            <el-option :label="$t('admin.dictionaryList.languages.en')" value="en" />
            <el-option :label="$t('admin.dictionaryList.languages.ja')" value="ja" />
          </el-select>
        </el-form-item>
        <el-form-item :label="$t('common.description')">
          <el-input v-model="form.description" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">{{ $t('admin.dictionaryList.cancel') }}</el-button>
        <el-button type="primary" :loading="submitting" @click="handleCreate">{{ $t('admin.dictionaryList.create') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useDictionariesStore } from '@/stores/dictionaries'
import { Plus } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { useI18n } from 'vue-i18n'

const router = useRouter()
const store = useDictionariesStore()
const { t } = useI18n()

const loading = ref(false)
const loadingMore = ref(false)
const dialogVisible = ref(false)
const submitting = ref(false)
const formRef = ref<FormInstance>()

const form = reactive({
  name: '',
  publisher: '',
  language: 'zh',
  description: '',
})

const rules: FormRules = {
  name: [{ required: true, message: t('admin.dictionaryList.validation.nameRequired') }],
}

onMounted(async () => {
  loading.value = true
  await store.fetchDictionaries()
  loading.value = false
})

async function loadMore() {
  loadingMore.value = true
  await store.fetchDictionaries(store.nextCursor ?? undefined)
  loadingMore.value = false
}

function resetForm() {
  form.name = ''
  form.publisher = ''
  form.language = 'zh'
  form.description = ''
}

async function handleCreate() {
  if (!formRef.value) return
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  submitting.value = true
  try {
    await store.addDictionary({ ...form })
    ElMessage.success(t('admin.dictionaryList.createSuccess'))
    dialogVisible.value = false
    resetForm()
  } catch (err) {
    ElMessage.error(t('admin.dictionaryList.createError'))
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.link {
  color: var(--color-primary);
  text-decoration: none;
}

.load-more {
  text-align: center;
  padding: 16px;
}
</style>
