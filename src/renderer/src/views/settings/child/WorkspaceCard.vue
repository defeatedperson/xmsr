<template>
  <el-card class="settings-card" shadow="never">
    <template #header>
      <div class="card-title">
        <i class="fas fa-folder-open"></i>
        <span>工作目录</span>
      </div>
    </template>

    <div class="workspace-row">
      <div class="workspace-info">
        <div class="info-label">当前工作目录</div>
        <div class="info-value">{{ workspace || '未设置' }}</div>
        <div class="info-hint">用于存放处理过程中的缓存和生成的成品文件。视频处理会产生大量临时文件，建议放在空间充足的磁盘。</div>
      </div>
      <div class="workspace-actions">
        <el-button :icon="Folder" @click="onPick">选择目录</el-button>
        <el-button :icon="Refresh" :loading="migrating" @click="onMigrate">迁移内容到此</el-button>
      </div>
    </div>
  </el-card>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Folder, Refresh } from '@element-plus/icons-vue'

const emit = defineEmits(['changed'])

const workspace = ref('')
const defaultWs = ref('')
const migrating = ref(false)

// 工作目录变更后通知父组件（让磁盘/缓存卡片刷新）
function emitChanged() {
  emit('changed')
}

async function load() {
  const res = await window.api.workspaceGet()
  workspace.value = res.current
  defaultWs.value = res.default
}

async function onPick() {
  const picked = await window.api.workspacePick()
  if (!picked) return
  // 询问是迁移还是仅切换
  // ElMessageBox.confirm：点确认按钮 resolve('confirm')，点取消 reject('cancel')，点 X reject('close')
  try {
    await ElMessageBox.confirm(
      `已选择：${picked}\n\n是否将当前目录的内容迁移过去？\n（选择"仅切换"则不搬运已有内容）`,
      '切换工作目录',
      {
        distinguishCancelAndClose: true,
        confirmButtonText: '迁移并切换',
        cancelButtonText: '仅切换'
      }
    )
    // 点了"迁移并切换"
    await doMigrate(picked)
  } catch (action) {
    if (action === 'cancel') {
      // 点了"仅切换"
      const res = await window.api.workspaceSet(picked)
      if (res.success) {
        workspace.value = picked
        ElMessage.success('工作目录已切换')
        emitChanged()
      } else {
        ElMessage.error(res.error || '切换失败')
      }
    }
    // action === 'close' 表示点 X 关闭，什么都不做
  }
}

async function doMigrate(target) {
  migrating.value = true
  try {
    const res = await window.api.workspaceMigrate(target)
    if (res.success) {
      workspace.value = target
      ElMessage.success('迁移完成，已切换到新目录')
      emitChanged()
    } else {
      ElMessage.error(res.error || '迁移失败')
    }
  } finally {
    migrating.value = false
  }
}

async function onMigrate() {
  const picked = await window.api.workspacePick()
  if (!picked) return
  await doMigrate(picked)
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

.workspace-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}

.workspace-info {
  flex: 1;
  min-width: 0;
}

.info-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 4px;
}

.info-value {
  font-size: 14px;
  color: var(--el-text-color-primary);
  word-break: break-all;
  margin-bottom: 4px;
}

.info-hint {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

.workspace-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}
</style>
