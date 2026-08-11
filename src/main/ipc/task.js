import { ipcMain, dialog } from 'electron'
import { statSync } from 'fs'
import taskRunner from '../core/task-runner.js'
import diskCheck from '../core/disk-check.js'
import * as store from '../core/store.js'

export function registerTaskIpc() {
  // 创建任务（含磁盘检查）
  // options: { type, title, engineId, params:{model,scale,denoise,format}, images:[{path}] }
  ipcMain.handle('task:create', async (_e, options) => {
    // 补全图片字节数（用于磁盘估算）
    if (options.images) {
      options.images = options.images.map((img) => {
        try {
          return { ...img, bytes: statSync(img.path).size }
        } catch {
          return { ...img, bytes: 0 }
        }
      })
    }

    // 磁盘空间检查（图片任务）
    if (options.type === 'image' && options.images) {
      const scale = options.params?.scale || 2
      const format = options.params?.format || 'png'
      const space = diskCheck.checkImagesSpace(options.images, scale, format, null)
      if (!space.enough) {
        return {
          success: false,
          reason: 'disk_full',
          requiredGB: space.requiredGB,
          availableGB: space.availableGB,
          suggested: space.suggested
        }
      }
    }

    // 磁盘空间检查（视频任务）
    let diskEstimate = null
    if (options.type === 'video' && options.videoPath) {
      try {
        const srcBytes = statSync(options.videoPath).size
        const scale = options.params?.scale || 2
        const videoPipeline = (await import('../core/pipeline/video-pipeline.js')).default
        const info = await videoPipeline.probeVideo(options.videoPath)
        if (info && info.duration > 0) {
          // 不插帧时 targetFps 传 0（符合 estimateVideoSpace 文档约定）
          const targetFps = options.interp?.enabled ? options.interp.targetFps : 0
          const required = diskCheck.estimateVideoSpace(
            info.duration, info.fps, scale, srcBytes, targetFps
          )
          const space = diskCheck.checkSpace(required, null)
          // 视频任务磁盘不足只警告不阻断（仍创建任务）
          diskEstimate = {
            requiredGB: space.requiredGB,
            availableGB: space.availableGB,
            enough: space.enough,
            suggested: space.suggested
          }
        }
      } catch (e) {
        // probe 失败不阻断，让流水线自己报错
      }
    }

    const task = taskRunner.createTask(options)
    return { success: true, task, diskEstimate }
  })

  // 任务列表
  ipcMain.handle('task:list', () => taskRunner.listTasks())

  // 任务详情
  ipcMain.handle('task:detail', (_e, taskId) => taskRunner.getTask(taskId))

  // 取消任务
  ipcMain.handle('task:cancel', (_e, taskId) => taskRunner.cancelTask(taskId))

  // 磁盘估算（供 UI 在提交前预估）
  ipcMain.handle('task:estimate', async (_e, { images, scale, format }) => {
    const imgs = (images || []).map((img) => {
      try {
        return { bytes: statSync(img.path).size }
      } catch {
        return { bytes: 0 }
      }
    })
    return diskCheck.checkImagesSpace(imgs, scale || 2, format || 'png', null)
  })
}
