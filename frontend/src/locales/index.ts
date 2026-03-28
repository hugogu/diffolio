import { createI18n } from 'vue-i18n'
import zhCN from './zh-CN.json'
import en from './en.json'

// Type definition based on Chinese locale
export type MessageSchema = typeof zhCN

// Available locales configuration
export const availableLocales = [
  { code: 'zh-CN', name: '简体中文', flag: '🇨🇳' },
  { code: 'en', name: 'English', flag: '🇺🇸' }
] as const

export type LocaleCode = typeof availableLocales[number]['code']

// Get initial locale from localStorage or default to zh-CN
function getInitialLocale(): LocaleCode {
  const saved = localStorage.getItem('locale') as LocaleCode | null
  if (saved && availableLocales.some(l => l.code === saved)) {
    return saved
  }
  
  // Detect browser language
  const browserLang = navigator.language
  if (browserLang.startsWith('zh')) {
    return 'zh-CN'
  }
  // Default to English for non-Chinese browsers
  return 'en'
}

export const i18n = createI18n<[MessageSchema], 'zh-CN' | 'en'>({
  legacy: false, // Use Composition API
  locale: getInitialLocale(),
  fallbackLocale: 'zh-CN',
  messages: {
    'zh-CN': zhCN,
    'en': en
  }
})

export default i18n
