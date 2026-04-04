<template>
  <el-container class="app-layout">
    <div
      v-if="isMobile && mobileSidebarOpen"
      class="mobile-sidebar-mask"
      @click="mobileSidebarOpen = false"
    />

    <!-- Sidebar -->
    <el-aside :width="asideWidth" class="sidebar-shell">
      <div class="sidebar" :class="{ mobile: isMobile, open: mobileSidebarOpen }">
        <!-- Logo at top -->
        <div class="logo">
          <el-icon><Document /></el-icon>
          <span v-if="!menuCollapsed">{{ $t('app.name') }}</span>
        </div>

        <!-- Main menu (regular user functions) -->
        <el-menu
          :default-active="route.path"
          :collapse="menuCollapsed"
          router
          class="sidebar-menu"
          @select="handleMenuSelect"
        >
          <el-menu-item index="/home">
            <el-icon><HomeFilled /></el-icon>
            <template #title>{{ $t('nav.home') }}</template>
          </el-menu-item>
          <el-menu-item index="/admin/dictionaries">
            <el-icon><Files /></el-icon>
            <template #title>{{ $t('nav.dictionaries') }}</template>
          </el-menu-item>
          <el-menu-item index="/comparisons">
            <el-icon><DataAnalysis /></el-icon>
            <template #title>{{ $t('nav.comparisons') }}</template>
          </el-menu-item>
          <el-menu-item index="/search">
            <el-icon><Search /></el-icon>
            <template #title>{{ $t('nav.search') }}</template>
          </el-menu-item>
          <el-menu-item index="/admin/taxonomy">
            <el-icon><Grid /></el-icon>
            <template #title>{{ $t('nav.taxonomy') }}</template>
          </el-menu-item>
          <el-menu-item index="/admin/tags">
            <el-icon><PriceTag /></el-icon>
            <template #title>{{ $t('nav.tags') }}</template>
          </el-menu-item>
          <el-menu-item index="/conversions">
            <el-icon><DocumentCopy /></el-icon>
            <template #title>{{ $t('nav.conversions') }}</template>
          </el-menu-item>
          <el-menu-item index="/admin/configs">
            <el-icon><Setting /></el-icon>
            <template #title>{{ $t('nav.config') }}</template>
          </el-menu-item>
          <el-menu-item index="/help">
            <el-icon><QuestionFilled /></el-icon>
            <template #title>{{ $t('nav.help') }}</template>
          </el-menu-item>
        </el-menu>

        <!-- Spacer to push admin menu down -->
        <div class="sidebar-spacer"></div>

        <!-- Admin menu (admin-only functions) -->
        <el-menu
          v-if="authStore.user?.role === 'ADMIN'"
          :default-active="route.path"
          :collapse="menuCollapsed"
          router
          class="sidebar-menu admin-menu"
          @select="handleMenuSelect"
        >
          <div class="nav-divider" :class="{ collapsed: menuCollapsed }">
            <span v-if="!menuCollapsed" class="nav-divider-label">{{ $t('nav.admin') }}</span>
          </div>
          <el-menu-item index="/admin/users">
            <el-icon><UserFilled /></el-icon>
            <template #title>{{ $t('nav.users') }}</template>
          </el-menu-item>
          <el-menu-item index="/admin/watermark-verify">
            <el-icon><View /></el-icon>
            <template #title>{{ $t('nav.watermark') }}</template>
          </el-menu-item>
          <el-menu-item index="/admin/file-management">
            <el-icon><DocumentCopy /></el-icon>
            <template #title>{{ $t('nav.files') }}</template>
          </el-menu-item>
          <el-menu-item index="/admin/subscription-plans">
            <el-icon><CoffeeCup /></el-icon>
            <template #title>{{ $t('nav.subscription') }}</template>
          </el-menu-item>
          <el-menu-item index="/admin/system-configs">
            <el-icon><SetUp /></el-icon>
            <template #title>{{ $t('nav.systemConfig') }}</template>
          </el-menu-item>
          <el-menu-item index="/admin/parse-errors">
            <el-icon><Warning /></el-icon>
            <template #title>{{ $t('nav.parseErrors') }}</template>
          </el-menu-item>
        </el-menu>

        <!-- User panel at bottom -->
        <div class="sidebar-user">
          <!-- User info block — click to toggle menu -->
          <el-tooltip
            :content="authStore.user?.email"
            placement="right"
            :disabled="!menuCollapsed"
          >
            <button
              class="sidebar-user-info"
              :class="{ collapsed: menuCollapsed, open: userMenuOpen }"
              @click="userMenuOpen = !userMenuOpen"
            >
              <div class="user-avatar">
                <el-icon><User /></el-icon>
              </div>
              <div v-if="!menuCollapsed" class="user-meta">
                <span class="user-email">{{ authStore.user?.email }}</span>
                <span class="user-tier">{{ tierLabel }}</span>
              </div>
              <el-icon v-if="!menuCollapsed" class="chevron-icon" :class="{ open: userMenuOpen }">
                <ArrowUp />
              </el-icon>
            </button>
          </el-tooltip>

          <!-- Collapsible user actions -->
          <transition name="slide-down">
            <div v-show="userMenuOpen" class="sidebar-user-actions" :class="{ collapsed: menuCollapsed }">
              <el-tooltip :content="$t('nav.profile')" placement="right" :disabled="!menuCollapsed">
                <router-link
                  to="/profile"
                  class="sidebar-action-btn"
                  :class="{ active: route.path === '/profile' }"
                  @click="handleAuxNavigation"
                >
                  <el-icon><UserFilled /></el-icon>
                  <span v-if="!menuCollapsed">{{ $t('nav.profile') }}</span>
                </router-link>
              </el-tooltip>
              <el-tooltip :content="$t('nav.about')" placement="right" :disabled="!menuCollapsed">
                <router-link
                  to="/about"
                  class="sidebar-action-btn"
                  :class="{ active: route.path === '/about' }"
                  @click="handleAuxNavigation"
                >
                  <el-icon><InfoFilled /></el-icon>
                  <span v-if="!menuCollapsed">{{ $t('nav.about') }}</span>
                </router-link>
              </el-tooltip>
              <el-tooltip :content="$t('nav.subscription')" placement="right" :disabled="!menuCollapsed">
                <router-link
                  to="/subscription"
                  class="sidebar-action-btn"
                  :class="{ active: route.path === '/subscription' }"
                  @click="handleAuxNavigation"
                >
                  <el-icon><Lightning /></el-icon>
                  <span v-if="!menuCollapsed">{{ $t('nav.subscription') }}</span>
                </router-link>
              </el-tooltip>
              <el-tooltip :content="$t('nav.energy')" placement="right" :disabled="!menuCollapsed">
                <router-link
                  to="/energy/history"
                  class="sidebar-action-btn"
                  :class="{ active: route.path === '/energy/history' }"
                  @click="handleAuxNavigation"
                >
                  <el-icon><Histogram /></el-icon>
                  <span v-if="!menuCollapsed">{{ $t('nav.energy') }}</span>
                </router-link>
              </el-tooltip>
              <el-tooltip :content="$t('nav.logout')" placement="right" :disabled="!menuCollapsed">
                <button class="sidebar-action-btn logout" @click="handleLogout">
                  <el-icon><SwitchButton /></el-icon>
                  <span v-if="!menuCollapsed">{{ $t('nav.logout') }}</span>
                </button>
              </el-tooltip>
            </div>
          </transition>
        </div>
      </div>
    </el-aside>

    <!-- Main content area -->
    <el-container>
      <!-- Header -->
      <el-header class="app-header">
        <div class="header-left">
          <el-button text class="nav-toggle-btn" @click="toggleNavigation">
            <el-icon><Expand v-if="menuCollapsed || !mobileSidebarOpen" /><Fold v-else /></el-icon>
          </el-button>
        </div>
        <div class="header-right">
          <!-- Language switcher -->
          <LanguageSwitcher />
          <!-- Energy indicator -->
          <EnergyIndicator v-if="authStore.isAuthenticated" />
          <!-- Dark mode toggle -->
          <el-switch
            v-model="isDark"
            :active-icon="Moon"
            :inactive-icon="Sunny"
            @change="toggleDark"
          />
        </div>
      </el-header>

      <!-- Page content -->
      <el-main>
        <div class="main-content">
          <!-- Grace period banner -->
          <el-alert
            v-if="subscriptionStore.isGrace"
            type="warning"
            :closable="false"
            show-icon
            style="margin-bottom: 12px"
            :title="$t('subscription.gracePeriod')"
            :description="$t('subscription.gracePeriodDesc')"
          />
          <RouterView />
        </div>
        <AppFooter />
      </el-main>
    </el-container>
  </el-container>

  <!-- Renewal reminder modal -->
  <RenewalReminderModal />
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { useSettingsStore } from '@/stores/settings'
import { useSubscriptionStore } from '@/stores/subscription'
import {
  Document, Files, DataAnalysis, Search, Expand, Fold,
  User, UserFilled, SwitchButton, Moon, Sunny, Grid, View, CoffeeCup,
  Lightning, Histogram, ArrowUp, InfoFilled, HomeFilled, DocumentCopy, Warning, Setting, SetUp, QuestionFilled, PriceTag
} from '@element-plus/icons-vue'
import EnergyIndicator from '@/components/subscription/EnergyIndicator.vue'
import RenewalReminderModal from '@/components/subscription/RenewalReminderModal.vue'
import AppFooter from '@/components/AppFooter.vue'
import LanguageSwitcher from '@/components/common/LanguageSwitcher.vue'

const { t } = useI18n()

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const settingsStore = useSettingsStore()
const subscriptionStore = useSubscriptionStore()

onMounted(() => {
  if (authStore.isAuthenticated) {
    subscriptionStore.fetchSubscription().catch(() => {/* non-critical */})
  }

  mediaQuery = window.matchMedia('(max-width: 900px)')
  syncMobileState(mediaQuery)
  mediaQuery.addEventListener('change', syncMobileState)
})

onUnmounted(() => {
  mediaQuery?.removeEventListener('change', syncMobileState)
})

const sidebarCollapsed = ref(false)
const userMenuOpen = ref(false)
const isMobile = ref(false)
const mobileSidebarOpen = ref(false)
let mediaQuery: MediaQueryList | null = null

const menuCollapsed = computed(() => !isMobile.value && sidebarCollapsed.value)
const asideWidth = computed(() => (isMobile.value ? '0px' : sidebarCollapsed.value ? '64px' : '260px'))

const isDark = computed({
  get: () => settingsStore.darkMode,
  set: (val: boolean) => settingsStore.setDark(val),
})

const TIER_LABELS: Record<string, string> = {
  BASIC: 'subscription.tier.USER',
  ADVANCED: 'subscription.tier.ADVANCED',
  PREMIUM: 'subscription.tier.ADVANCED',
  ELITE: 'subscription.tier.ELITE',
}

const tierLabel = computed(() => {
  const tier = subscriptionStore.subscriptionState?.subscription?.tier
  return tier ? t(TIER_LABELS[tier] ?? 'subscription.tier.REGULAR') : t('subscription.tier.REGULAR')
})

watch(() => route.path, () => {
  userMenuOpen.value = false
  mobileSidebarOpen.value = false
})

function toggleDark(val: boolean) {
  settingsStore.setDark(val)
}

function syncMobileState(event: MediaQueryList | MediaQueryListEvent) {
  isMobile.value = event.matches
  if (event.matches) {
    sidebarCollapsed.value = false
  } else {
    mobileSidebarOpen.value = false
  }
}

function toggleNavigation() {
  if (isMobile.value) {
    mobileSidebarOpen.value = !mobileSidebarOpen.value
    return
  }
  sidebarCollapsed.value = !sidebarCollapsed.value
}

function handleMenuSelect() {
  if (isMobile.value) {
    mobileSidebarOpen.value = false
  }
}

function handleAuxNavigation() {
  userMenuOpen.value = false
  if (isMobile.value) {
    mobileSidebarOpen.value = false
  }
}

async function handleLogout() {
  sessionStorage.removeItem('renewalReminderDismissed')
  await authStore.logout()
  router.push('/login')
}
</script>

<style scoped>
.app-layout {
  height: 100vh;
}

.sidebar-shell {
  position: relative;
  z-index: 20;
}

.sidebar {
  background: var(--el-bg-color);
  border-right: 1px solid var(--color-border);
  transition: width 0.3s, transform 0.3s ease;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.sidebar.mobile {
  position: fixed;
  inset: 0 auto 0 0;
  width: min(82vw, 300px);
  transform: translateX(-100%);
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.16);
}

.sidebar.mobile.open {
  transform: translateX(0);
}

.mobile-sidebar-mask {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.32);
  z-index: 19;
}

.sidebar-menu {
  border-right: none;
  overflow-y: auto;
  overflow-x: hidden;
}

.sidebar-spacer {
  flex: 1;
}

/* Strengthen active nav item */
:deep(.el-menu-item.is-active) {
  background-color: var(--el-color-primary-light-9) !important;
  color: var(--el-color-primary) !important;
  font-weight: 600;
  border-left: 3px solid var(--el-color-primary);
  padding-left: calc(var(--el-menu-base-level-padding) - 3px) !important;
}

:deep(.el-menu--collapse .el-menu-item.is-active) {
  border-left: 3px solid var(--el-color-primary);
}

.logo {
  height: 60px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 20px;
  font-size: 16px;
  font-weight: bold;
  color: var(--color-primary);
  border-bottom: 1px solid var(--color-border);
}

/* Admin section divider */
.nav-divider {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 8px 12px 4px;
  color: var(--el-text-color-placeholder);
}

.nav-divider::before,
.nav-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--color-border);
}

.nav-divider.collapsed {
  margin: 8px 14px 4px;
}

.nav-divider.collapsed::after {
  display: none;
}

.nav-divider-label {
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
  letter-spacing: 0.5px;
}

/* User panel at the bottom */
.sidebar-user {
  border-top: 1px solid var(--color-border);
  flex-shrink: 0;
}

/* User info toggle button */
.sidebar-user-info {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 12px 14px;
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s;
}

.sidebar-user-info.collapsed {
  justify-content: center;
  padding: 12px 0;
}

.sidebar-user-info:hover,
.sidebar-user-info.open {
  background: var(--el-fill-color-light);
}

/* Avatar circle */
.user-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--el-color-primary-light-8);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--el-color-primary);
  font-size: 16px;
}

.user-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.user-email {
  font-size: 12px;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 120px;
  line-height: 1.4;
}

.user-tier {
  font-size: 11px;
  color: var(--el-color-primary);
  font-weight: 500;
  line-height: 1.3;
}

.chevron-icon {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
  flex-shrink: 0;
  transition: transform 0.2s;
}

.chevron-icon.open {
  transform: rotate(180deg);
}

/* Collapsible action list */
.sidebar-user-actions {
  display: flex;
  flex-direction: column;
  background: var(--el-fill-color-extra-light);
  border-top: 1px solid var(--color-border);
  padding: 4px 0;
}

.sidebar-user-actions.collapsed {
  align-items: center;
}

.sidebar-action-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 14px 8px 20px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 13px;
  color: var(--el-text-color-regular);
  text-align: left;
  transition: background 0.15s, color 0.15s;
  border-radius: 0;
  text-decoration: none;
}

.sidebar-user-actions.collapsed .sidebar-action-btn {
  justify-content: center;
  padding: 8px 0;
  width: 48px;
}

.sidebar-action-btn:hover {
  background: var(--el-fill-color);
  color: var(--el-color-primary);
}

.sidebar-action-btn.active {
  color: var(--el-color-primary);
  font-weight: 500;
}

.sidebar-action-btn.logout:hover {
  color: var(--el-color-danger);
}

.sidebar-action-btn .el-icon {
  font-size: 14px;
  flex-shrink: 0;
}

/* Slide animation */
.slide-down-enter-active,
.slide-down-leave-active {
  transition: max-height 0.22s ease, opacity 0.22s ease;
  overflow: hidden;
  max-height: 200px;
}

.slide-down-enter-from,
.slide-down-leave-to {
  max-height: 0;
  opacity: 0;
}

.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--color-border);
  background: var(--el-bg-color);
  padding: 0 16px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

:deep(.el-main) {
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 0;
}

.main-content {
  padding: 20px;
  flex: 1;
  overflow-y: auto;
}

.nav-toggle-btn {
  font-size: 18px;
}

@media (max-width: 900px) {
  .app-header {
    min-height: 60px;
    height: auto;
    padding: 10px 12px;
  }

  .header-right {
    gap: 10px;
    justify-content: flex-end;
  }

  .main-content {
    padding: 14px;
  }
}
</style>
