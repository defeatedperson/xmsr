<template>
  <div class="app-layout">
    <StarryBackground />
    <el-container class="app-container">
      <el-header class="app-header">
        <TopNavBar />
      </el-header>
      <el-main class="app-content">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <!-- keep-alive 缓存页面组件：任务运行中切换标签不丢失进度/日志状态 -->
            <keep-alive>
              <component :is="Component" />
            </keep-alive>
          </transition>
        </router-view>
      </el-main>
      <FooterMenu />
    </el-container>
  </div>
</template>

<script setup>
import StarryBackground from '@renderer/components/StarryBackground.vue'
import TopNavBar from '@renderer/components/TopNavBar.vue'
import FooterMenu from '@renderer/components/FooterMenu.vue'
</script>

<style scoped>
.app-layout {
  height: 100vh;
  width: 100vw;
  overflow: hidden;
}

.app-container {
  position: relative;
  z-index: 1;
  height: 100%;
  overflow-x: hidden;
  flex-direction: column;
}

.app-header {
  height: var(--top-nav-height);
  padding: 0;
  flex-shrink: 0;
}

.app-content {
  flex: 1;
  overflow: auto;
  overflow-x: hidden;
  padding: 10px;
  background-color: transparent;
}

.fade-enter-active {
  transition: all 0.3s ease-out;
}
.fade-leave-active {
  transition: all 0.2s ease-in;
}
.fade-enter-from {
  opacity: 0;
  transform: translateX(30px);
}
.fade-leave-to {
  opacity: 0;
  transform: translateX(-30px);
}
</style>
