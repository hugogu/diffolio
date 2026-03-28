import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useSettingsStore = defineStore('settings', () => {
  const darkMode = ref(localStorage.getItem('theme') === 'dark')

  function toggleDark() {
    darkMode.value = !darkMode.value
    localStorage.setItem('theme', darkMode.value ? 'dark' : 'light')
  }

  function setDark(val: boolean) {
    darkMode.value = val
    localStorage.setItem('theme', val ? 'dark' : 'light')
  }

  return { darkMode, toggleDark, setDark }
})
