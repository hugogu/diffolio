import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  listSystemConfigs,
  listUserConfigs,
  createUserConfig,
  updateUserConfig,
  deleteUserConfig,
  createUserConfigVersion,
  applyConfigToVersion,
  cloneSystemConfig,
  listSystemConfigVersions,
  listUserConfigVersions,
  type SystemConfig,
  type UserConfig,
  type UserConfigDetail,
  type ConfigVersionRecord,
} from '@/api/configs'

export const useConfigsStore = defineStore('configs', () => {
  const systemConfigs = ref<SystemConfig[]>([])
  const userConfigs = ref<UserConfig[]>([])
  const selectedConfig = ref<UserConfigDetail | null>(null)
  const configVersions = ref<Record<string, ConfigVersionRecord[]>>({})

  async function loadSystemConfigs(search?: string) {
    systemConfigs.value = await listSystemConfigs(search)
  }

  async function loadUserConfigs(search?: string) {
    userConfigs.value = await listUserConfigs(search)
  }

  async function loadConfigVersions(sourceType: 'SYSTEM' | 'USER', profileId: string) {
    const response = sourceType === 'SYSTEM'
      ? await listSystemConfigVersions(profileId)
      : await listUserConfigVersions(profileId)
    configVersions.value[`${sourceType}:${profileId}`] = response.data
    return response.data
  }

  function getCachedConfigVersions(sourceType: 'SYSTEM' | 'USER', profileId: string) {
    return configVersions.value[`${sourceType}:${profileId}`] ?? []
  }

  async function applyConfig(
    versionId: string,
    payload: { sourceType?: 'SYSTEM' | 'USER'; sourceId?: string; configVersionId?: string }
  ) {
    return applyConfigToVersion(versionId, payload)
  }

  async function createConfig(payload: Parameters<typeof createUserConfig>[0]) {
    const config = await createUserConfig(payload)
    await loadUserConfigs()
    return config
  }

  async function updateConfig(id: string, payload: Parameters<typeof updateUserConfig>[1]) {
    const config = await updateUserConfig(id, payload)
    await loadUserConfigs()
    return config
  }

  async function saveConfigAsVersion(id: string, payload: Parameters<typeof createUserConfigVersion>[1]) {
    const result = await createUserConfigVersion(id, payload)
    await Promise.all([
      loadUserConfigs(),
      loadConfigVersions('USER', id),
    ])
    return result
  }

  async function deleteConfig(id: string) {
    await deleteUserConfig(id)
    await loadUserConfigs()
  }

  async function cloneConfig(id: string, nameOverride?: string) {
    const config = await cloneSystemConfig(id, nameOverride)
    await loadUserConfigs()
    return config
  }

  return {
    systemConfigs,
    userConfigs,
    selectedConfig,
    configVersions,
    loadSystemConfigs,
    loadUserConfigs,
    loadConfigVersions,
    getCachedConfigVersions,
    applyConfig,
    createConfig,
    updateConfig,
    saveConfigAsVersion,
    deleteConfig,
    cloneConfig,
  }
})
