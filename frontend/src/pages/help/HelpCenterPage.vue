<template>
  <div class="help-center-container">
    <!-- Left Sidebar -->
    <div class="help-sidebar">
      <div class="help-sidebar-header">
        <h3>{{ $t('help.title') }}</h3>
        <router-link to="/" class="back-link">
          <span>{{ $t('help.backToHome') }}</span>
          <el-icon><ArrowRight /></el-icon>
        </router-link>
      </div>
      
      <div class="help-nav-section">
        <h4>{{ $t('help.nav.dictionaryManagement') }}</h4>
        <ul class="help-nav-list">
          <li><router-link to="/help/dictionary-overview" :class="{ active: currentPath === 'dictionary-overview.html' }">{{ $t('help.nav.dictionaryOverview') }}</router-link></li>
          <li><router-link to="/help/dictionary-create" :class="{ active: currentPath === 'dictionary-create.html' }">{{ $t('help.nav.createDictionary') }}</router-link></li>
          <li><router-link to="/help/dictionary-version" :class="{ active: currentPath === 'dictionary-version.html' }">{{ $t('help.nav.versionManagement') }}</router-link></li>
          <li><router-link to="/help/dictionary-upload" :class="{ active: currentPath === 'dictionary-upload.html' }">{{ $t('help.nav.fileUpload') }}</router-link></li>
        </ul>
      </div>
      
      <div class="help-nav-section">
        <h4>{{ $t('help.nav.versionComparison') }}</h4>
        <ul class="help-nav-list">
          <li><router-link to="/help/comparison-overview" :class="{ active: currentPath === 'comparison-overview.html' }">{{ $t('help.nav.comparisonOverview') }}</router-link></li>
          <li><router-link to="/help/comparison-create" :class="{ active: currentPath === 'comparison-create.html' }">{{ $t('help.nav.createComparison') }}</router-link></li>
        </ul>
      </div>
      
      <div class="help-nav-section">
        <h4>{{ $t('help.nav.headwordSearch') }}</h4>
        <ul class="help-nav-list">
          <li><router-link to="/help/search-overview" :class="{ active: currentPath === 'search-overview.html' }">{{ $t('help.nav.searchOverview') }}</router-link></li>
        </ul>
      </div>
      
      <div class="help-nav-section">
        <h4>{{ $t('help.nav.taxonomy') }}</h4>
        <ul class="help-nav-list">
          <li><router-link to="/help/taxonomy-overview" :class="{ active: currentPath === 'taxonomy-overview.html' }">{{ $t('help.nav.taxonomyOverview') }}</router-link></li>
        </ul>
      </div>
      
      <div class="help-nav-section">
        <h4>{{ $t('help.nav.config') }}</h4>
        <ul class="help-nav-list">
          <li><router-link to="/help/config-overview" :class="{ active: currentPath === 'config-overview.html' }">{{ $t('help.nav.configOverview') }}</router-link></li>
        </ul>
      </div>
    </div>
    
    <!-- Right Content Area -->
    <div class="help-content">
      <div class="help-frame-container">
        <iframe 
          ref="helpFrame"
          :src="currentUrl" 
          name="help-frame"
          class="help-iframe"
          @load="onFrameLoad"
        ></iframe>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ArrowRight } from '@element-plus/icons-vue'

const route = useRoute()
const { t, locale } = useI18n()
const helpFrame = ref<HTMLIFrameElement>()

const currentUrl = ref('/help/index.html')
const currentPath = ref('index.html')

// Get help base URL based on current locale
const getHelpBaseUrl = () => {
  return locale.value === 'en' ? '/help/en' : '/help'
}

const pageTitles: Record<string, string> = {
  'index.html': t('help.title'),
  'dictionary-overview.html': t('help.nav.dictionaryOverview'),
  'dictionary-create.html': t('help.nav.createDictionary'),
  'dictionary-version.html': t('help.nav.versionManagement'),
  'dictionary-upload.html': t('help.nav.fileUpload'),
  'comparison-overview.html': t('help.nav.comparisonOverview'),
  'comparison-create.html': t('help.nav.createComparison'),
  'search-overview.html': t('help.nav.searchOverview'),
  'taxonomy-overview.html': t('help.nav.taxonomyOverview'),
  'config-overview.html': t('help.nav.configOverview')
}

const getHtmlPath = (routePath: string): string => {
  return `${routePath}.html`
}

const getRoutePath = (htmlPath: string): string => {
  return htmlPath.replace('.html', '')
}

const updateCurrentPage = (url: string) => {
  const path = url.replace('/help/', '')
  currentPath.value = path
}

const onFrameLoad = () => {
  try {
    if (helpFrame.value?.contentWindow) {
      const currentSrc = helpFrame.value.src
      updateCurrentPage(currentSrc)
    }
  } catch (error) {
    console.warn('无法访问iframe内容:', error)
  }
}

// Watch route changes and locale changes
watch([() => route.path, locale], ([newPath]) => {
  const pathMatch = (newPath as string).match(/\/help\/([^/]+)/)
  const baseUrl = getHelpBaseUrl()
  if (pathMatch) {
    const htmlPath = `${pathMatch[1]}.html`
    const url = `${baseUrl}/${htmlPath}`
    currentUrl.value = url
    updateCurrentPage(url)
  } else if (newPath === '/help' || newPath === '/help/') {
    // Default to index.html
    currentUrl.value = `${baseUrl}/index.html`
    updateCurrentPage(`${baseUrl}/index.html`)
  }
}, { immediate: true })
</script>

<style scoped>
.help-center-container {
  display: flex;
  height: 100vh;
  background: #f5f7fa;
}

.help-sidebar {
  width: 220px;
  background: white;
  border-right: 1px solid #e2e8f0;
  overflow-y: auto;
  flex-shrink: 0;
}

.help-sidebar-header {
  padding: 16px;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.help-sidebar-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #1a202c;
}

.back-link {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: #718096;
  text-decoration: none;
  transition: color 0.2s ease;
}

.back-link:hover {
  color: #4299e1;
}

.back-link .el-icon {
  font-size: 14px;
}

.help-nav-section {
  padding: 16px 0;
}

.help-nav-section h4 {
  margin: 0 0 8px 0;
  padding: 0 16px;
  font-size: 13px;
  font-weight: 600;
  color: #4a5568;
}

.help-nav-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.help-nav-list li {
  margin: 0;
}

.help-nav-list a {
  display: block;
  padding: 8px 16px;
  color: #718096;
  text-decoration: none;
  font-size: 13px;
  transition: all 0.2s ease;
  border-left: 3px solid transparent;
}

.help-nav-list a:hover {
  background: #f7fafc;
  color: #4299e1;
  border-left-color: #4299e1;
}

.help-nav-list a.active {
  background: #ebf8ff;
  color: #2b6cb0;
  border-left-color: #4299e1;
  font-weight: 500;
}

.help-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.help-frame-container {
  flex: 1;
  overflow: hidden;
  background: white;
}

.help-iframe {
  width: 100%;
  height: 100%;
  border: none;
  border-radius: 8px;
}

/* Responsive Design */
@media (max-width: 768px) {
  .help-center-container {
    flex-direction: column;
  }
  
  .help-sidebar {
    width: 100%;
    height: auto;
    border-right: none;
    border-bottom: 1px solid #e2e8f0;
  }
  
  .help-nav-section {
    padding: 8px 0;
  }
  
  .help-content {
    min-height: 600px;
  }
  
  .help-frame-container {
    margin: 8px;
  }
}
</style>