<template>
  <div v-loading="loading" class="page-shell">
    <div class="page-header">
      <div class="page-title-group">
        <el-breadcrumb>
          <el-breadcrumb-item :to="{ path: '/admin/dictionaries' }">{{ $t('admin.dictionaryList.title') }}</el-breadcrumb-item>
          <el-breadcrumb-item v-if="version?.dictionary" :to="`/admin/dictionaries/${version?.dictionary?.id}`">
            {{ version?.dictionary?.name }}
          </el-breadcrumb-item>
          <el-breadcrumb-item>{{ version?.label }}</el-breadcrumb-item>
        </el-breadcrumb>
        <h2 class="page-title">{{ version?.label }}</h2>
        <p v-if="version?.publishedYear" class="page-subtitle">{{ $t('admin.dictionaryDetail.publishedYear') }}：{{ version.publishedYear }}</p>
      </div>
    </div>

    <el-row :gutter="16">
      <!-- FormatConfig section -->
      <el-col :span="12">
        <el-card>
          <template #header>
            <div class="card-header">
              <div class="card-header-left">
                <span>{{ $t('admin.versionDetail.formatConfig') }}</span>
                <span v-if="version?.formatConfig" class="active-config-name">
                  {{ version.formatConfig.name }}
                </span>
              </div>
              <div class="card-header-right">
                <el-tag
                  v-if="version?.formatConfig"
                  :type="configStatusType(version?.formatConfig?.validationStatus)"
                >
                  {{ version?.formatConfig?.validationStatus }}
                </el-tag>
                <el-tag v-else type="info">{{ $t('admin.versionDetail.notConfigured') }}</el-tag>
              </div>
            </div>
          </template>

          <!-- Grouped config selector -->
          <div class="config-selector">
            <el-select
              v-model="selectedConfigKey"
              :placeholder="$t('admin.versionDetail.configPlaceholder')"
              style="flex: 1"
              clearable
              @change="handleConfigProfileChange"
            >
              <el-option-group :label="$t('admin.versionDetail.systemConfig')">
                <el-option
                  v-for="c in configsStore.systemConfigs"
                  :key="`system:${c.id}`"
                  :label="c.name"
                  :value="`system:${c.id}`"
                >
                  <span>{{ c.name }}</span>
                  <el-tag size="small" :type="configStatusType(c.validationStatus)" style="margin-left: 8px">
                    {{ c.validationStatus }}
                  </el-tag>
                </el-option>
              </el-option-group>
              <el-option-group :label="$t('admin.versionDetail.userConfig')">
                <el-option
                  v-for="c in configsStore.userConfigs"
                  :key="`user:${c.id}`"
                  :label="c.name"
                  :value="`user:${c.id}`"
                >
                  <span>{{ c.name }}</span>
                  <el-tag size="small" :type="configStatusType(c.validationStatus)" style="margin-left: 8px">
                    {{ c.validationStatus }}
                  </el-tag>
                </el-option>
              </el-option-group>
            </el-select>
            <el-select
              v-model="selectedConfigVersionId"
              style="width: 180px"
              :placeholder="$t('admin.versionDetail.configVersionPlaceholder')"
              :disabled="!selectedConfigKey || availableConfigVersions.length === 0"
              clearable
            >
              <el-option
                v-for="versionOption in availableConfigVersions"
                :key="versionOption.id"
                :label="`v${versionOption.versionNumber}${versionOption.isCurrent ? ' (current)' : ''}`"
                :value="versionOption.id"
              >
                <div class="config-version-option">
                  <span>{{ `v${versionOption.versionNumber}` }}</span>
                  <el-tag v-if="versionOption.isCurrent" size="small" type="success">current</el-tag>
                </div>
              </el-option>
            </el-select>
            <el-button
              type="primary"
              :disabled="!selectedConfigKey"
              :loading="applyingConfig"
              @click="handleApplyConfig"
            >
              {{ $t('admin.versionDetail.apply') }}
            </el-button>
          </div>
          <div class="config-help-tip">
            <el-text type="info" size="small">
              <el-link type="primary" size="small" @click="$router.push('/admin/configs')">{{ $t('admin.versionDetail.manageConfigs') }}</el-link>
              · {{ $t('admin.versionDetail.contactAdmin') }}
            </el-text>
          </div>
          <el-divider style="margin: 12px 0" />

          <ConfigUpload :version-id="route.params.versionId as string" @uploaded="handleConfigUploaded" />
        </el-card>
      </el-col>

      <!-- File section -->
      <el-col :span="12">
        <el-card>
          <template #header>
            <div class="card-header">
              {{ $t('admin.versionDetail.dictionaryFile') }}
              <el-tag v-if="version?.formatConfig?.validationStatus !== 'VALID'" type="warning">
                {{ $t('admin.versionDetail.needValidConfig') }}
              </el-tag>
            </div>
          </template>

          <!-- Uploaded file info + reparse -->
          <div v-if="activeFile" class="uploaded-file-info">
            <div class="file-row">
              <el-icon class="file-icon"><Document /></el-icon>
              <span class="file-name">{{ activeFile.originalFileName }}</span>
              <el-tag size="small" type="info">{{ activeFile.sharedFileAsset.fileType }}</el-tag>
              <el-tag v-if="activeTask" size="small" :type="taskStatusType(activeTask.status)">{{ activeTask.status }}</el-tag>
              <el-tag size="small" :type="activeFileTagType">{{ activeFileTagLabel }}</el-tag>
              <ActionButton
                kind="admin"
                :icon="Download"
                :label="$t('admin.versionDetail.downloadOriginal')"
                :href="downloadUrl"
                target="_blank"
                tag="a"
              />
            </div>
            <div class="file-meta">
              {{ $t('admin.versionDetail.uploadedAt') }} {{ formatDate(activeFile.createdAt) }}
              <span>· {{ $t('admin.versionDetail.fileSize') }} {{ formatFileSize(activeFile.sharedFileAsset.fileSize) }}</span>
              <span v-if="activeTask?.totalEntries">· {{ activeTask.totalEntries.toLocaleString() }} {{ $t('admin.versionDetail.entryCount') }}</span>
            </div>
            <div v-if="activeTask?.cacheHit" class="file-meta">
              {{ $t('upload.cacheHitResult') }}
            </div>
            <div class="reparse-row">
              <div class="table-actions is-admin">
                <ActionButton kind="admin" type="primary" :icon="RefreshRight" :label="$t('admin.versionDetail.reparse')" :loading="reparsing" @click="handleReparse" />
                <ActionButton
                  v-if="activeTask?.status === 'COMPLETED'"
                  kind="admin"
                  type="info"
                  :icon="View"
                  :label="$t('admin.versionDetail.parseDebugPreview')"
                  @click="$router.push(`/admin/versions/${route.params.versionId}/parse-debug`)"
                />
                <ActionButton kind="admin" type="danger" :icon="Delete" :label="$t('admin.versionDetail.deleteFile')" :loading="deletingFile" @click="handleDeleteFile" />
              </div>
            </div>
            <el-divider style="margin: 12px 0" />
            <el-alert
              v-if="activeTask?.status === 'COMPLETED'"
              type="warning"
              show-icon
              :closable="false"
              style="margin-bottom: 10px"
            >
              <template #title>
                {{ $t('admin.versionDetail.reuploadConsumesEnergy') }}
              </template>
              <template #default>
                {{ $t('admin.versionDetail.reuploadWarning') }}
              </template>
            </el-alert>
            <div class="upload-replace-hint">{{ $t('admin.versionDetail.reuploadReplaceHint') }}</div>
          </div>

          <el-alert
            v-else-if="hasDetachedFileHistory"
            type="info"
            show-icon
            :closable="false"
            style="margin-bottom: 12px"
          >
            <template #title>
              {{ $t('admin.versionDetail.detachedFileTitle') }}
            </template>
            <template #default>
              {{ $t('admin.versionDetail.detachedFileDescription') }}
            </template>
          </el-alert>

          <FileUploadWithProgress
            ref="fileUploadRef"
            :version-id="route.params.versionId as string"
            @task-created="handleTaskCreated"
          />
        </el-card>
      </el-col>
    </el-row>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import {
  getVersion,
  reparseVersion,
  deleteVersionFile,
  versionFileDownloadUrl,
  type VersionActiveFile,
} from '@/api/dictionaries'
import { getParseTask } from '@/api/parse-tasks'
import { ElMessageBox, ElMessage } from 'element-plus'
import { Document, Download, Delete, RefreshRight, View } from '@element-plus/icons-vue'
import ConfigUpload from '@/components/admin/ConfigUpload.vue'
import FileUploadWithProgress from '@/components/upload/FileUploadWithProgress.vue'
import { useConfigsStore } from '@/stores/configs'
import type { ParseTask } from '@/api/parse-tasks'
import type { ConfigVersionRecord } from '@/api/configs'
import { useI18n } from 'vue-i18n'
import ActionButton from '@/components/common/ActionButton.vue'

const route = useRoute()
const { t } = useI18n()
const loading = ref(false)
const reparsing = ref(false)
const deletingFile = ref(false)
const applyingConfig = ref(false)
const version = ref<Awaited<ReturnType<typeof getVersion>> | null>(null)
const activeFile = ref<VersionActiveFile | null>(null)
const activeTask = ref<ParseTask | null>(null)
const fileUploadRef = ref<InstanceType<typeof FileUploadWithProgress> | null>(null)

const configsStore = useConfigsStore()
const selectedConfigKey = ref<string | null>(null)
const selectedConfigVersionId = ref<string | null>(null)

const downloadUrl = computed(() => versionFileDownloadUrl(route.params.versionId as string))
const hasDetachedFileHistory = computed(() => !activeFile.value && (version.value?.parseTasks?.length ?? 0) > 0)
const activeFileTagType = computed(() => (activeTask.value ? 'success' : 'info'))
const activeFileTagLabel = computed(() => (
  activeTask.value
    ? t('admin.versionDetail.activeSharedFile')
    : t('admin.versionDetail.sharedFileOnly')
))
const availableConfigVersions = computed<ConfigVersionRecord[]>(() => {
  if (!selectedConfigKey.value) return []
  const [sourceType, profileId] = selectedConfigKey.value.split(':') as ['system' | 'user', string]
  return configsStore.getCachedConfigVersions(sourceType === 'system' ? 'SYSTEM' : 'USER', profileId)
})

onMounted(async () => {
  loading.value = true
  const [v] = await Promise.all([
    getVersion(route.params.versionId as string),
    configsStore.loadSystemConfigs(),
    configsStore.loadUserConfigs(),
  ])
  version.value = v
  activeFile.value = version.value?.activeFile ?? null
  activeTask.value = activeFile.value?.latestTask?.id
    ? await getParseTask(activeFile.value.latestTask.id)
    : null
  await syncSelectedConfigFromVersion()
  loading.value = false
  // Resume progress tracking if the task is still in-flight
  const status = activeTask.value?.status
  if (status === 'RUNNING' || status === 'PENDING') {
    await nextTick()
    fileUploadRef.value?.trackTask(activeTask.value!.id)
  }
})

async function syncSelectedConfigFromVersion() {
  const appliedConfig = version.value?.formatConfig as {
    sourceConfigType?: 'SYSTEM' | 'USER' | null
    sourceConfigId?: string | null
    configProfileId?: string | null
    configVersionId?: string | null
  } | null | undefined

  const sourceType = appliedConfig?.sourceConfigType
  const profileId = appliedConfig?.configProfileId ?? appliedConfig?.sourceConfigId ?? null
  if (!sourceType || !profileId) {
    selectedConfigKey.value = null
    selectedConfigVersionId.value = null
    return
  }

  selectedConfigKey.value = `${sourceType.toLowerCase()}:${profileId}`
  await configsStore.loadConfigVersions(sourceType, profileId)
  selectedConfigVersionId.value = appliedConfig?.configVersionId ?? null
}

async function handleConfigProfileChange() {
  selectedConfigVersionId.value = null
  if (!selectedConfigKey.value) return

  const [sourceType, profileId] = selectedConfigKey.value.split(':') as ['system' | 'user', string]
  const versions = await configsStore.loadConfigVersions(sourceType === 'system' ? 'SYSTEM' : 'USER', profileId)
  const current = versions.find((item) => item.isCurrent) ?? versions[0] ?? null
  selectedConfigVersionId.value = current?.id ?? null
}

function configStatusType(status?: string) {
  if (status === 'VALID') return 'success'
  if (status === 'INVALID') return 'danger'
  return 'info'
}

function taskStatusType(status?: string) {
  if (status === 'COMPLETED') return 'success'
  if (status === 'FAILED') return 'danger'
  if (status === 'RUNNING') return 'warning'
  return 'info'
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('zh-CN', { dateStyle: 'short', timeStyle: 'short' })
}

function formatFileSize(size: string | number) {
  const numericSize = typeof size === 'string' ? Number(size) : size
  if (!Number.isFinite(numericSize)) return '--'
  if (numericSize < 1024) return `${numericSize} B`
  if (numericSize < 1024 * 1024) return `${(numericSize / 1024).toFixed(1)} KB`
  return `${(numericSize / (1024 * 1024)).toFixed(1)} MB`
}

async function handleApplyConfig() {
  if (!selectedConfigKey.value) return
  const [sourceType, sourceId] = selectedConfigKey.value.split(':') as ['system' | 'user', string]
  applyingConfig.value = true
  try {
    await configsStore.applyConfig(
      route.params.versionId as string,
      {
        sourceType: sourceType === 'system' ? 'SYSTEM' : 'USER',
        sourceId,
        configVersionId: selectedConfigVersionId.value ?? undefined,
      }
    )
    version.value = await getVersion(route.params.versionId as string)
    activeFile.value = version.value.activeFile
    activeTask.value = activeFile.value?.latestTask?.id ? await getParseTask(activeFile.value.latestTask.id) : null
    await syncSelectedConfigFromVersion()
    ElMessage.success(t('admin.versionDetail.applySuccess'))
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : t('admin.versionDetail.applyError')
    ElMessage.error(msg)
  } finally {
    applyingConfig.value = false
  }
}

async function handleConfigUploaded(_status: 'VALID' | 'INVALID') {
  version.value = await getVersion(route.params.versionId as string)
  activeFile.value = version.value.activeFile
  activeTask.value = activeFile.value?.latestTask?.id ? await getParseTask(activeFile.value.latestTask.id) : null
}

async function handleTaskCreated(taskId: string) {
  activeTask.value = await getParseTask(taskId)
  version.value = await getVersion(route.params.versionId as string)
  activeFile.value = version.value.activeFile
}

async function handleReparse() {
  try {
    await ElMessageBox.confirm(
      t('admin.versionDetail.reparseConfirmMessage'),
      t('admin.versionDetail.reparseConfirmTitle'),
      { type: 'warning', confirmButtonText: t('admin.versionDetail.reparseConfirmButton'), cancelButtonText: t('common.cancel') }
    )
  } catch {
    return
  }
  reparsing.value = true
  try {
    const newTask = await reparseVersion(route.params.versionId as string)
    // Hand the new task ID to the file upload component so progress is shown there
    fileUploadRef.value?.trackTask(newTask.id)
    activeTask.value = await getParseTask(newTask.id)
    version.value = await getVersion(route.params.versionId as string)
    activeFile.value = version.value.activeFile
    ElMessage.success(t('admin.versionDetail.reparseSuccess'))
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : t('admin.versionDetail.reparseError')
    ElMessage.error(msg)
  } finally {
    reparsing.value = false
  }
}

async function handleDeleteFile() {
  try {
    await ElMessageBox.confirm(
      t('admin.versionDetail.deleteFileConfirmMessage'),
      t('admin.versionDetail.deleteFileConfirmTitle'),
      { type: 'warning', confirmButtonText: t('admin.versionDetail.deleteFileConfirmButton'), cancelButtonText: t('common.cancel') }
    )
  } catch {
    return
  }
  deletingFile.value = true
  try {
    await deleteVersionFile(route.params.versionId as string)
    version.value = await getVersion(route.params.versionId as string)
    activeFile.value = null
    activeTask.value = null
    ElMessage.success(t('admin.versionDetail.deleteFileSuccess'))
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : t('admin.versionDetail.deleteFileError')
    ElMessage.error(msg)
  } finally {
    deletingFile.value = false
  }
}

</script>

<style scoped>
.page-header { margin-bottom: 16px; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.card-header-left { display: flex; flex-direction: column; gap: 2px; }
.active-config-name {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-weight: normal;
}
.card-header-right { display: flex; align-items: center; gap: 8px; }

.config-help-tip {
  margin-top: 8px;
}
.config-selector {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.config-version-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.uploaded-file-info {
  margin-bottom: 4px;
}
.file-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.file-icon {
  color: var(--el-color-primary);
  font-size: 18px;
  flex-shrink: 0;
}
.file-name {
  font-weight: 500;
  word-break: break-all;
}
.file-meta {
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.reparse-row {
  margin-top: 10px;
}
.upload-replace-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 8px;
}
</style>
