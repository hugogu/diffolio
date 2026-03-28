<template>
  <div class="taxonomy-edit-page">
    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px">
      <el-breadcrumb>
        <el-breadcrumb-item :to="{ path: '/admin/taxonomy' }">{{ $t('admin.taxonomy.title') }}</el-breadcrumb-item>
        <el-breadcrumb-item>{{ $t('admin.taxonomy.editor.title') }}</el-breadcrumb-item>
      </el-breadcrumb>
    </div>
    <TaxonomyTreeEditor :source-id="sourceId" />
  </div>
</template>

<script setup lang="ts">
import { useRoute } from 'vue-router'
import TaxonomyTreeEditor from '@/components/taxonomy/TaxonomyTreeEditor.vue'

const route = useRoute()
const sourceId = route.params.sourceId as string
</script>
