<template>
  <el-card class="settings-card" shadow="never">
    <template #header>
      <div class="card-title">
        <i class="fas fa-microchip"></i>
        <span>兼容性测试</span>
        <el-tag v-if="report" size="small" :type="levelTagType" effect="dark" class="level-tag">
          {{ levelText }}
        </el-tag>
      </div>
      <el-button
        type="primary"
        size="small"
        :loading="probing"
        :disabled="probing"
        @click="onProbe"
      >
        <i class="fas fa-rotate" style="margin-right: 4px"></i>{{ report ? '重新测试' : '开始测试' }}
      </el-button>
    </template>

    <!-- 未测试提示 -->
    <el-alert
      v-if="!report && !probing"
      title="尚未运行兼容性测试"
      type="info"
      :closable="false"
      show-icon
    >
      <template #default>
        建议先运行测试，以检测设备环境（CPU/内存/GPU/显存/Vulkan 运行时）并自动推荐可用引擎。
      </template>
    </el-alert>

    <!-- 测试中进度 -->
    <div v-if="probing" class="probe-progress">
      <el-steps :active="activeStepIndex" finish-status="success" simple>
        <el-step title="系统信息" />
        <el-step title="显卡检测" />
        <el-step title="Vulkan" />
        <el-step title="引擎探针" />
        <el-step title="生成推荐" />
      </el-steps>
    </div>

    <!-- 测试结果 -->
    <div v-if="report" class="report">
      <el-descriptions :column="2" border size="small">
        <el-descriptions-item label="CPU">
          {{ report.system.cpu.manufacturer }} {{ report.system.cpu.brand }}
        </el-descriptions-item>
        <el-descriptions-item label="核心">
          {{ report.system.cpu.physicalCores }} 物理核 / {{ report.system.cpu.cores }} 逻辑核
        </el-descriptions-item>
        <el-descriptions-item label="内存">
          {{ report.system.memory.totalGB }} GB（可用 {{ report.system.memory.freeGB }} GB）
        </el-descriptions-item>
        <el-descriptions-item label="系统">
          {{ report.system.os.distro }} {{ report.system.os.arch }}
        </el-descriptions-item>
      </el-descriptions>

      <div class="section-title">显卡</div>
      <div v-if="report.gpus.length === 0" class="empty-text">未检测到独立显卡</div>
      <div v-else class="gpu-list">
        <div v-for="(gpu, i) in report.gpus" :key="i" class="gpu-item">
          <span class="gpu-name">{{ gpu.vendor }} {{ gpu.model }}</span>
          <el-tag size="small" type="info">显存 {{ gpu.vramGB }} GB</el-tag>
        </div>
      </div>

      <div class="section-title">Vulkan 运行时</div>
      <div class="vulkan-status">
        <el-tag :type="report.vulkanRuntime.installed ? 'success' : 'danger'" effect="dark">
          {{ report.vulkanRuntime.installed ? '已安装' : '未安装' }}
        </el-tag>
        <span v-if="report.vulkanRuntime.installed" class="vulkan-ok-hint">
          超分引擎可正常运行
        </span>
        <span v-else class="vulkan-hint">
          {{ report.vulkanRuntime.reason }}
        </span>
      </div>

      <div class="section-title">引擎可用性</div>
      <div class="engine-tags">
        <el-tag v-for="eng in report.engines" :key="eng.id" :type="eng.available ? 'success' : 'info'" effect="plain" size="small">
          <i :class="eng.available ? 'fas fa-check' : 'fas fa-xmark'" style="margin-right: 4px"></i>
          {{ eng.name }}
        </el-tag>
      </div>

      <div class="section-title">推荐配置</div>
      <el-descriptions :column="2" border size="small">
        <el-descriptions-item label="推荐倍率上限">{{ report.recommended.maxScale }}x</el-descriptions-item>
        <el-descriptions-item label="视频超分">
          <el-tag :type="report.recommended.videoSuperRes ? 'success' : 'info'" size="small">
            {{ report.recommended.videoSuperRes ? '支持' : '不推荐' }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="视频插帧">
          <el-tag :type="report.recommended.videoInterp ? 'success' : 'info'" size="small">
            {{ report.recommended.videoInterp ? '支持' : '不推荐' }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="推荐并发">{{ report.recommended.concurrency }}</el-descriptions-item>
      </el-descriptions>

      <div class="report-time">检测时间：{{ formatTime(report.probedAt || report.updatedAt) }}</div>
    </div>
  </el-card>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { ElMessage } from 'element-plus'

const report = ref(null)
const probing = ref(false)
const activeStep = ref('') // 当前进行中的阶段名

const STAGE_ORDER = ['system', 'graphics', 'vulkan', 'engines', 'recommend']

const activeStepIndex = computed(() => {
  const idx = STAGE_ORDER.indexOf(activeStep.value)
  return idx < 0 ? 0 : idx
})

const levelTagType = computed(() => {
  const level = report.value?.recommended?.level
  const map = { high: 'success', medium: 'primary', low: 'warning', minimal: 'danger' }
  return map[level] || 'info'
})

const levelText = computed(() => {
  const map = { high: '高性能', medium: '中等', low: '入门', minimal: '最低配置' }
  return map[report.value?.recommended?.level] || ''
})

async function loadReport() {
  report.value = await window.api.deviceReport()
}

function onProbeProgress(data) {
  activeStep.value = data.stage
}

async function onProbe() {
  probing.value = true
  activeStep.value = 'system'
  try {
    const res = await window.api.deviceProbe()
    if (res.success) {
      report.value = res.report
      ElMessage.success('兼容性测试完成')
    } else {
      ElMessage.error(res.error || '测试失败')
    }
  } catch (e) {
    ElMessage.error('测试异常：' + e.message)
  } finally {
    probing.value = false
    activeStep.value = ''
  }
}

function formatTime(iso) {
  if (!iso) return '-'
  try {
    const d = new Date(iso)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  } catch {
    return iso
  }
}

onMounted(() => {
  loadReport()
  window.api.deviceProbeOnProgress(onProbeProgress)
})

onBeforeUnmount(() => {
  window.api.deviceProbeOffProgress()
})
</script>

<style scoped>
.card-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.level-tag {
  margin-left: 4px;
}

:deep(.el-card__header) {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.probe-progress {
  padding: 8px 0;
}

.section-title {
  margin-top: 16px;
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-color-primary);
  border-bottom: 1px solid var(--el-border-color-lighter);
  padding-bottom: 4px;
}

.gpu-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.gpu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.gpu-name {
  color: var(--el-text-color-primary);
}

/* 引擎可用性：纯标签水平排列，宽度足够时一行显示 */
.engine-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.vulkan-status {
  display: flex;
  align-items: center;
  gap: 8px;
}

.vulkan-hint {
  font-size: 12px;
  color: var(--el-color-danger);
}

.vulkan-ok-hint {
  font-size: 12px;
  color: var(--el-color-success);
}

.empty-text {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.report-time {
  margin-top: 16px;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}
</style>
