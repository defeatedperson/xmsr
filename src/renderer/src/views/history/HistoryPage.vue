<template>
  <div class="output-page">
    <!-- 工具栏：左筛选 + 右操作 -->
    <div class="toolbar">
      <el-button-group>
        <el-button :type="filter === 'all' ? 'primary' : ''" @click="filter = 'all'">全部 ({{ items.length }})</el-button>
        <el-button :type="filter === 'image' ? 'primary' : ''" @click="filter = 'image'">图片 ({{ countByType.image }})</el-button>
        <el-button :type="filter === 'video' ? 'primary' : ''" @click="filter = 'video'">视频 ({{ countByType.video }})</el-button>
      </el-button-group>
      <el-button-group>
        <el-button :icon="Refresh" @click="load">刷新</el-button>
        <el-button :icon="Folder" @click="openOutputDir">打开目录</el-button>
      </el-button-group>
    </div>

    <!-- 空状态 -->
    <el-empty v-if="filteredItems.length === 0" description="暂无成品文件。完成超分任务后，结果会出现在这里。" />

    <!-- 成品网格 -->
    <div v-else class="card-grid">
      <div v-for="item in filteredItems" :key="item.path" class="product-card">
        <div class="thumb-wrap" @click="onPreview(item)">
          <!-- 图片缩略图 -->
          <img v-if="item.type === 'image' && item.thumbUrl" :src="item.thumbUrl" class="thumb" />
          <!-- 视频缩略图 -->
          <img v-else-if="item.type === 'video' && item.thumbUrl" :src="item.thumbUrl" class="thumb" />
          <!-- 加载中 -->
          <div v-else-if="item.loading" class="thumb-placeholder">
            <i class="fas fa-spinner fa-spin"></i>
          </div>
          <!-- 无法预览 -->
          <div v-else class="thumb-placeholder">
            <i :class="item.type === 'video' ? 'fas fa-film' : 'fas fa-image'"></i>
          </div>
          <!-- 视频播放角标 -->
          <div v-if="item.type === 'video'" class="video-badge">
            <i class="fas fa-play"></i>
          </div>
          <!-- 类型标签 -->
          <div class="type-badge" :class="item.type">{{ item.type === 'video' ? '视频' : '图片' }}</div>
        </div>
        <div class="card-info">
          <div class="card-name" :title="item.name">{{ item.name }}</div>
          <div class="card-meta">
            <span>{{ item.sizeMB }} MB</span>
            <span>{{ formatTime(item.mtime) }}</span>
          </div>
        </div>
        <div class="card-actions">
          <el-tooltip content="在文件夹中显示" placement="top">
            <button class="action-btn" @click="showInFolder(item)"><i class="fas fa-folder-open"></i></button>
          </el-tooltip>
          <el-tooltip content="删除" placement="top">
            <button class="action-btn danger" @click="onDelete(item)"><i class="fas fa-trash"></i></button>
          </el-tooltip>
        </div>
      </div>
    </div>

    <!-- 自定义图片预览（原图，统一样式） -->
    <div v-if="previewVisible" class="preview-overlay" @click.self="closePreview">
      <!-- 顶部工具栏 -->
      <div class="preview-toolbar">
        <span class="preview-name">{{ previewItem?.name }}</span>
        <div class="preview-tools">
          <button class="preview-btn" title="上一张" :disabled="!canPrev" @click="prevImage">
            <i class="fas fa-chevron-left"></i>
          </button>
          <button class="preview-btn" title="下一张" :disabled="!canNext" @click="nextImage">
            <i class="fas fa-chevron-right"></i>
          </button>
          <button class="preview-btn" title="在文件夹中显示" @click="showInFolder(previewItem)">
            <i class="fas fa-folder-open"></i>
          </button>
          <button class="preview-btn preview-close" title="关闭" @click="closePreview">
            <i class="fas fa-times"></i>
          </button>
        </div>
      </div>
      <!-- 原图区 -->
      <div class="preview-body">
        <i v-if="previewLoading" class="fas fa-spinner fa-spin preview-spinner"></i>
        <img v-if="previewOriginalUrl && !previewLoading" :src="previewOriginalUrl" class="preview-img" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onActivated, onDeactivated } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh, Folder } from '@element-plus/icons-vue'

const items = ref([]) // [{name, path, type, sizeMB, mtime, thumbUrl, loading}]
const outputDir = ref('')
const filter = ref('all')

// 预览状态
const previewVisible = ref(false)
const previewOriginalUrl = ref('') // 当前预览的原图 dataUrl
const previewLoading = ref(false)
const previewList = ref([]) // 当前筛选下的图片列表（用于上一张/下一张）
const previewIndex = ref(0)
const previewItem = computed(() => previewList.value[previewIndex.value])
const canPrev = computed(() => previewIndex.value > 0)
const canNext = computed(() => previewIndex.value < previewList.value.length - 1)

const filteredItems = computed(() =>
  filter.value === 'all' ? items.value : items.value.filter((i) => i.type === filter.value)
)

const countByType = computed(() => ({
  image: items.value.filter((i) => i.type === 'image').length,
  video: items.value.filter((i) => i.type === 'video').length
}))

async function load() {
  const res = await window.api.historyList()
  outputDir.value = res.outputDir || ''
  if (!res.success) {
    ElMessage.error('扫描失败：' + res.error)
    return
  }
  // 转为响应式并异步加载缩略图
  items.value = res.items.map((it) =>
    reactive({ ...it, thumbUrl: '', loading: true })
  )
  // 并行加载所有缩略图
  for (const item of items.value) {
    loadThumb(item)
  }
}

async function loadThumb(item) {
  try {
    if (item.type === 'image') {
      // 用缩略图（最大边 300px），避免大图全量载入内存
      const res = await window.api.fileReadThumbnail(item.path, 300)
      if (res.success) item.thumbUrl = res.dataUrl
    } else if (item.type === 'video') {
      const res = await window.api.historyVideoThumb(item.path)
      if (res.success) item.thumbUrl = res.dataUrl
    }
  } catch {
    /* 缩略图加载失败不影响列表 */
  } finally {
    item.loading = false
  }
}

function onPreview(item) {
  if (item.type === 'image') {
    // 构建当前筛选下的图片列表（用于上一张/下一张）
    previewList.value = filteredItems.value.filter((i) => i.type === 'image')
    previewIndex.value = Math.max(0, previewList.value.findIndex((i) => i.path === item.path))
    previewVisible.value = true
    loadPreviewOriginal()
  } else if (item.type === 'video') {
    // 视频用系统默认播放器打开
    window.api.openPath(item.path)
  }
}

// 加载当前预览项的原图（高清，按需加载避免内存堆积）
async function loadPreviewOriginal() {
  const item = previewItem.value
  if (!item) return
  previewLoading.value = true
  previewOriginalUrl.value = ''
  const res = await window.api.fileReadAsDataUrl(item.path)
  if (res.success) previewOriginalUrl.value = res.dataUrl
  previewLoading.value = false
}

function prevImage() {
  if (!canPrev.value) return
  previewIndex.value--
  loadPreviewOriginal()
}

function nextImage() {
  if (!canNext.value) return
  previewIndex.value++
  loadPreviewOriginal()
}

function closePreview() {
  previewVisible.value = false
  previewOriginalUrl.value = '' // 清空释放内存
}

async function showInFolder(item) {
  await window.api.historyShowInFolder(item.path)
}

async function onDelete(item) {
  try {
    await ElMessageBox.confirm(`确认删除「${item.name}」？此操作不可恢复。`, '删除确认', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning'
    })
    const res = await window.api.historyDelete(item.path)
    if (res.success) {
      ElMessage.success('已删除')
      // 从列表移除
      items.value = items.value.filter((i) => i.path !== item.path)
    } else {
      ElMessage.error('删除失败：' + res.error)
    }
  } catch {
    /* 取消 */
  }
}

function openOutputDir() {
  window.api.workspaceOpenOutput()
}

function formatTime(ms) {
  if (!ms) return ''
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// keep-alive 下每次进入页面都会触发 activated（含首次），重新扫描 output 目录
onActivated(load)
// 离开时关闭预览层，避免返回时残留
onDeactivated(closePreview)
</script>

<style scoped>
.output-page {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* 工具栏：左筛选按钮组 + 右操作按钮组 */
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 10px;
}

.product-card {
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--el-border-radius-base);
  overflow: hidden;
  transition: transform 0.15s, box-shadow 0.15s;
}

.product-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--el-box-shadow-light);
}

.thumb-wrap {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
  background: var(--el-fill-color-darker);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.thumb-placeholder {
  color: var(--el-text-color-secondary);
  font-size: 32px;
}

.thumb-placeholder i {
  opacity: 0.4;
}

.video-badge {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  pointer-events: none;
}

.type-badge {
  position: absolute;
  top: 6px;
  right: 6px;
  padding: 1px 8px;
  font-size: 11px;
  color: #fff;
  border-radius: 8px;
}

.type-badge.image {
  background: rgba(64, 158, 255, 0.85);
}

.type-badge.video {
  background: rgba(103, 194, 58, 0.85);
}

.card-info {
  padding: 8px 10px;
}

.card-name {
  font-size: 12px;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-bottom: 4px;
}

.card-meta {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.card-actions {
  display: flex;
  gap: 4px;
  padding: 0 10px 10px;
}

.action-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--el-border-radius-small);
  color: var(--el-text-color-secondary);
  font-size: 12px;
  transition: background 0.15s, color 0.15s;
}

.action-btn:hover {
  background: var(--el-fill-color);
  color: var(--el-text-color-primary);
}

.action-btn.danger:hover {
  background: var(--el-color-danger-light-9);
  color: var(--el-color-danger);
}

/* 自定义图片预览弹窗 */
.preview-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.92);
  z-index: 2000;
  display: flex;
  flex-direction: column;
}

.preview-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: rgba(20, 22, 30, 0.95);
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.preview-name {
  font-size: 13px;
  color: #fff;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 50%;
}

.preview-tools {
  display: flex;
  gap: 4px;
}

.preview-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--el-border-radius-small);
  color: #ddd;
  font-size: 14px;
  transition: background 0.15s, color 0.15s;
}

.preview-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}

.preview-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.preview-close:hover {
  background: var(--el-color-danger);
  color: #fff;
}

.preview-body {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  padding: 20px;
}

.preview-img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  user-select: none;
  -webkit-user-drag: none;
}

.preview-spinner {
  font-size: 32px;
  color: #ddd;
}
</style>
