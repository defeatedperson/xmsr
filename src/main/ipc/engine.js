import { ipcMain } from 'electron'
import engineManager from '../core/engine-manager.js'

export function registerEngineIpc() {
  // 列出所有引擎及其状态、可用模型
  ipcMain.handle('engine:list', () => engineManager.listEngines())

  // 获取单个引擎信息
  ipcMain.handle('engine:get', (_e, id) => {
    const def = engineManager.getEngineDef(id)
    if (!def) return null
    const list = engineManager.listEngines()
    return list.find((e) => e.id === id) || null
  })
}
