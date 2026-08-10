<template>
  <el-card class="settings-card" shadow="never">
    <template #header>
      <div class="card-title">
        <i class="fas fa-circle-info"></i>
        <span>关于</span>
      </div>
    </template>

    <!-- 程序信息 -->
    <div class="about-section">
      <div class="app-brand">
        <i class="fas fa-wand-magic-sparkles"></i>
        <div>
          <div class="app-name">星梦超分工具</div>
          <div class="app-version">版本 {{ appVersion }}</div>
        </div>
      </div>
      <p class="app-desc">
        免费的图片/视频超分与插帧桌面工具。基于 ncnn-vulkan 引擎，支持 NVIDIA / AMD / Intel 显卡。
        本程序完全免费，无任何付费功能，可自由分享。
      </p>
    </div>

    <el-divider />

    <!-- 开源组件与许可证（合规署名） -->
    <div class="section-title">开源组件与许可证</div>
    <p class="section-desc">
      本程序使用了以下开源项目，感谢它们的作者。各组件遵循其原始许可证。
    </p>
    <div class="license-list">
      <div v-for="item in licenses" :key="item.name" class="license-item">
        <div class="license-name">
          <a v-if="item.url" :href="item.url" target="_blank">{{ item.name }}</a>
          <span v-else>{{ item.name }}</span>
          <el-tag size="small" :type="licenseTagType(item.license)" effect="plain">{{ item.license }}</el-tag>
        </div>
        <div class="license-author">{{ item.author }} · {{ item.desc }}</div>
      </div>
    </div>

    <el-divider />

    <!-- 开源协议与免责 -->
    <div class="section-title">开源协议与免责</div>
    <p class="disclaimer">
      本程序基于 <strong>Apache-2.0</strong> 协议开源，可自由使用和分享。
      因内置 <strong>FFmpeg (GPL-2.0-or-later)</strong>，依 GPL 要求，本程序源码可在项目仓库获取。
    </p>
    <p class="disclaimer">
      本程序不收集任何用户数据，所有处理均在本地完成。
      请合法使用，对处理后的内容自行承担责任。各超分引擎、模型及 FFmpeg 的版权归原作者所有。
    </p>
  </el-card>
</template>

<script setup>
import { ref } from 'vue'

const appVersion = ref(__APP_VERSION__)

// 引擎与核心依赖的许可证署名（对外分享必须保留）
const licenses = [
  {
    name: 'Real-ESRGAN (ncnn-vulkan)',
    author: 'Xintao Wang (模型/算法) / nihui (ncnn 移植)',
    license: 'MIT',
    desc: '通用图像/视频超分',
    url: 'https://github.com/xinntao/Real-ESRGAN-ncnn-vulkan'
  },
  {
    name: 'Real-CUGAN (ncnn-vulkan)',
    author: 'bilibili ailab (算法) / nihui (ncnn 移植)',
    license: 'MIT',
    desc: '动漫图像超分',
    url: 'https://github.com/nihui/realcugan-ncnn-vulkan'
  },
  {
    name: 'waifu2x (ncnn-vulkan)',
    author: 'nihui',
    license: 'MIT',
    desc: '动漫图像降噪放大',
    url: 'https://github.com/nihui/waifu2x-ncnn-vulkan'
  },
  {
    name: 'realSR (ncnn-vulkan)',
    author: 'nihui',
    license: 'MIT',
    desc: '真实照片超分',
    url: 'https://github.com/nihui/realsr-ncnn-vulkan'
  },
  {
    name: 'RIFE (ncnn-vulkan)',
    author: 'hzwer (算法) / nihui (ncnn 移植)',
    license: 'MIT',
    desc: '视频插帧',
    url: 'https://github.com/nihui/rife-ncnn-vulkan'
  },
  {
    name: 'CAIN (ncnn-vulkan)',
    author: 'nihui',
    license: 'MIT',
    desc: '视频插帧',
    url: 'https://github.com/nihui/cain-ncnn-vulkan'
  },
  {
    name: 'ncnn',
    author: 'THL A29 Limited, a Tencent company',
    license: 'BSD-3-Clause',
    desc: '神经网络推理框架',
    url: 'https://github.com/Tencent/ncnn'
  },
  {
    name: 'FFmpeg',
    author: 'FFmpeg developers',
    license: 'GPL-2.0-or-later',
    desc: '视频拆帧/合成/音频处理（含 libx264 等 GPL 组件）',
    url: 'https://ffmpeg.org'
  },
  {
    name: 'Element Plus',
    author: 'Element Plus Team',
    license: 'MIT',
    desc: 'UI 组件库',
    url: 'https://element-plus.org'
  },
  {
    name: 'Electron',
    author: 'OpenJS Foundation',
    license: 'MIT',
    desc: '跨平台桌面应用框架',
    url: 'https://www.electronjs.org'
  },
  {
    name: 'Vue.js',
    author: 'Evan You',
    license: 'MIT',
    desc: '前端框架',
    url: 'https://vuejs.org'
  },
  {
    name: 'Font Awesome',
    author: 'Fonticons, Inc.',
    license: 'CC-BY-4.0 / OFL-1.1 / MIT',
    desc: '图标库',
    url: 'https://fontawesome.com'
  },
  {
    name: 'sharp',
    author: 'Lovell Fuller',
    license: 'Apache-2.0',
    desc: '图片缩略图生成（内存优化）',
    url: 'https://github.com/lovell/sharp'
  },
  {
    name: 'systeminformation',
    author: 'Sebastian Hildebrandt',
    license: 'MIT',
    desc: '系统信息与硬件检测',
    url: 'https://github.com/sebhildebrandt/systeminformation'
  },
  {
    name: 'Pinia',
    author: 'Eduardo San Martin Morote',
    license: 'MIT',
    desc: '状态管理',
    url: 'https://pinia.vuejs.org'
  },
  {
    name: 'Vue Router',
    author: 'Eduardo San Martin Morote',
    license: 'MIT',
    desc: '路由',
    url: 'https://router.vuejs.org'
  },
  {
    name: 'electron-toolkit',
    author: 'Alex Wei',
    license: 'MIT',
    desc: 'Electron 开发工具集',
    url: 'https://github.com/alex8088/electron-toolkit'
  }
]

function licenseTagType(license) {
  if (/GPL/.test(license)) return 'danger' // GPL 类（需注意传染性）
  if (/MIT|BSD|SIL|OFL|CC-BY/.test(license)) return 'success'
  if (/LGPL|Apache|MPL/.test(license)) return 'warning'
  return 'info'
}
</script>

<style scoped>
.card-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.about-section {
  margin-bottom: 4px;
}

.app-brand {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 12px;
}

.app-brand > i {
  font-size: 36px;
  color: var(--el-color-primary);
}

.app-name {
  font-size: 18px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.app-version {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}

.app-desc {
  font-size: 13px;
  color: var(--el-text-color-regular);
  line-height: 1.6;
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-color-primary);
  margin-bottom: 8px;
}

.section-desc {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 12px;
  line-height: 1.5;
}

.license-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.license-item {
  padding: 8px 10px;
  background: var(--el-fill-color-light);
  border-radius: var(--el-border-radius-small);
}

.license-name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--el-text-color-primary);
  margin-bottom: 2px;
}

.license-name a {
  color: var(--el-color-primary);
  text-decoration: none;
}

.license-name a:hover {
  text-decoration: underline;
}

.license-author {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.disclaimer {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.6;
}
</style>
