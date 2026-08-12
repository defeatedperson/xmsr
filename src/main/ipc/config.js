import { ipcMain, dialog, shell } from 'electron'
import { statfsSync, existsSync, renameSync, mkdirSync, readdirSync, statSync, rmSync } from 'fs'
import { join } from 'path'
import paths from '../core/paths.js'
import * as store from '../core/store.js'
import logger from '../core/logger.js'

export function registerConfigIpc() {
  // ===== 配置读写 =====
  ipcMain.handle('config:get', () => store.getConfig())
  ipcMain.handle('config:set', (_e, patch) => store.setConfig(patch))

  // ===== 工作目录 =====
  ipcMain.handle('workspace:get', () => ({
    current: store.getWorkspace(),
    default: paths.defaultWorkspaceDir()
  }))

  // 选择工作目录（对话框）
  ipcMain.handle('workspace:pick', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // 打开输出目录（workspace/output）
  ipcMain.handle('workspace:openOutput', () => {
    const outputDir = paths.workspaceOutputDir(store.getWorkspace())
    paths.ensureDir(outputDir)
    shell.openPath(outputDir)
    return outputDir
  })

  // 设置工作目录（含子目录创建）
  ipcMain.handle('workspace:set', (_e, ws) => {
    if (!ws) return { success: false, error: '路径不能为空' }
    store.setWorkspace(ws)
    paths.ensureAllDirs()
    logger.info('工作目录已设置:', ws)
    return { success: true, workspace: ws }
  })

  // 迁移工作目录（把旧目录内容搬到新目录）
  ipcMain.handle('workspace:migrate', async (_e, newWs) => {
    const oldWs = store.getWorkspace()
    if (!newWs) return { success: false, error: '新路径不能为空' }
    if (newWs === oldWs) return { success: false, error: '新旧路径相同' }

    try {
      mkdirSync(newWs, { recursive: true })
      // 搬迁 cache/output/models/engines（若存在）
      const subDirs = ['cache', 'output', 'models', 'engines']
      for (const sub of subDirs) {
        const from = join(oldWs, sub)
        const to = join(newWs, sub)
        if (existsSync(from)) {
          // 注意：renameSync 跨盘符会失败，跨盘符时需复制（此处先尝试 rename，失败回退提示）
          try {
            renameSync(from, to)
          } catch (e) {
            logger.warn(`迁移 ${sub} 失败（可能跨盘符）:`, e.message)
            return {
              success: false,
              error: `迁移 ${sub} 失败：${e.message}。跨盘符迁移请手动复制后重新指定目录。`
            }
          }
        }
      }
      store.setWorkspace(newWs)
      paths.ensureAllDirs()
      logger.info('工作目录已迁移:', oldWs, '->', newWs)
      return { success: true, from: oldWs, to: newWs }
    } catch (e) {
      logger.error('工作目录迁移失败:', e)
      return { success: false, error: e.message }
    }
  })

  // ===== 磁盘空间 =====
  // 返回指定路径所在磁盘的可用空间（字节）和总量
  ipcMain.handle('disk:space', (_e, targetPath) => {
    const p = targetPath || store.getWorkspace()
    try {
      const stats = statfsSync(p)
      const bsize = stats.bsize
      const available = stats.bavail * bsize
      const total = stats.blocks * bsize
      return {
        success: true,
        path: p,
        available,
        availableGB: round(available / 1024 / 1024 / 1024, 2),
        total,
        totalGB: round(total / 1024 / 1024 / 1024, 2)
      }
    } catch (e) {
      logger.error('磁盘空间查询失败:', e)
      return { success: false, error: e.message }
    }
  })

  // ===== 缓存管理 =====

  // 计算 cache 目录大小
  ipcMain.handle('cache:size', () => {
    const cacheDir = paths.workspaceCacheDir(store.getWorkspace())
    if (!existsSync(cacheDir)) return { success: true, size: 0, sizeMB: '0' }
    try {
      const size = dirSize(cacheDir)
      return {
        success: true,
        path: cacheDir,
        size,
        sizeMB: (size / 1024 / 1024).toFixed(size > 10485760 ? 0 : 1)
      }
    } catch (e) {
      return { success: false, error: e.message, size: 0 }
    }
  })

  // 清理 cache 目录（删除内部所有内容，保留 cache 目录本身）
  ipcMain.handle('cache:clean', () => {
    const cacheDir = paths.workspaceCacheDir(store.getWorkspace())
    if (!existsSync(cacheDir)) return { success: true, cleaned: 0 }
    try {
      const before = dirSize(cacheDir)
      // 删除 cache 下的所有子项（保留 cache 目录本身）
      for (const entry of readdirSync(cacheDir)) {
        rmSync(join(cacheDir, entry), { recursive: true, force: true })
      }
      logger.info(`缓存已清理，释放 ${(before / 1024 / 1024).toFixed(1)} MB`)
      return { success: true, cleaned: before, cleanedMB: (before / 1024 / 1024).toFixed(1) }
    } catch (e) {
      logger.error('缓存清理失败:', e)
      return { success: false, error: e.message }
    }
  })

  // ===== 文件/目录选择对话框 =====
  ipcMain.handle('dialog:pickFiles', async (_e, opts = {}) => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: opts.filters || [
        { name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'] }
      ]
    })
    return result.canceled ? [] : result.filePaths
  })

  ipcMain.handle('dialog:pickVideo', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: '视频', extensions: ['mp4', 'mkv', 'avi', 'mov', 'flv', 'webm'] }]
    })
    return result.canceled ? null : result.filePaths[0]
  })

  // ===== 在文件夹中打开 =====
  ipcMain.handle('shell:openInFolder', (_e, filePath) => {
    shell.showItemInFolder(filePath)
  })

  ipcMain.handle('shell:openPath', (_e, targetPath) => {
    shell.openPath(targetPath)
  })

  // 用系统默认浏览器打开外部链接
  ipcMain.handle('shell:openExternal', (_e, url) => {
    shell.openExternal(url)
  })
}

function round(n, digits = 2) {
  const f = Math.pow(10, digits)
  return Math.round(n * f) / f
}

// 递归计算目录总字节数
function dirSize(dir) {
  let total = 0
  const entries = readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      total += dirSize(fullPath)
    } else {
      try {
        total += statSync(fullPath).size
      } catch {
        /* 跳过无法访问的文件 */
      }
    }
  }
  return total
}
