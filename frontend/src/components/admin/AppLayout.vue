<template>
  <el-container class="app-layout">
    <!-- Sidebar -->
    <el-aside :width="sidebarCollapsed ? '64px' : '260px'" class="sidebar">
      <!-- Logo at top -->
      <div class="logo">
        <el-icon><Document /></el-icon>
        <span v-if="!sidebarCollapsed">{{ $t('app.name') }}</span>
      </div>

      <!-- Main menu (regular user functions) -->
      <el-menu
        :default-active="route.path"
        :collapse="sidebarCollapsed"
        router
        class="sidebar-menu"
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
        :collapse="sidebarCollapsed"
        router
        class="sidebar-menu admin-menu"
      >
        <div class="nav-divider" :class="{ collapsed: sidebarCollapsed }">
          <span v-if="!sidebarCollapsed" class="nav-divider-label">{{ $t('nav.admin') }}</span>
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
          :disabled="!sidebarCollapsed"
        >
          <button
            class="sidebar-user-info"
            :class="{ collapsed: sidebarCollapsed, open: userMenuOpen }"
            @click="userMenuOpen = !userMenuOpen"
          >
            <div class="user-avatar">
              <el-icon><User /></el-icon>
            </div>
            <div v-if="!sidebarCollapsed" class="user-meta">
              <span class="user-email">{{ authStore.user?.email }}</span>
              <span class="user-tier">{{ tierLabel }}</span>
            </div>
            <el-icon v-if="!sidebarCollapsed" class="chevron-icon" :class="{ open: userMenuOpen }">
              <ArrowUp />
            </el-icon>
          </button>
        </el-tooltip>

        <!-- Collapsible user actions -->
        <transition name="slide-down">
          <div v-show="userMenuOpen" class="sidebar-user-actions" :class="{ collapsed: sidebarCollapsed }">
            <el-tooltip :content="$t('nav.profile')" placement="right" :disabled="!sidebarCollapsed">
              <button
                class="sidebar-action-btn"
                :class="{ active: route.path === '/profile' }"
                @click="navigate('/profile')"
              >
                <el-icon><UserFilled /></el-icon>
                <span v-if="!sidebarCollapsed">{{ $t('nav.profile') }}</span>
              </button>
            </el-tooltip>
            <el-tooltip :content="$t('nav.about')" placement="right" :disabled="!sidebarCollapsed">
              <button
                class="sidebar-action-btn"
                :class="{ active: route.path === '/about' }"
                @click="navigate('/about')"
              >
                <el-icon><InfoFilled /></el-icon>
                <span v-if="!sidebarCollapsed">{{ $t('nav.about') }}</span>
              </button>
            </el-tooltip>
            <el-tooltip :content="$t('nav.subscription')" placement="right" :disabled="!sidebarCollapsed">
              <button
                class="sidebar-action-btn"
                :class="{ active: route.path === '/subscription' }"
                @click="navigate('/subscription')"
              >
                <el-icon><Lightning /></el-icon>
                <span v-if="!sidebarCollapsed">{{ $t('nav.subscription') }}</span>
              </button>
            </el-tooltip>
            <el-tooltip :content="$t('nav.energy')" placement="right" :disabled="!sidebarCollapsed">
              <button
                class="sidebar-action-btn"
                :class="{ active: route.path === '/energy/history' }"
                @click="navigate('/energy/history')"
              >
                <el-icon><Histogram /></el-icon>
                <span v-if="!sidebarCollapsed">{{ $t('nav.energy') }}</span>
              </button>
            </el-tooltip>
            <el-tooltip :content="$t('nav.logout')" placement="right" :disabled="!sidebarCollapsed">
              <button class="sidebar-action-btn logout" @click="handleLogout">
                <el-icon><SwitchButton /></el-icon>
                <span v-if="!sidebarCollapsed">{{ $t('nav.logout') }}</span>
              </button>
            </el-tooltip>
          </div>
        </transition>
      </div>
    </el-aside>

    <!-- Main content area -->
    <el-container>
      <!-- Header -->
      <el-header class="app-header">
        <div class="header-left">
          <el-button text @click="sidebarCollapsed = !sidebarCollapsed">
            <el-icon><Expand v-if="sidebarCollapsed" /><Fold v-else /></el-icon>
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
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { useSettingsStore } from '@/stores/settings'
import { useSubscriptionStore } from '@/stores/subscription'
import {
  Document, Files, DataAnalysis, Search, Expand, Fold,
  User, UserFilled, SwitchButton, Moon, Sunny, Grid, View, CoffeeCup,
  Lightning, Histogram, ArrowUp, InfoFilled, HomeFilled, DocumentCopy, Warning, Setting, SetUp, QuestionFilled
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
})

const sidebarCollapsed = ref(false)
const userMenuOpen = ref(false)

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

function toggleDark(val: boolean) {
  settingsStore.setDark(val)
}

function navigate(path: string) {
  router.push(path)
  userMenuOpen.value = false
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

.sidebar {
  background: var(--el-bg-color);
  border-right: 1px solid var(--color-border);
  transition: width 0.3s;
  display: flex;
  flex-direction: column;
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
}

.header-right {
  display: flex;
  align-items: center;
  gap: 16px;
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
</style>
