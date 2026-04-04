import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'Login',
      component: () => import('@/pages/LoginPage.vue'),
      meta: { public: true },
    },
    {
      path: '/register',
      name: 'Register',
      component: () => import('@/pages/RegisterPage.vue'),
      meta: { public: true },
    },
    {
      path: '/verify-email',
      name: 'VerifyEmail',
      component: () => import('@/pages/VerifyEmailPage.vue'),
      meta: { public: true },
    },
    {
      path: '/terms',
      name: 'TermsOfService',
      component: () => import('@/pages/TermsOfServicePage.vue'),
      meta: { public: true },
    },
    {
      path: '/help',
      name: 'HelpCenter',
      component: () => import('@/pages/help/HelpCenterPage.vue'),
      meta: { public: true },
    },
    {
      path: '/help/:page',
      name: 'HelpPage',
      component: () => import('@/pages/help/HelpCenterPage.vue'),
      meta: { public: true },
    },
    {
      path: '/',
      component: () => import('@/components/admin/AppLayout.vue'),
      children: [
        {
          path: '',
          redirect: '/home',
        },
        {
          path: 'home',
          name: 'Home',
          component: () => import('@/pages/HomePage.vue'),
        },
        {
          path: 'admin/dictionaries',
          name: 'DictionaryList',
          component: () => import('@/pages/admin/DictionaryListPage.vue'),
        },
        {
          path: 'admin/dictionaries/:id',
          name: 'DictionaryDetail',
          component: () => import('@/pages/admin/DictionaryDetailPage.vue'),
        },
        {
          path: 'admin/versions/:versionId',
          name: 'VersionDetail',
          component: () => import('@/pages/admin/VersionDetailPage.vue'),
        },
        {
          path: 'admin/parse-tasks/:taskId/errors',
          name: 'ParseErrors',
          component: () => import('@/pages/admin/ParseErrorsPage.vue'),
        },
        {
          path: 'admin/versions/:versionId/parse-debug',
          name: 'ParseDebug',
          component: () => import('@/pages/admin/ParseDebugPage.vue'),
        },
        {
          path: 'comparisons',
          name: 'Comparisons',
          component: () => import('@/pages/ComparisonsPage.vue'),
        },
        {
          path: 'comparisons/:id',
          name: 'ComparisonDetail',
          component: () => import('@/pages/ComparisonDetailPage.vue'),
        },
        {
          path: 'search',
          name: 'Search',
          component: () => import('@/pages/SearchPage.vue'),
        },
        {
          path: 'admin/taxonomy',
          name: 'TaxonomyList',
          component: () => import('@/pages/admin/TaxonomyPage.vue'),
        },
        {
          path: 'admin/tags',
          name: 'TagManagement',
          component: () => import('@/pages/admin/TagManagementPage.vue'),
        },
        {
          path: 'admin/taxonomy/:sourceId/edit',
          name: 'TaxonomyEdit',
          component: () => import('@/pages/admin/TaxonomyEditPage.vue'),
        },
        {
          path: 'admin/users',
          name: 'UserManagement',
          component: () => import('@/pages/admin/UserManagementPage.vue'),
          meta: { requiresAdmin: true },
        },
        {
          path: 'admin/watermark-verify',
          name: 'WatermarkVerify',
          component: () => import('@/pages/admin/WatermarkVerifyPage.vue'),
          meta: { requiresAdmin: true },
        },
        {
          path: 'admin/file-management',
          name: 'FileManagement',
          component: () => import('@/pages/admin/FileManagementPage.vue'),
          meta: { requiresAdmin: true },
        },
        {
          path: 'admin/parse-errors',
          name: 'AdminParseErrors',
          component: () => import('@/pages/admin/ParseErrorsAdminPage.vue'),
          meta: { requiresAdmin: true },
        },
        {
          path: 'profile',
          name: 'UserProfile',
          component: () => import('@/pages/UserProfilePage.vue'),
        },
        {
          path: 'subscription',
          name: 'Subscription',
          component: () => import('@/pages/SubscriptionPage.vue'),
        },
        {
          path: 'energy/history',
          name: 'EnergyHistory',
          component: () => import('@/pages/EnergyHistoryPage.vue'),
        },
        {
          path: 'about',
          name: 'About',
          component: () => import('@/pages/AboutPage.vue'),
        },
        {
          path: 'change-password',
          name: 'ChangePassword',
          component: () => import('@/pages/ChangePasswordPage.vue'),
        },
        {
          path: 'conversions',
          name: 'FormatConversions',
          component: () => import('@/pages/FormatConversionPage.vue'),
        },
        {
          path: 'admin/configs',
          name: 'ConfigManagement',
          component: () => import('@/pages/admin/ConfigManagementPage.vue'),
        },
        {
          path: 'admin/system-configs',
          name: 'AdminSystemConfigs',
          component: () => import('@/pages/admin/AdminSystemConfigsPage.vue'),
          meta: { requiresAdmin: true },
        },
        {
          path: 'admin/subscription-plans',
          name: 'SubscriptionPlans',
          component: () => import('@/pages/admin/SubscriptionPlansPage.vue'),
          meta: { requiresAdmin: true },
        },
      ],
    },
  ],
})

router.beforeEach(async (to, _from, next) => {
  if (to.meta.public) {
    next()
    return
  }

  const authStore = useAuthStore()
  if (!authStore.isAuthenticated) {
    try {
      await authStore.fetchMe()
    } catch {
      next('/login')
      return
    }
  }

  if (!authStore.isAuthenticated) {
    next('/login')
    return
  }

  if (to.meta.requiresAdmin && authStore.user?.role !== 'ADMIN') {
    next('/')
    return
  }

  next()
})

export default router
