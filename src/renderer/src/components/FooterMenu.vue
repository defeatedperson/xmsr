<template>
  <div class="footer-menu">
    <div class="footer-left">© {{ year }} 星梦超分工具 XMSR</div>
    <div class="footer-right">
      <a
        v-for="link in links"
        :key="link.url"
        class="footer-link"
        :title="link.title"
        @click="openLink(link.url)"
      >
        <i :class="link.icon"></i>
        <span>{{ link.label }}</span>
      </a>
      <span class="version">v{{ appVersion }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const year = ref(new Date().getFullYear())
const appVersion = ref(__APP_VERSION__)

const links = [
  { label: 'GitHub', url: 'https://github.com/defeatedperson/xmsr', icon: 'fab fa-github', title: '源码仓库' },
  { label: '官网', url: 'https://sr.xmpanel.cn', icon: 'fas fa-globe', title: '官方网站' }
]

function openLink(url) {
  // 通过主进程用系统默认浏览器打开（避免在 Electron 内部打开）
  window.api.openExternal(url)
}
</script>

<style scoped>
.footer-menu {
  height: var(--footer-height);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  background: var(--el-bg-color);
  border-top: 1px solid var(--el-border-color-lighter);
  flex-shrink: 0;
}

.footer-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.footer-link {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  color: var(--el-text-color-secondary);
  transition: color 0.15s;
}

.footer-link:hover {
  color: var(--el-color-primary);
}

.version {
  color: var(--el-text-color-placeholder);
}
</style>
