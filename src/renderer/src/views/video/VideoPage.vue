<template>
  <div class="video-page">
    <div class="main-layout">
      <!-- 左：视频选择 -->
      <el-card class="left-panel" shadow="never">
        <template #header>
          <div class="panel-title">
            <i class="fas fa-film"></i>
            <span>选择视频</span>
          </div>
        </template>

        <div
          class="drop-zone"
          :class="{ dragging }"
          @click="onPickVideo"
          @dragover.prevent="dragging = true"
          @dragleave.prevent="dragging = false"
          @drop.prevent="onDrop"
        >
          <i class="fas fa-cloud-arrow-up"></i>
          <span>点击选择 或 拖拽视频到此处</span>
          <span class="formats">支持 MP4 / MKV / MOV / WEBM / AVI</span>
        </div>

        <div v-if="videoPath" class="video-info">
          <i class="fas fa-file-video"></i>
          <div class="video-meta">
            <div class="video-name" :title="videoName">{{ videoName }}</div>
            <div class="video-hint">已选择</div>
          </div>
          <button class="thumb-del" @click="clearVideo">
            <i class="fas fa-xmark"></i>
          </button>
        </div>
      </el-card>

      <!-- 右：参数 -->
      <el-card class="right-panel" shadow="never">
        <template #header>
          <div class="panel-title">
            <i class="fas fa-sliders"></i>
            <span>视频超分设置</span>
          </div>
        </template>

        <div class="section-label">超分引擎</div>
        <EngineSelector v-model="engineConfig" />

        <el-divider />

        <div class="section-label">插帧（可选）</div>
        <div class="param-row">
          <el-switch v-model="interpEnabled" />
          <span class="param-hint">启用 RIFE 视频插帧（提升流畅度）</span>
        </div>
        <div v-if="interpEnabled" class="param-row">
          <span class="label">预期帧率</span>
          <el-radio-group v-model="targetFps">
            <el-radio-button :value="30">30 fps</el-radio-button>
            <el-radio-button :value="60">60 fps</el-radio-button>
            <el-radio-button :value="120">120 fps</el-radio-button>
          </el-radio-group>
          <span class="param-hint">插帧按源帧率的整数倍进行，实际输出帧率至少达到该值（可能略高），视频时长与速度保持不变</span>
        </div>

        <el-divider />

        <div class="section-label">输出</div>
        <div class="param-row">
          <span class="label">CRF 质量</span>
          <el-slider v-model="crf" :min="18" :max="28" :step="1" show-input style="flex:1; max-width: 400px" />
          <span class="param-hint">{{ crf <= 20 ? '高画质' : crf <= 24 ? '均衡' : '小体积' }}</span>
        </div>
        <div class="param-row">
          <span class="label">并发数</span>
          <el-input-number v-model="concurrency" :min="1" :max="4" :step="1" />
          <span class="param-hint">超分帧的并行进程数（越大越快但越占显存）</span>
        </div>

        <el-divider />

        <div class="action-bar">
          <div class="estimate" v-if="diskEstimate">
            预计需要 <strong :class="{ warn: !diskEstimate.enough }">{{ diskEstimate.requiredGB }} GB</strong>
            （可用 {{ diskEstimate.availableGB }} GB）
            <el-tag v-if="diskEstimate.enough" type="success" size="small">充足</el-tag>
            <el-tag v-else type="danger" size="small">可能不足</el-tag>
          </div>
          <el-button
            type="primary"
            size="large"
            :loading="processing"
            :disabled="!videoPath || !engineConfig.engineId"
            @click="onStart"
          >
            <i class="fas fa-play" style="margin-right: 6px"></i>
            {{ processing ? '处理中...' : '开始视频超分' }}
          </el-button>
          <el-button v-if="processing" @click="onCancel">取消</el-button>
        </div>
      </el-card>
    </div>

    <!-- 处理进度 -->
    <el-card v-if="processing || taskDone" class="progress-panel" shadow="never">
      <template #header>
        <div class="panel-title">
          <i class="fas fa-tasks"></i>
          <span>处理进度</span>
          <el-tag v-if="taskDone" :type="finalStatusType" size="small">{{ finalStatusText }}</el-tag>
        </div>
      </template>

      <!-- 阶段步骤 -->
      <el-steps :active="activeStepIdx" finish-status="success" :align-center="false" class="stage-steps">
        <el-step title="探测视频" :status="stageStatus('probe')" />
        <el-step title="拆帧" :status="stageStatus('extract')" />
        <el-step title="超分" :status="stageStatus('superres')" />
        <el-step title="插帧" :status="stageStatus('interp')" :description="interpEnabled ? '' : '跳过'" />
        <el-step title="合成" :status="stageStatus('compose')" />
      </el-steps>

      <!-- 当前阶段进度条 -->
      <div v-if="processing" class="current-progress">
        <div class="progress-label">{{ currentStageName || '准备中...' }}</div>
        <el-progress :percentage="currentPercent" :status="currentPercent >= 100 ? 'success' : ''" />
      </div>

      <!-- 日志 -->
      <div class="log-area">
        <div v-for="(line, i) in logs" :key="i" class="log-line">{{ line }}</div>
      </div>

      <!-- 结果 -->
      <div v-if="taskDone && finalStatus === 'done'" class="result-actions">
        <el-button type="primary" :icon="Folder" @click="openOutput">打开输出目录</el-button>
        <span class="result-path">{{ outputPath || '已完成' }}</span>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Folder } from '@element-plus/icons-vue'
import EngineSelector from '@renderer/components/EngineSelector.vue'

const videoPath = ref('')
const dragging = ref(false)
const engineConfig = ref({ engineId: '', model: '', scale: 2 })
const interpEnabled = ref(false)
const targetFps = ref(60)
const crf = ref(20)
const concurrency = ref(1)

const processing = ref(false)
const taskDone = ref(false)
const currentTaskId = ref(null)
const currentStage = ref('')
const currentStageName = ref('')
const currentPercent = ref(0)
const stageStates = ref({}) // probe/extract/...: running/done
const logs = ref([])
const diskEstimate = ref(null)
const outputPath = ref('')
const finalStatus = ref('') // done/failed/canceled

const STAGE_ORDER = ['probe', 'extract', 'superres', 'interp', 'compose']
const STAGE_NAMES = {
  probe: '探测视频信息',
  extract: '阶段1 拆帧',
  superres: '阶段2 超分每帧',
  interp: '阶段3 插帧',
  compose: '阶段4 合成视频'
}

const videoName = computed(() => videoPath.value.split(/[\\/]/).pop() || '')

const activeStepIdx = computed(() => {
  // 已完成的阶段数（未启用插帧时 interp 不计入）
  const stages = interpEnabled.value
    ? STAGE_ORDER
    : STAGE_ORDER.filter((s) => s !== 'interp')
  const done = stages.filter((s) => stageStates.value[s] === 'done').length
  return done
})

const finalStatusType = computed(() => ({
  done: 'success',
  failed: 'danger',
  canceled: 'info'
}[finalStatus.value] || ''))
const finalStatusText = computed(() => ({
  done: '完成',
  failed: '失败',
  canceled: '已取消'
}[finalStatus.value] || ''))

function stageStatus(stage) {
  const state = stageStates.value[stage]
  if (state === 'done') return 'success'
  if (state === 'running') return 'process'
  if (stage === 'interp' && !interpEnabled.value) return 'wait'
  return 'wait'
}

async function onPickVideo() {
  const picked = await window.api.pickVideo()
  if (picked) {
    videoPath.value = picked
    updateEstimate()
  }
}

function onDrop(e) {
  dragging.value = false
  const files = [...(e.dataTransfer?.files || [])].map((f) => f.path)
  const videoExts = ['.mp4', '.mkv', '.mov', '.avi', '.webm', '.flv']
  const v = files.find((f) => videoExts.some((ext) => f.toLowerCase().endsWith(ext)))
  if (v) {
    videoPath.value = v
    updateEstimate()
  }
}

function clearVideo() {
  videoPath.value = ''
  diskEstimate.value = null
}

async function updateEstimate() {
  if (!videoPath.value) {
    diskEstimate.value = null
    return
  }
  // 通过 task:estimate 的 video 变体估算（简化：复用 probe + 估算）
  // 这里先留空，实际估算在提交任务时由主进程 probe 后返回
}

async function onStart() {
  // 提交前确认（视频任务耗时长）
  try {
    await ElMessageBox.confirm(
      `即将对视频进行超分（${engineConfig.value.scale}x）${interpEnabled.value ? ' + 插帧(预期 ≥' + targetFps.value + 'fps)' : ''}。\n视频处理耗时较长，期间请勿关闭程序。确认开始？`,
      '视频超分确认',
      { confirmButtonText: '开始', cancelButtonText: '取消', type: 'warning' }
    )
  } catch {
    return
  }

  processing.value = true
  taskDone.value = false
  logs.value = []
  stageStates.value = {}
  currentStage.value = ''
  currentPercent.value = 0
  finalStatus.value = ''
  outputPath.value = ''

  const res = await window.api.taskCreate({
    type: 'video',
    title: `视频超分 ${videoName.value}`,
    videoPath: videoPath.value,
    engineId: engineConfig.value.engineId,
    params: {
      model: engineConfig.value.model,
      scale: engineConfig.value.scale,
      // 不传 denoise：视频页未提供降噪选择，由主进程按引擎安全默认值处理
      // （realcugan 默认 -1 无降噪，避免部分模型无降噪文件导致引擎崩溃）
      crf: crf.value
    },
    interp: interpEnabled.value ? { enabled: true, engineId: 'rife', targetFps: targetFps.value } : { enabled: false },
    concurrency: concurrency.value
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
  // 主进程返回的磁盘估算（放在返回值顶层）
  if (res.diskEstimate) {
    diskEstimate.value = res.diskEstimate
  }
}

async function onCancel() {
  if (currentTaskId.value) {
    await window.api.taskCancel(currentTaskId.value)
  }
}

function openOutput() {
  window.api.workspaceOpenOutput()
}

function onTaskProgress(data) {
  // keep-alive 下多页面监听器并存，严格过滤：无任务或非本页面任务的事件一律忽略
  if (!currentTaskId.value || data.taskId !== currentTaskId.value) return

  if (data.stage) {
    currentStage.value = data.stage
    currentStageName.value = data.stageName || STAGE_NAMES[data.stage] || data.stage
    if (data.stageStatus === 'running') {
      stageStates.value[data.stage] = 'running'
    } else if (data.stageStatus === 'done') {
      stageStates.value[data.stage] = 'done'
    }
  }
  if (data.progress !== undefined) {
    currentPercent.value = data.progress
  }
  if (data.log) {
    logs.value.push(data.log)
    if (logs.value.length > 200) logs.value.shift()
  }
  if (data.info) {
    // probe 信息可展示
  }

  // 终态
  if (['done', 'failed', 'canceled'].includes(data.status)) {
    processing.value = false
    taskDone.value = true
    finalStatus.value = data.status
    if (data.status === 'done') {
      if (data.results?.[0]?.output) outputPath.value = data.results[0].output
      ElMessage.success('视频超分完成')
    } else if (data.status === 'failed') {
      ElMessage.error('失败：' + (data.error || '未知错误'))
    } else {
      ElMessage.info('已取消')
    }
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
.video-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
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

.drop-zone {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 50px 20px;
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
  font-size: 36px;
  color: var(--el-color-primary);
}

.formats {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
}

.video-info {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
  padding: 10px;
  background: var(--el-fill-color-light);
  border-radius: var(--el-border-radius-small);
}

.video-info > i {
  font-size: 28px;
  color: var(--el-color-primary);
}

.video-meta {
  flex: 1;
  min-width: 0;
}

.video-name {
  font-size: 13px;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.video-hint {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.thumb-del {
  color: var(--el-text-color-secondary);
  padding: 4px;
  font-size: 14px;
}

.thumb-del:hover {
  color: var(--el-color-danger);
}

.section-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-color-primary);
  margin-bottom: 10px;
}

.param-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.label {
  font-size: 13px;
  color: var(--el-text-color-regular);
  width: 70px;
  flex-shrink: 0;
}

.param-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

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

.estimate .warn {
  color: var(--el-color-danger);
}

.stage-steps {
  margin-bottom: 20px;
}

.current-progress {
  margin-bottom: 16px;
}

.progress-label {
  font-size: 13px;
  color: var(--el-text-color-regular);
  margin-bottom: 6px;
}

.log-area {
  max-height: 160px;
  overflow-y: auto;
  background: var(--el-fill-color-darker);
  border-radius: var(--el-border-radius-small);
  padding: 8px 12px;
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.log-line {
  line-height: 1.6;
  word-break: break-all;
}

.result-actions {
  margin-top: 16px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.result-path {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  word-break: break-all;
}
</style>
