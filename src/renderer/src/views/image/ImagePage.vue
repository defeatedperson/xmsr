<template>
  <div class="image-page">
    <!-- 左右两栏 -->
    <div class="main-layout">
      <!-- 左：图片选择区 -->
      <el-card class="left-panel" shadow="never">
        <template #header>
          <div class="panel-title">
            <i class="fas fa-images"></i>
            <span>选择图片</span>
            <span class="count">{{ selectedImages.length }} 张</span>
          </div>
        </template>

        <!-- 拖拽区 -->
        <div
          class="drop-zone"
          :class="{ dragging }"
          @click="onPickFiles"
          @dragover.prevent="dragging = true"
          @dragleave.prevent="dragging = false"
          @drop.prevent="onDrop"
        >
          <i class="fas fa-cloud-arrow-up"></i>
          <span>点击选择 或 拖拽图片到此处</span>
          <span class="formats">支持 PNG / JPG / WebP / BMP</span>
        </div>

        <!-- 缩略图列表 -->
        <div class="thumb-list" v-if="selectedImages.length">
          <div v-for="(img, i) in selectedImages" :key="i" class="thumb-item">
            <div class="thumb-wrap">
              <img v-if="img.dataUrl" :src="img.dataUrl" class="thumb" />
              <i v-else-if="img.loading" class="fas fa-spinner fa-spin thumb-placeholder"></i>
              <i v-else class="fas fa-image thumb-placeholder error"></i>
            </div>
            <span class="thumb-name" :title="img.name">{{ img.name }}</span>
            <button class="thumb-del" @click="removeImage(i)">
              <i class="fas fa-xmark"></i>
            </button>
          </div>
        </div>
      </el-card>

      <!-- 右：参数 + 操作 -->
      <el-card class="right-panel" shadow="never">
        <template #header>
          <div class="panel-title">
            <i class="fas fa-sliders"></i>
            <span>超分设置</span>
          </div>
        </template>

        <PresetPicker @apply="applyPreset" />

        <el-divider />

        <EngineSelector v-model="engineConfig" />

        <el-divider />

        <ParamPanel
          v-model="paramConfig"
          :supports-denoise="engineConfig.supportsDenoise"
          :denoise-levels="engineConfig.denoiseLevels"
        />

        <el-divider />

        <!-- 开始按钮 -->
        <div class="action-bar">
          <div class="estimate" v-if="estimateInfo">
            预计需要 <strong>{{ estimateInfo.requiredGB }} GB</strong>
            磁盘空间（可用 {{ estimateInfo.availableGB }} GB）
            <el-tag v-if="estimateInfo.enough" type="success" size="small">充足</el-tag>
            <el-tag v-else type="danger" size="small">不足</el-tag>
          </div>
          <el-button
            type="primary"
            size="large"
            :loading="processing"
            :disabled="!canStart"
            @click="onStart"
          >
            <i class="fas fa-play" style="margin-right: 6px"></i>
            {{ processing ? '处理中...' : '开始超分' }}
          </el-button>
          <el-button v-if="processing" @click="onCancel">取消</el-button>
        </div>

        <!-- 进度 -->
        <div v-if="processing || progressInfo" class="progress-area">
          <el-progress :percentage="progressInfo?.progress || 0" :status="progressStatus" />
          <div class="progress-text">
            {{ progressInfo?.currentName ? `正在处理：${progressInfo.currentName}` : '' }}
            ({{ progressInfo?.current || 0 }} / {{ progressInfo?.total || 0 }})
          </div>
        </div>
      </el-card>
    </div>

    <!-- 结果对比区（处理完成后显示） -->
    <el-card v-if="results.length" class="result-panel" shadow="never">
      <template #header>
        <div class="panel-title">
          <i class="fas fa-check-circle"></i>
          <span>处理结果（{{ results.length }} 张）</span>
          <el-button size="small" :icon="Folder" @click="openOutput">打开输出目录</el-button>
        </div>
      </template>
      <BeforeAfterSlider
        v-if="currentResult"
        :before="displayBefore"
        :after="displayAfter"
      />
      <div class="result-tabs">
        <div
          v-for="(r, i) in results"
          :key="i"
          class="result-tab"
          :class="{ active: currentResultIdx === i, failed: !r.success }"
          @click="currentResultIdx = i"
        >
          <img v-if="r.dataUrl" :src="r.dataUrl" class="result-thumb" />
          <i v-else-if="r.success" class="fas fa-spinner fa-spin"></i>
          <i v-else class="fas fa-triangle-exclamation failed-icon"></i>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { ElMessage } from 'element-plus'
import { Folder } from '@element-plus/icons-vue'
import EngineSelector from '@renderer/components/EngineSelector.vue'
import ParamPanel from '@renderer/components/ParamPanel.vue'
import PresetPicker from '@renderer/components/PresetPicker.vue'
import BeforeAfterSlider from '@renderer/components/BeforeAfterSlider.vue'

const selectedImages = ref([]) // [{path, name}]
const dragging = ref(false)
const engineConfig = ref({ engineId: '', model: '', scale: 2 })
const paramConfig = ref({ denoise: 0, format: 'png' })

const processing = ref(false)
const progressInfo = ref(null)
const currentTaskId = ref(null)
const results = ref([]) // [{input, output, success, dataUrl, beforeUrl}]
const currentResultIdx = ref(0)
const estimateInfo = ref(null)

const canStart = computed(
  () => selectedImages.value.length > 0 && engineConfig.value.engineId && !processing.value
)

const currentResult = computed(() => results.value[currentResultIdx.value])

// 当前展示的原图（高清，切换时按需加载，避免一次全量载入）
const displayBefore = ref('')
const displayAfter = ref('')

// 切换选中项时，加载该结果的原图（before/after）
watch(currentResultIdx, () => {
  loadCurrentDisplay()
})

const progressStatus = computed(() => {
  if (!progressInfo.value) return ''
  return progressInfo.value.progress >= 100 ? 'success' : ''
})

// ===== 选图 =====
async function onPickFiles() {
  const files = await window.api.pickFiles({})
  if (files && files.length) {
    addImages(files)
  }
}

function onDrop(e) {
  dragging.value = false
  const files = [...(e.dataTransfer?.files || [])].map((f) => f.path)
  // 过滤图片
  const imgExts = ['.png', '.jpg', '.jpeg', '.webp', '.bmp']
  const imgs = files.filter((f) => imgExts.some((ext) => f.toLowerCase().endsWith(ext)))
  if (imgs.length) addImages(imgs)
}

function addImages(paths) {
  for (const p of paths) {
    const name = p.split(/[\\/]/).pop()
    if (!selectedImages.value.find((i) => i.path === p)) {
      const img = reactive({ path: p, name, dataUrl: '', loading: true })
      selectedImages.value.push(img)
      // 异步加载缩略图 dataUrl（主进程读文件→base64）
      loadThumb(img)
    }
  }
  updateEstimate()
}

async function loadThumb(img) {
  try {
    const res = await window.api.fileReadThumbnail(img.path, 120)
    if (res.success) {
      img.dataUrl = res.dataUrl
    } else {
      img.dataUrl = ''
    }
  } catch {
    img.dataUrl = ''
  } finally {
    img.loading = false
  }
}

function removeImage(idx) {
  selectedImages.value.splice(idx, 1)
  updateEstimate()
}

// ===== 磁盘估算 =====
async function updateEstimate() {
  if (!selectedImages.value.length) {
    estimateInfo.value = null
    return
  }
  estimateInfo.value = await window.api.taskEstimate({
    images: selectedImages.value.map((i) => ({ path: i.path })),
    scale: engineConfig.value.scale,
    format: paramConfig.value.format
  })
}

watch(() => [engineConfig.value.scale, paramConfig.value.format], updateEstimate)

// ===== 预设 =====
function applyPreset(preset) {
  engineConfig.value = {
    engineId: preset.engine,
    model: preset.model,
    scale: preset.scale
  }
  paramConfig.value = {
    denoise: preset.denoise ?? 0,
    format: preset.format || 'png'
  }
  ElMessage.success(`已应用预设：${preset.name}`)
}

// ===== 执行超分 =====
async function onStart() {
  processing.value = true
  progressInfo.value = { progress: 0, current: 0, total: selectedImages.value.length }
  results.value = []
  currentResultIdx.value = 0

  const res = await window.api.taskCreate({
    type: 'image',
    title: `图片超分 ${selectedImages.value.length}张`,
    engineId: engineConfig.value.engineId,
    params: {
      model: engineConfig.value.model,
      scale: engineConfig.value.scale,
      denoise: paramConfig.value.denoise,
      format: paramConfig.value.format
    },
    images: selectedImages.value.map((i) => ({ path: i.path }))
  })

  if (!res.success) {
    if (res.reason === 'disk_full') {
      ElMessage.error(`磁盘空间不足：需要 ${res.requiredGB} GB，可用 ${res.availableGB} GB`)
    } else {
      ElMessage.error('任务创建失败')
    }
    processing.value = false
    return
  }

  currentTaskId.value = res.task.id
}

async function onCancel() {
  if (currentTaskId.value) {
    await window.api.taskCancel(currentTaskId.value)
    ElMessage.info('已取消')
  }
}

function openOutput() {
  window.api.workspaceOpenOutput()
}

// ===== 进度监听 =====
function onTaskProgress(data) {
  // keep-alive 下多页面监听器并存，严格过滤：无任务或非本页面任务的事件一律忽略
  if (!currentTaskId.value || data.taskId !== currentTaskId.value) return
  progressInfo.value = { ...progressInfo.value, ...data }

  // 任务终态
  if (['done', 'failed', 'canceled'].includes(data.status)) {
    processing.value = false
    if (data.status === 'done') {
      // 拉取任务详情获取结果
      fetchResults()
      ElMessage.success('超分完成')
    } else if (data.status === 'failed') {
      ElMessage.error('超分失败：' + (data.error || '未知错误'))
    } else if (data.status === 'canceled') {
      ElMessage.info('已取消')
    }
  }
}

async function fetchResults() {
  if (!currentTaskId.value) return
  const detail = await window.api.taskDetail(currentTaskId.value)
  if (detail?.results) {
    // 转为响应式并异步加载 dataUrl（原图 + 结果图）
    results.value = detail.results.map((r) =>
      reactive({ ...r, dataUrl: '', beforeUrl: '' })
    )
    currentResultIdx.value = 0
    // 找第一个成功的作为当前展示
    const firstOk = results.value.findIndex((r) => r.success)
    if (firstOk >= 0) currentResultIdx.value = firstOk
    // 加载底部 tabs 的小缩略图（120px，仅超分结果）
    for (const r of results.value) {
      if (r.success && r.output) {
        window.api.fileReadThumbnail(r.output, 120).then((res) => {
          if (res.success) r.dataUrl = res.dataUrl
        })
      }
    }
    // 触发当前项的原图加载（watch currentResultIdx）
    // 若 firstOk 没变（仍是 0），watch 不触发，手动调一次
    if (currentResultIdx.value === 0) {
      loadCurrentDisplay()
    }
  }
}

// 加载当前选中结果的原图（高清）
async function loadCurrentDisplay() {
  displayBefore.value = ''
  displayAfter.value = ''
  const r = currentResult.value
  if (!r) return
  if (r.input) {
    const res = await window.api.fileReadAsDataUrl(r.input)
    if (res.success) displayBefore.value = res.dataUrl
  }
  if (r.success && r.output) {
    const res = await window.api.fileReadAsDataUrl(r.output)
    if (res.success) displayAfter.value = res.dataUrl
  }
}

onMounted(() => {
  window.api.taskOnProgress(onTaskProgress)
})
onBeforeUnmount(() => {
  window.api.taskOffProgress()
})
</script>

<style scoped>
.image-page {
  display: flex;
  flex-direction: column;
  gap: 10px;
  /* 不设 height:100%，让内容自然撑开，由外层 el-main 负责整页滚动 */
}

.main-layout {
  display: grid;
  grid-template-columns: 380px 1fr;
  gap: 10px;
}

.panel-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.panel-title .count {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-weight: normal;
}

/* 拖拽区 */
.drop-zone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 40px 20px;
  border: 2px dashed var(--el-border-color);
  border-radius: var(--el-border-radius-base);
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s;
  color: var(--el-text-color-secondary);
}

.drop-zone:hover,
.drop-zone.dragging {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}

.drop-zone i {
  font-size: 32px;
  color: var(--el-color-primary);
}

.drop-zone .formats {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
}

/* 缩略图列表 */
.thumb-list {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 300px;
  overflow-y: auto;
}

.thumb-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px;
  background: var(--el-fill-color-light);
  border-radius: var(--el-border-radius-small);
}

.thumb-wrap {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: var(--el-fill-color-darker);
  border-radius: 4px;
}

.thumb {
  width: 40px;
  height: 40px;
  object-fit: cover;
  border-radius: 4px;
}

.thumb-placeholder {
  font-size: 16px;
  color: var(--el-text-color-secondary);
}

.thumb-placeholder.error {
  color: var(--el-color-danger);
}

.thumb-name {
  flex: 1;
  font-size: 12px;
  color: var(--el-text-color-regular);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.thumb-del {
  color: var(--el-text-color-secondary);
  padding: 4px;
}

.thumb-del:hover {
  color: var(--el-color-danger);
}

/* 操作区 */
.action-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.estimate {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.progress-area {
  margin-top: 16px;
}

.progress-text {
  margin-top: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

/* 结果区：使用 el-card 默认布局，不覆盖 */
.result-tabs {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  overflow-x: auto;
  padding-bottom: 4px;
}

.result-tab {
  width: 60px;
  height: 60px;
  border-radius: 4px;
  overflow: hidden;
  cursor: pointer;
  border: 2px solid transparent;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--el-fill-color);
}

.result-tab.active {
  border-color: var(--el-color-primary);
}

.result-tab.failed {
  background: var(--el-color-danger-light-9);
}

.result-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.failed-icon {
  color: var(--el-color-danger);
}
</style>
