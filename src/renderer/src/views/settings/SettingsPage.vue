<template>
  <div class="settings-page">
    <div class="cards">
      <WorkspaceCard ref="workspaceRef" @changed="onWorkspaceChanged" />
      <CompatibilityCard />
      <DiskMonitorCard ref="diskRef" />
      <CacheCleanCard ref="cacheRef" @changed="onCacheChanged" />
      <AboutCard />
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import WorkspaceCard from './child/WorkspaceCard.vue'
import CompatibilityCard from './child/CompatibilityCard.vue'
import DiskMonitorCard from './child/DiskMonitorCard.vue'
import CacheCleanCard from './child/CacheCleanCard.vue'
import AboutCard from './child/AboutCard.vue'

const diskRef = ref(null)
const cacheRef = ref(null)

// 工作目录变更：刷新磁盘监控 + 缓存大小
function onWorkspaceChanged() {
  diskRef.value?.reload()
  cacheRef.value?.reload()
}

// 缓存清理后：刷新磁盘监控（可用空间变化）
function onCacheChanged() {
  diskRef.value?.reload()
}
</script>

<style scoped>
.settings-page {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.cards {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
</style>
