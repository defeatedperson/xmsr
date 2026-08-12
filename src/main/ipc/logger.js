import { ipcMain, shell } from 'electron'
import { readdirSync, readFileSync, statSync, existsSync } from 'fs'
import { join } from 'path'
import paths from '../core/paths.js'

// 单次读取上限（5MB）：日志过大时只回传尾部（最新内容更重要），避免 IPC 卡死
const MAX_READ_BYTES = 5 * 1024 * 1024

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function logDir() {
  return join(paths.configDir(), 'logs')
}

export function registerLoggerIpc() {
  // 日志文件列表（按日期倒序，最新在前）
  ipcMain.handle('logger:list', () => {
    try {
      const dir = logDir()
      if (!existsSync(dir)) return { success: true, items: [], logDir: dir }
      const items = readdirSync(dir)
        .filter((f) => DATE_RE.test(f.replace('.log', '')) && f.endsWith('.log'))
        .map((f) => {
          let size = 0
          try {
            size = statSync(join(dir, f)).size
          } catch {
            /* ignore */
          }
          return { date: f.replace('.log', ''), size, sizeKB: Math.round((size / 1024) * 10) / 10 }
        })
        .sort((a, b) => (a.date < b.date ? 1 : -1))
      return { success: true, items, logDir: dir }
    } catch (e) {
      return { success: false, error: e.message, items: [] }
    }
  })

  // 读取指定日期的日志内容（纯文本，按行记录）
  ipcMain.handle('logger:read', (_e, date) => {
    if (!DATE_RE.test(String(date || ''))) {
      return { success: false, error: '日期格式无效' }
    }
    try {
      const file = join(logDir(), `${date}.log`)
      if (!existsSync(file)) return { success: true, content: '', truncated: false, size: 0 }
      const buf = readFileSync(file)
      const truncated = buf.length > MAX_READ_BYTES
      const content = truncated
        ? buf.subarray(buf.length - MAX_READ_BYTES).toString('utf-8')
        : buf.toString('utf-8')
      return { success: true, content, truncated, size: buf.length }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  // 打开日志目录
  ipcMain.handle('logger:openDir', async () => {
    const err = await shell.openPath(logDir())
    return err ? { success: false, error: err } : { success: true }
  })
}
