<template>
  <div class="logs-page">
    <!-- 工具栏：左筛选 + 右操作 -->
    <div class="toolbar">
      <div class="toolbar-left">
        <el-select v-model="selectedDate" class="date-select" placeholder="选择日期" @change="fetchContent">
          <el-option
            v-for="item in logFiles"
            :key="item.date"
            :label="`${item.date}（${relLabel(item.date)}，${item.sizeKB} KB）`"
            :value="item.date"
          />
        </el-select>
        <el-button-group>
          <el-button :type="levelFilter === 'all' ? 'primary' : ''" @click="setLevel('all')">全部 ({{ entries.length }})</el-button>
          <el-button :type="levelFilter === 'INFO' ? 'primary' : ''" @click="setLevel('INFO')">信息 ({{ countByLevel.INFO }})</el-button>
          <el-button :type="levelFilter === 'WARN' ? 'primary' : ''" @click="setLevel('WARN')">警告 ({{ countByLevel.WARN }})</el-button>
          <el-button :type="levelFilter === 'ERROR' ? 'primary' : ''" @click="setLevel('ERROR')">错误 ({{ countByLevel.ERROR }})</el-button>
        </el-button-group>
        <el-input
          v-model="keyword"
          class="keyword-input"
          placeholder="搜索日志内容"
          clearable
          :prefix-icon="Search"
        />
      </div>
      <el-button-group>
        <el-button :icon="Refresh" @click="load">刷新</el-button>
        <el-button :icon="Folder" @click="openLogDir">打开目录</el-button>
      </el-button-group>
    </div>

    <!-- 大日志截断提示 -->
    <el-alert
      v-if="truncated"
      class="truncate-tip"
      title="日志文件过大，仅显示最近的部分内容"
      type="warning"
      :closable="false"
      show-icon
    />

    <!-- 空状态 -->
    <el-empty v-if="!loading && filteredEntries.length === 0" :description="emptyText" />

    <!-- 日志表格 -->
    <div v-else class="table-container" v-loading="loading">
      <el-table :data="paginatedEntries" style="width: 100%" stripe border>
        <el-table-column prop="time" label="时间" width="185" />
        <el-table-column prop="level" label="级别" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="levelTag(row.level)" size="small" effect="light">
              {{ levelText(row.level) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="content" label="内容" min-width="300" show-overflow-tooltip />
        <el-table-column label="操作" width="90" align="center" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="viewEntry(row)">查看</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination-wrapper">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          layout="total, sizes, prev, pager, next"
          :page-sizes="[50, 100, 200]"
          :total="filteredEntries.length"
          size="small"
          background
        />
      </div>
    </div>

    <!-- 日志详情弹窗（完整内容，含多行堆栈） -->
    <el-dialog
      v-model="showDetail"
      :title="detailTitle"
      width="640px"
      destroy-on-close
      class="log-detail-dialog"
    >
      <div class="detail-container">
        <pre class="detail-content">{{ detailContent }}</pre>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onActivated } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh, Folder, Search } from '@element-plus/icons-vue'

const logFiles = ref([]) // [{date, size, sizeKB}]
const selectedDate = ref('')
const entries = ref([]) // [{id, time, level, content}]
const truncated = ref(false)
const loading = ref(false)
const levelFilter = ref('all')
const keyword = ref('')
const currentPage = ref(1)
const pageSize = ref(50)

// 详情弹窗
const showDetail = ref(false)
const detailTitle = ref('')
const detailContent = ref('')

const emptyText = computed(() => {
  if (logFiles.value.length === 0) return '暂无日志文件'
  if (entries.value.length === 0) return '当天没有日志记录'
  return '没有匹配的日志'
})

const countByLevel = computed(() => {
  const count = { INFO: 0, WARN: 0, ERROR: 0, DEBUG: 0 }
  for (const e of entries.value) count[e.level] = (count[e.level] || 0) + 1
  return count
})

const filteredEntries = computed(() => {
  let list = entries.value
  if (levelFilter.value !== 'all') {
    list = list.filter((e) => e.level === levelFilter.value)
  }
  const kw = keyword.value.trim().toLowerCase()
  if (kw) {
    list = list.filter((e) => e.content.toLowerCase().includes(kw))
  }
  return list
})

const paginatedEntries = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredEntries.value.slice(start, start + pageSize.value)
})

function relLabel(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.round((today - d) / 86400000)
  if (diff <= 0) return '今天'
  if (diff === 1) return '昨天'
  if (diff === 2) return '前天'
  return `${diff}天前`
}

function levelTag(level) {
  const map = { INFO: 'info', WARN: 'warning', ERROR: 'danger', DEBUG: 'info' }
  return map[level] || 'info'
}

function levelText(level) {
  const map = { INFO: '信息', WARN: '警告', ERROR: '错误', DEBUG: '调试' }
  return map[level] || level
}

function setLevel(level) {
  levelFilter.value = level
  currentPage.value = 1
}

/**
 * 解析日志文本为条目列表。
 * 行格式：[YYYY-MM-DD HH:mm:ss.SSS] [LEVEL] 内容
 * 不匹配的行（如错误堆栈续行）并入上一条内容。
 */
function parseLogs(text) {
  const lineRe = /^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3})\] \[([A-Z]+)\] (.*)$/
  const result = []
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue
    const m = line.match(lineRe)
    if (m) {
      result.push({ id: result.length + 1, time: m[1], level: m[2], content: m[3] })
    } else if (result.length > 0) {
      result[result.length - 1].content += '\n' + line
    }
  }
  // 最新的在前
  return result.reverse()
}

async function load() {
  loading.value = true
  try {
    const res = await window.api.loggerList()
    if (!res.success) {
      ElMessage.error(res.error || '获取日志列表失败')
      return
    }
    logFiles.value = res.items || []
    // 当前选中日期已不存在（如被清理）时，回退到最新一天
    if (logFiles.value.length === 0) {
      selectedDate.value = ''
      entries.value = []
      return
    }
    if (!logFiles.value.some((f) => f.date === selectedDate.value)) {
      selectedDate.value = logFiles.value[0].date
    }
    await fetchContent()
  } finally {
    loading.value = false
  }
}

async function fetchContent() {
  if (!selectedDate.value) return
  loading.value = true
  try {
    const res = await window.api.loggerRead(selectedDate.value)
    if (!res.success) {
      ElMessage.error(res.error || '读取日志失败')
      entries.value = []
      return
    }
    truncated.value = !!res.truncated
    entries.value = parseLogs(res.content || '')
    currentPage.value = 1
  } finally {
    loading.value = false
  }
}

async function openLogDir() {
  const res = await window.api.loggerOpenDir()
  if (!res?.success) ElMessage.error(res?.error || '打开日志目录失败')
}

function viewEntry(row) {
  detailTitle.value = `日志详情 - ${levelText(row.level)}`
  detailContent.value = `时间: ${row.time}
级别: ${levelText(row.level)}
----------------------------------------
${row.content}`
  showDetail.value = true
}

// keep-alive 缓存页面：每次进入时刷新（日志随时在增长）
onActivated(() => {
  load()
})
</script>

<style scoped>
.logs-page {
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: 100%;
  overflow: hidden;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--el-bg-color-overlay);
  border-radius: var(--el-border-radius-base);
  border: 1px solid var(--el-border-color-lighter);
  flex-wrap: wrap;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.date-select {
  width: 260px;
}

.keyword-input {
  width: 220px;
}

.truncate-tip {
  flex-shrink: 0;
}

.table-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--el-border-radius-base);
  padding: 16px;
  overflow: hidden;
}

.pagination-wrapper {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}

.detail-container {
  min-height: 200px;
  max-height: 60vh;
  overflow-y: auto;
  background-color: var(--el-bg-color-page);
  border-radius: 4px;
  padding: 12px;
}

.detail-content {
  margin: 0;
  font-family: 'Courier New', Courier, monospace;
  font-size: 13px;
  line-height: 1.6;
  color: var(--el-text-color-primary);
  white-space: pre-wrap;
  word-break: break-all;
}

:deep(.el-dialog__body) {
  padding-top: 10px;
}
</style>
