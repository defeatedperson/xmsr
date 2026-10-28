<template>
  <el-card class="settings-card" shadow="never">
    <template #header>
      <div class="card-title">
        <i class="fas fa-hard-drive"></i>
        <span>磁盘空间监控</span>
      </div>
      <el-button :icon="Refresh" size="small" @click="load">刷新</el-button>
    </template>

    <div v-if="disk.success" class="disk-info">
      <div class="disk-row">
        <span class="disk-label">监控目录</span>
        <span class="disk-value">{{ disk.path }}</span>
      </div>
      <div class="disk-row">
        <span class="disk-label">可用空间</span>
        <span class="disk-value disk-available" :class="{ low: isLow }">
          {{ disk.availableGB }} GB
          <span class="disk-total">/ {{ disk.totalGB }} GB</span>
        </span>
      </div>
      <el-progress
        :percentage="usedPercentage"
        :color="progressColor"
        :stroke-width="14"
        :format="() => `已用 ${usedPercentage}%`"
      />
      <div v-if="isLow" class="disk-warn">
        <i class="fas fa-triangle-exclamation"></i>
        磁盘空间不足，视频处理等大体积任务可能失败。建议清理缓存或更换工作目录。
      </div>
    </div>
    <div v-else class="empty-text">查询失败：{{ disk.error }}</div>
  </el-card>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { Refresh } from '@element-plus/icons-vue'

const disk = ref({ success: false })

const usedPercentage = computed(() => {
  if (!disk.value.success || !disk.value.total) return 0
  const used = disk.value.total - disk.value.available
  return Math.round((used / disk.value.total) * 100)
})

// 颜色只由已用百分比决定（避免与绝对值判断不一致导致跳变）
const progressColor = computed(() => {
  const p = usedPercentage.value
  if (p >= 90) return '#f56c6c'
  if (p >= 80) return '#e6a23c'
  return '#67c23a'
})

// 空间不足警告（基于百分比，与颜色一致）
const isLow = computed(() => disk.value.success && usedPercentage.value >= 90)

async function load() {
  disk.value = await window.api.diskSpace(null)
}

// 暴露给父组件，工作目录变更后可调用刷新
defineExpose({ reload: load })

onMounted(load)
</script>

<style scoped>
.card-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

:deep(.el-card__header) {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.disk-info {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.disk-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.disk-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  width: 70px;
  flex-shrink: 0;
}

.disk-value {
  font-size: 14px;
  color: var(--el-text-color-primary);
  word-break: break-all;
}

.disk-available {
  font-size: 18px;
  font-weight: 600;
}

.disk-available.low {
  color: var(--el-color-danger);
}

.disk-total {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-weight: normal;
}

.disk-warn {
  margin-top: 4px;
  padding: 8px 12px;
  background: var(--el-color-danger-light-9);
  border-radius: var(--el-border-radius-base);
  color: var(--el-color-danger);
  font-size: 12px;
}

.empty-text {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
</style>
