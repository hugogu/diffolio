<template>
  <div class="help-center-container">
    <!-- Left Sidebar -->
    <div class="help-sidebar">
      <div class="help-sidebar-header">
        <h3>{{ $t('help.title') }}</h3>
      </div>
      
      <div class="help-nav-section">
        <h4>{{ $t('help.nav.dictionaryManagement') }}</h4>
        <ul class="help-nav-list">
          <li><a href="/help/dictionary-overview" @click.prevent="navigateTo('dictionary-overview.html', $event)" :class="{ active: currentPath === 'dictionary-overview.html' }">{{ $t('help.nav.dictionaryOverview') }}</a></li>
          <li><a href="/help/dictionary-create" @click.prevent="navigateTo('dictionary-create.html', $event)" :class="{ active: currentPath === 'dictionary-create.html' }">{{ $t('help.nav.createDictionary') }}</a></li>
          <li><a href="/help/dictionary-version" @click.prevent="navigateTo('dictionary-version.html', $event)" :class="{ active: currentPath === 'dictionary-version.html' }">{{ $t('help.nav.versionManagement') }}</a></li>
          <li><a href="/help/dictionary-upload" @click.prevent="navigateTo('dictionary-upload.html', $event)" :class="{ active: currentPath === 'dictionary-upload.html' }">{{ $t('help.nav.fileUpload') }}</a></li>
        </ul>
      </div>
      
      <div class="help-nav-section">
        <h4>{{ $t('help.nav.versionComparison') }}</h4>
        <ul class="help-nav-list">
          <li><a href="/help/comparison-overview" @click.prevent="navigateTo('comparison-overview.html', $event)" :class="{ active: currentPath === 'comparison-overview.html' }">{{ $t('help.nav.comparisonOverview') }}</a></li>
          <li><a href="/help/comparison-create" @click.prevent="navigateTo('comparison-create.html', $event)" :class="{ active: currentPath === 'comparison-create.html' }">{{ $t('help.nav.createComparison') }}</a></li>
        </ul>
      </div>
      
      <div class="help-nav-section">
        <h4>{{ $t('help.nav.headwordSearch') }}</h4>
        <ul class="help-nav-list">
          <li><a href="/help/search-overview" @click.prevent="navigateTo('search-overview.html', $event)" :class="{ active: currentPath === 'search-overview.html' }">{{ $t('help.nav.searchOverview') }}</a></li>
        </ul>
      </div>
      
      <div class="help-nav-section">
        <h4>{{ $t('help.nav.taxonomy') }}</h4>
        <ul class="help-nav-list">
          <li><a href="/help/taxonomy-overview" @click.prevent="navigateTo('taxonomy-overview.html', $event)" :class="{ active: currentPath === 'taxonomy-overview.html' }">{{ $t('help.nav.taxonomyOverview') }}</a></li>
        </ul>
      </div>
      
      <div class="help-nav-section">
        <h4>{{ $t('help.nav.config') }}</h4>
        <ul class="help-nav-list">
          <li><a href="/help/config-overview" @click.prevent="navigateTo('config-overview.html', $event)" :class="{ active: currentPath === 'config-overview.html' }">{{ $t('help.nav.configOverview') }}</a></li>
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
import { ref, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'

const route = useRoute()
const router = useRouter()
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
  const pathMatch = newPath.match(/\/help\/([^/]+)/)
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

const navigateTo = (htmlPath: string, event?: Event) => {
  if (event) {
    event.preventDefault()
  }
  const baseUrl = getHelpBaseUrl()
  const routePath = htmlPath.replace('.html', '')
  router.push(`/help/${routePath}`)
  currentUrl.value = `${baseUrl}/${htmlPath}`
  updateCurrentPage(currentUrl.value)
}
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
}

.help-sidebar-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #1a202c;
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
