import { ipcMain, dialog } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import * as store from '../core/store.js'

export function registerPresetIpc() {
  // 获取全部预设（内置 + 用户）
  ipcMain.handle('preset:list', () => store.getPresets())

  // 保存/更新用户预设
  ipcMain.handle('preset:save', (_e, preset) => store.saveUserPreset(preset))

  // 删除用户预设
  ipcMain.handle('preset:delete', (_e, id) => {
    store.deleteUserPreset(id)
    return true
  })

  // 导出预设到文件
  ipcMain.handle('preset:export', async (_e, preset) => {
    const result = await dialog.showSaveDialog({
      title: '导出预设',
      defaultPath: `${preset.name || 'preset'}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (result.canceled || !result.filePath) return null
    writeFileSync(result.filePath, JSON.stringify(preset, null, 2), 'utf-8')
    return result.filePath
  })

  // 从文件导入预设
  ipcMain.handle('preset:import', async () => {
    const result = await dialog.showOpenDialog({
      title: '导入预设',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    try {
      const data = JSON.parse(readFileSync(result.filePaths[0], 'utf-8'))
      // 导入的预设标记为用户预设，重新生成 id
      delete data.id
      data.builtin = false
      return store.saveUserPreset(data)
    } catch (e) {
      return { error: e.message }
    }
  })
}
