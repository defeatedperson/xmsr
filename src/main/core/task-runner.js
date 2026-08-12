import { randomUUID } from 'crypto'
import { BrowserWindow } from 'electron'
import imagePipeline from './pipeline/image-pipeline.js'
import videoPipeline from './pipeline/video-pipeline.js'
import paths from './paths.js'
import logger from './logger.js'

// 任务状态机：pending → running → done | failed | canceled
const tasks = new Map() // taskId -> task 对象
// 保留最近完成的任务数量上限，防止长跑内存单调增长
const MAX_COMPLETED_TASKS = 50

// 任务完成后清理多余的旧任务（保留最近 MAX_COMPLETED_TASKS 个）
function cleanupOldTasks() {
  const completed = [...tasks.values()].filter(
    (t) => t.status === 'done' || t.status === 'failed' || t.status === 'canceled'
  )
  if (completed.length > MAX_COMPLETED_TASKS) {
    // 删除最早的，直到不超过上限
    const toRemove = completed
      .slice(0, completed.length - MAX_COMPLETED_TASKS)
      .map((t) => t.id)
    for (const id of toRemove) {
      const t = tasks.get(id)
      if (t?._controller) t._controller = null // 释放引用
      tasks.delete(id)
    }
  }
}

function sendProgress(taskId, payload) {
  // 广播进度到所有窗口
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('task:progress', { taskId, ...payload })
  }
}

/**
 * 创建并启动一个任务。
 * @param {object} options
 *   type: 'image' | 'video'
 *   title: 任务标题
 *   engineId: 引擎 id
 *   params: { model, scale, denoise, format }
 *   images: 图片任务时的 [{path, bytes}]
 *   video: 视频任务时的 {...}
 * @returns task 对象
 */
function createTask(options) {
  const taskId = options.id || randomUUID()
  const task = {
    id: taskId,
    type: options.type,
    title: options.title || '未命名任务',
    engineId: options.engineId,
    params: options.params || {},
    status: 'pending',
    progress: 0,
    stage: 'queued',
    createdAt: new Date().toISOString(),
    error: null,
    results: null,
    _controller: null // AbortController（不序列化）
  }
  tasks.set(taskId, task)

  // 立即开始执行
  if (options.type === 'image') {
    runImageTask(taskId, options).catch((e) => {
      logger.error('图片任务执行异常:', e)
      task.status = 'failed'
      task.error = e.message
      // 补发终态，避免前端 UI 卡死（processing 永远为 true）
      sendProgress(taskId, { status: 'failed', stage: 'finished', error: e.message })
    })
  } else if (options.type === 'video') {
    runVideoTask(taskId, options).catch((e) => {
      logger.error('视频任务执行异常:', e)
      task.status = 'failed'
      task.error = e.message
      sendProgress(taskId, { status: 'failed', stage: task.stage, error: e.message })
    })
  }

  return serializeTask(task)
}

// ========== 视频任务 ==========

async function runVideoTask(taskId, options) {
  const task = tasks.get(taskId)
  if (!task) return

  task._controller = new AbortController()
  task.status = 'running'
  task.stage = 'probe'
  sendProgress(taskId, { status: task.status, stage: task.stage })

  const outputDir = paths.workspaceOutputDir(paths.currentWorkspace())
  // 阶段中文映射（供 UI 展示）
  const STAGE_NAMES = {
    probe: '探测视频',
    extract: '阶段1 拆帧',
    superres: '阶段2 超分',
    interp: '阶段3 插帧',
    compose: '阶段4 合成'
  }

  try {
    const result = await videoPipeline.runVideoPipeline({
      videoPath: options.videoPath,
      outputDir,
      superRes: {
        engineId: options.engineId,
        model: options.params?.model,
        scale: options.params?.scale,
        denoise: options.params?.denoise
      },
      interp: options.interp || { enabled: false },
      crf: options.params?.crf || 20,
      concurrency: options.concurrency || 1,
      onStage: (stage, data) => {
        task.stage = stage
        sendProgress(taskId, {
          status: 'running',
          stage,
          stageName: STAGE_NAMES[stage] || stage,
          stageStatus: data.status,
          info: data.info
        })
      },
      onProgress: (percent) => {
        task.progress = Math.round(percent)
        sendProgress(taskId, { status: 'running', stage: task.stage, progress: task.progress })
      },
      onLog: (msg) => {
        sendProgress(taskId, { log: String(msg) })
      }
    }, task._controller)

    if (result?.canceled) {
      task.status = 'canceled'
    } else if (result?.success) {
      task.status = 'done'
      task.results = [{ input: options.videoPath, output: result.outputPath, success: true }]
    } else {
      task.status = 'failed'
      task.error = '视频处理失败'
    }
  } catch (e) {
    task.status = 'failed'
    task.error = e.message
  }

  task.progress = 100
  task.stage = 'finished'
  logger.info(`视频任务 ${taskId} 完成: ${task.status}`)
  sendProgress(taskId, {
    status: task.status,
    stage: task.stage,
    progress: 100,
    error: task.error,
    results: task.results
  })
  cleanupOldTasks()
}

async function runImageTask(taskId, options) {
  const task = tasks.get(taskId)
  if (!task) return

  task._controller = new AbortController()
  task.status = 'running'
  task.stage = 'processing'
  sendProgress(taskId, { status: task.status, stage: task.stage })

  const outputDir = paths.workspaceOutputDir(paths.currentWorkspace())

  const results = await imagePipeline.processBatch(
    {
      engineId: options.engineId,
      images: options.images,
      params: options.params,
      outputDir,
      onProgress: (current, total, name) => {
        task.progress = total > 0 ? Math.round((current / total) * 100) : 0
        sendProgress(taskId, {
          status: 'running',
          stage: 'processing',
          current,
          total,
          currentName: name,
          progress: task.progress
        })
      },
      onLog: (msg) => {
        if (typeof msg === 'object' && msg.progress !== undefined) {
          // 单图进度（ncnn 输出的百分比）
          sendProgress(taskId, { subProgress: msg.progress })
        } else {
          sendProgress(taskId, { log: String(msg) })
        }
      }
    },
    task._controller
  )

  // 判断结果
  if (task._controller.signal.aborted) {
    task.status = 'canceled'
  } else if (results.every((r) => r.success)) {
    task.status = 'done'
  } else if (results.some((r) => r.success)) {
    task.status = 'done' // 部分成功也算完成（含错误明细）
    task.partial = true
  } else {
    task.status = 'failed'
    task.error = results[0]?.error || '全部失败'
  }
  task.results = results
  task.progress = 100
  task.stage = 'finished'

  logger.info(`任务 ${taskId} 完成: ${task.status}`)
  sendProgress(taskId, {
    status: task.status,
    stage: task.stage,
    progress: task.progress,
    error: task.error,
    results: results.map((r) => ({ input: r.input, output: r.output, success: r.success }))
  })
  cleanupOldTasks()
}

/**
 * 取消任务
 */
function cancelTask(taskId) {
  const task = tasks.get(taskId)
  if (!task) return false
  if (task._controller) {
    task._controller.abort()
  }
  if (task.status === 'pending') {
    task.status = 'canceled'
  }
  return true
}

/**
 * 获取任务列表（序列化，去掉内部字段）
 */
function listTasks() {
  return [...tasks.values()].map(serializeTask).reverse()
}

function getTask(taskId) {
  const task = tasks.get(taskId)
  return task ? serializeTask(task) : null
}

function serializeTask(task) {
  const { _controller, ...rest } = task
  return rest
}

export default {
  createTask,
  cancelTask,
  listTasks,
  getTask
}
