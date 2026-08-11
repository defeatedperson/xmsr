import { ipcMain, shell } from 'electron'
import { readdirSync, statSync, existsSync, unlinkSync } from 'fs'
import { join, extname, basename } from 'path'
import { spawn } from 'child_process'
import sharp from 'sharp'
import paths from '../core/paths.js'
import * as store from '../core/store.js'
import ffmpegMgr from '../core/ffmpeg.js'
import logger from '../core/logger.js'

const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.bmp']
const VIDEO_EXTS = ['.mp4', '.mkv', '.mov', '.avi', '.webm', '.flv']

export function registerHistoryIpc() {
  // 扫描 output 目录，返回文件列表（含类型/大小/修改时间）
  ipcMain.handle('history:list', () => {
    const outputDir = paths.workspaceOutputDir(store.getWorkspace())
    if (!existsSync(outputDir)) return { success: true, items: [], outputDir }
    try {
      const items = readdirSync(outputDir)
        .map((name) => {
          const fullPath = join(outputDir, name)
          try {
            const stat = statSync(fullPath)
            const ext = extname(name).toLowerCase()
            let type = 'other'
            if (IMAGE_EXTS.includes(ext)) type = 'image'
            else if (VIDEO_EXTS.includes(ext)) type = 'video'
            return {
              name,
              path: fullPath,
              type,
              size: stat.size,
              sizeMB: Math.round((stat.size / 1024 / 1024) * 100) / 100,
              mtime: stat.mtimeMs
            }
          } catch {
            return null
          }
        })
        .filter(Boolean)
        .sort((a, b) => b.mtime - a.mtime) // 按修改时间倒序（最新在前）
      return { success: true, items, outputDir }
    } catch (e) {
      logger.warn('扫描 output 失败:', e.message)
      return { success: false, error: e.message, items: [] }
    }
  })

  // 提取视频首帧为缩略图（sharp 缩放到 300px，避免大帧全量载入内存）
  ipcMain.handle('history:videoThumb', async (_e, videoPath) => {
    const ffmpeg = ffmpegMgr.getFfmpegPath()
    // 抽帧到 buffer，再用 sharp 缩放
    const frameBuf = await extractFrame(ffmpeg, videoPath, 1)
    const finalBuf = frameBuf || (await extractFrame(ffmpeg, videoPath, 0))
    if (!finalBuf) return { success: false, error: '无法提取视频缩略图' }
    try {
      const thumb = await sharp(finalBuf)
        .resize(300, 300, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer()
      return { success: true, dataUrl: `data:image/jpeg;base64,${thumb.toString('base64')}` }
    } catch (e) {
      // sharp 失败时回退到原图
      return { success: true, dataUrl: `data:image/png;base64,${finalBuf.toString('base64')}` }
    }
  })

  // 删除成品文件
  ipcMain.handle('history:delete', (_e, filePath) => {
    try {
      unlinkSync(filePath)
      logger.info('已删除成品:', basename(filePath))
      return { success: true }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  // 在文件夹中显示
  ipcMain.handle('history:showInFolder', (_e, filePath) => {
    shell.showItemInFolder(filePath)
  })
}

// 用 ffmpeg 抽取视频指定秒数的首帧，返回 Buffer（失败返回 null）
function extractFrame(ffmpeg, videoPath, seekSec) {
  return new Promise((resolve) => {
    const args = seekSec > 0
      ? ['-ss', String(seekSec), '-i', videoPath, '-frames:v', '1', '-f', 'image2', '-vcodec', 'png', '-']
      : ['-i', videoPath, '-frames:v', '1', '-f', 'image2', '-vcodec', 'png', '-']
    const child = spawn(ffmpeg, args, { windowsHide: true })
    const chunks = []
    child.stdout.on('data', (c) => chunks.push(c))
    child.on('close', () => {
      resolve(chunks.length > 0 ? Buffer.concat(chunks) : null)
    })
    child.on('error', () => resolve(null))
  })
}

