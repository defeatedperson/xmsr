<template>
  <div class="top-nav">
    <!-- 左侧：程序名 + 菜单 -->
    <div class="nav-left">
      <div class="brand">
        <i class="fas fa-wand-magic-sparkles brand-icon"></i>
        <span class="brand-text">星梦超分</span>
      </div>
      <nav class="nav-menu">
        <button
          v-for="item in menus"
          :key="item.path"
          class="nav-item"
          :class="{ 'is-active': activeRoute === item.path }"
          @click="handleSelect(item.path)"
        >
          <i :class="['fas', item.icon]"></i>
          <span>{{ item.label }}</span>
        </button>
      </nav>
    </div>

    <!-- 右侧：窗口控制按钮 -->
    <div class="window-controls">
      <button class="win-btn" title="最小化" @click="onMinimize">
        <i class="fas fa-minus"></i>
      </button>
      <button class="win-btn" title="最大化/还原" @click="onMaximize">
        <i :class="isMax ? 'far fa-clone' : 'far fa-square'"></i>
      </button>
      <button class="win-btn win-btn-close" title="关闭" @click="onClose">
        <i class="fas fa-times"></i>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const isMax = ref(false)

const menus = [
  { path: '/image', label: '图片', icon: 'fa-image' },
  { path: '/video', label: '视频', icon: 'fa-film' },
  { path: '/output', label: '成品', icon: 'fa-photo-film' },
  { path: '/logs', label: '日志', icon: 'fa-scroll' },
  { path: '/settings', label: '设置', icon: 'fa-gear' }
]

const activeRoute = computed(() => {
  const seg = route.path.split('/')[1]
  return '/' + (seg || 'image')
})

function handleSelect(path) {
  router.push(path)
}

function onMinimize() {
  window.api.windowMinimize()
}
function onMaximize() {
  window.api.windowMaximize()
}
function onClose() {
  window.api.windowClose()
}

function onMaximized(value) {
  isMax.value = value
}

onMounted(async () => {
  isMax.value = await window.api.windowIsMaximized()
  window.api.windowOnMaximized(onMaximized)
})

onBeforeUnmount(() => {
  window.api.windowOffMaximized()
})
</script>

<style scoped>
/* 整个顶部导航条：显式高度，可拖动窗口 */
.top-nav {
  height: var(--top-nav-height);
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color-lighter);
  -webkit-app-region: drag;
  box-sizing: border-box;
}

/* 左侧区域 */
.nav-left {
  display: flex;
  align-items: center;
  height: 100%;
  -webkit-app-region: no-drag;
}

/* 程序名 */
.brand {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 18px 0 16px;
  height: 100%;
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  border-right: 1px solid var(--el-border-color-lighter);
  flex-shrink: 0;
  box-sizing: border-box;
}

.brand-icon {
  color: var(--el-color-primary);
  font-size: 17px;
}

/* 菜单：原生 button 实现，避免 el-menu 的尺寸/布局干扰 */
.nav-menu {
  display: flex;
  align-items: center;
  height: 100%;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 100%;
  padding: 0 18px;
  font-size: 14px;
  color: var(--el-text-color-regular);
  background: transparent;
  border-bottom: 2px solid transparent;
  transition: color 0.15s, background 0.15s, border-color 0.15s;
  box-sizing: border-box;
}

.nav-item:hover {
  color: var(--el-text-color-primary);
  background: var(--el-fill-color-light);
}

.nav-item.is-active {
  color: var(--el-color-primary);
  border-bottom-color: var(--el-color-primary);
}

.nav-item i {
  font-size: 14px;
}

/* 右侧窗口按钮区 */
.window-controls {
  display: flex;
  align-items: stretch;
  height: 100%;
  -webkit-app-region: no-drag;
}

.win-btn {
  width: 46px;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--el-text-color-regular);
  font-size: 11px;
  transition: background 0.15s, color 0.15s;
}

.win-btn:hover {
  background: var(--el-fill-color-light);
  color: var(--el-text-color-primary);
}

.win-btn-close:hover {
  background: var(--el-color-danger);
  color: #fff;
}
</style>
