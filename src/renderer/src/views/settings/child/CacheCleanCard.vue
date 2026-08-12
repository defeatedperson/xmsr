<template>
  <el-card class="settings-card" shadow="never">
    <template #header>
      <div class="card-title">
        <i class="fas fa-broom"></i>
        <span>缓存清理</span>
      </div>
      <el-button :icon="Refresh" size="small" @click="load">刷新</el-button>
    </template>

    <div class="cache-row">
      <div class="cache-info">
        <div class="info-label">当前缓存占用</div>
        <div class="info-value" :class="{ 'has-cache': sizeMB > 0 }">
          {{ sizeMB > 0 ? sizeMB + ' MB' : '0（无缓存）' }}
        </div>
        <div class="info-hint">
          缓存包含视频处理时的拆帧、临时超分文件等。任务成功后会自动清理，这里可手动清理残留。
        </div>
      </div>
      <el-button
        type="danger"
        plain
        :icon="Delete"
        :loading="cleaning"
        :disabled="sizeMB === 0"
        @click="onClean"
      >
        清理缓存
      </el-button>
    </div>
  </el-card>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh, Delete } from '@element-plus/icons-vue'

const sizeMB = ref(0)
const cleaning = ref(false)

async function load() {
  const res = await window.api.cacheSize()
  sizeMB.value = res.success ? parseFloat(res.sizeMB) || 0 : 0
}

// 暴露给父组件，工作目录变更/缓存清理后可调用刷新
const emit = defineEmits(['changed'])
defineExpose({ reload: load })

async function onClean() {
  try {
    await ElMessageBox.confirm(
      `确认清理 ${sizeMB.value} MB 缓存？这将删除所有临时文件，不影响已生成的成品。`,
      '清理缓存',
      { confirmButtonText: '清理', cancelButtonText: '取消', type: 'warning' }
    )
    cleaning.value = true
    const res = await window.api.cacheClean()
    if (res.success) {
      ElMessage.success(`已清理 ${res.cleanedMB} MB`)
      await load()
      emit('changed') // 通知磁盘监控刷新
    } else {
      ElMessage.error('清理失败：' + res.error)
    }
  } catch {
    /* 取消 */
  } finally {
    cleaning.value = false
  }
}

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

.cache-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}

.cache-info {
  flex: 1;
  min-width: 0;
}

.info-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 4px;
}

.info-value {
  font-size: 22px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin-bottom: 4px;
}

.info-value.has-cache {
  color: var(--el-color-warning);
}

.info-hint {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  line-height: 1.5;
}
</style>
