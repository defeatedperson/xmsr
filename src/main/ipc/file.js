import { ipcMain } from 'electron'
import { readFileSync, statSync } from 'fs'
import { extname } from 'path'
import sharp from 'sharp'
import logger from '../core/logger.js'

const MIME_MAP = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
}

// 缩略图最大边长（像素）。超分后的图可能上万像素，
// 缩到 400px 后 base64 仅几十 KB，避免内存爆炸。
const THUMB_MAX_EDGE = 400

export function registerFileIpc() {
  /**
   * 读取图片缩略图（base64）。
   * 用 sharp 把图片缩小到最大边 THUMB_MAX_EDGE，大幅减少内存占用。
   * 用于缩略图列表、成品页网格等批量展示场景。
   */
  ipcMain.handle('file:readThumbnail', async (_e, filePath, maxEdge) => {
    if (!filePath) return { success: false, error: '路径为空' }
    try {
      const edge = Math.max(50, Math.min(1200, maxEdge || THUMB_MAX_EDGE))
      const buf = await sharp(filePath)
        .resize(edge, edge, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80 }) // 缩略图用 jpeg 更小
        .toBuffer()
      return { success: true, dataUrl: `data:image/jpeg;base64,${buf.toString('base64')}` }
    } catch (e) {
      logger.warn('生成缩略图失败:', filePath, e.message)
      return { success: false, error: e.message }
    }
  })

  /**
   * 读取本地文件为 data URL（base64）—— 原尺寸。
   * 仅用于点开预览单张大图时。限制 50MB，避免超大文件。
   */
  ipcMain.handle('file:readAsDataUrl', (_e, filePath) => {
    if (!filePath) return { success: false, error: '路径为空' }
    try {
      const stat = statSync(filePath)
      if (stat.size > 50 * 1024 * 1024) {
        return { success: false, error: `文件过大（${(stat.size / 1024 / 1024).toFixed(1)} MB），超过 50MB 限制` }
      }
      const buf = readFileSync(filePath)
      const ext = extname(filePath).toLowerCase()
      const mime = MIME_MAP[ext] || 'application/octet-stream'
      return { success: true, dataUrl: `data:${mime};base64,${buf.toString('base64')}` }
    } catch (e) {
      logger.warn('读取文件失败:', filePath, e.message)
      return { success: false, error: e.message }
    }
  })
}
