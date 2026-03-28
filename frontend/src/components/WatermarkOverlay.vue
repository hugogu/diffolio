<template>
  <div
    v-if="show"
    class="wm-overlay"
    :style="bgStyle"
    aria-hidden="true"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()

const show = computed(() => !!authStore.user?.watermarkEnabled)

/** Escape XML special chars so they're safe inside an SVG attribute */
function escXml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const bgStyle = computed(() => {
  const user = authStore.user
  if (!user) return {}

  const shortId = user.id.replace(/-/g, '').slice(0, 8)
  const ym = new Date().toISOString().slice(0, 7)
  const line1 = escXml(user.email)
  const line2 = escXml(`${shortId}  ${ym}`)

  // SVG tile: 340×130, text rotated -35°, two lines
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="340" height="130">
  <g transform="rotate(-35 170 65)" fill="rgba(0,0,0,0.11)" font-family="monospace" font-size="11">
    <text x="170" y="55"  text-anchor="middle">${line1}</text>
    <text x="170" y="72" text-anchor="middle">${line2}</text>
  </g>
</svg>`

  const encoded = btoa(unescape(encodeURIComponent(svg)))
  return {
    backgroundImage: `url("data:image/svg+xml;base64,${encoded}")`,
    backgroundRepeat: 'repeat',
    backgroundSize: '340px 130px',
  }
})
</script>

<style scoped>
.wm-overlay {
  position: fixed;
  inset: 0;
  pointer-events: none;
  user-select: none;
  z-index: 998;
}
</style>
