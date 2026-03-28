import { defineStore } from 'pinia'
import { ref } from 'vue'
import { login as apiLogin, logout as apiLogout, getMe, type UserInfo } from '@/api/auth'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<UserInfo | null>(null)
  const isAuthenticated = ref(false)

  async function fetchMe() {
    try {
      const me = await getMe()
      user.value = me
      isAuthenticated.value = true
    } catch {
      user.value = null
      isAuthenticated.value = false
      throw new Error('Not authenticated')
    }
  }

  async function login(email: string, password: string) {
    const me = await apiLogin(email, password)
    user.value = me
    isAuthenticated.value = true
  }

  async function logout() {
    try {
      await apiLogout()
    } finally {
      user.value = null
      isAuthenticated.value = false
    }
  }

  return { user, isAuthenticated, fetchMe, login, logout }
})
