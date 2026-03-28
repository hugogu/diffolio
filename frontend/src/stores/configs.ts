import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  listSystemConfigs,
  listUserConfigs,
  createUserConfig,
  updateUserConfig,
  deleteUserConfig,
  applyConfigToVersion,
  cloneSystemConfig,
  type SystemConfig,
  type UserConfig,
  type UserConfigDetail,
} from '@/api/configs'

export const useConfigsStore = defineStore('configs', () => {
  const systemConfigs = ref<SystemConfig[]>([])
  const userConfigs = ref<UserConfig[]>([])
  const selectedConfig = ref<UserConfigDetail | null>(null)

  async function loadSystemConfigs(search?: string) {
    systemConfigs.value = await listSystemConfigs(search)
  }

  async function loadUserConfigs(search?: string) {
    userConfigs.value = await listUserConfigs(search)
  }

  async function applyConfig(versionId: string, sourceType: 'SYSTEM' | 'USER', sourceId: string) {
    return applyConfigToVersion(versionId, sourceType, sourceId)
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
    loadSystemConfigs,
    loadUserConfigs,
    applyConfig,
    createConfig,
    updateConfig,
    deleteConfig,
    cloneConfig,
  }
})
