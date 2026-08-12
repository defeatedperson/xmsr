import { app, shell, BrowserWindow, ipcMain, session } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import paths from './core/paths.js'
import logger from './core/logger.js'
import { registerConfigIpc } from './ipc/config.js'
import { registerDeviceIpc } from './ipc/device.js'
import { registerEngineIpc } from './ipc/engine.js'
import { registerTaskIpc } from './ipc/task.js'
import { registerPresetIpc } from './ipc/preset.js'
import { registerFileIpc } from './ipc/file.js'
import { registerHistoryIpc } from './ipc/history.js'
import { registerLoggerIpc } from './ipc/logger.js'

// 主窗口引用（窗口控制 IPC 需要）
let mainWindow = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 800,
    minHeight: 700,
    show: false,
    frame: false,
    autoHideMenuBar: true,
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  // 窗口控制 IPC
  ipcMain.handle('window:minimize', () => mainWindow?.minimize())
  ipcMain.handle('window:maximize', () => {
    if (!mainWindow) return
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow.maximize()
    }
  })
  ipcMain.handle('window:close', () => mainWindow?.close())
  ipcMain.handle('window:is-maximized', () => mainWindow?.isMaximized() || false)

  mainWindow.on('maximize', () => mainWindow?.webContents.send('window:maximized', true))
  mainWindow.on('unmaximize', () => mainWindow?.webContents.send('window:maximized', false))
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.xmsr.app')

  // 仅生产环境注入 CSP（dev 模式 Vite 需要宽松策略）
  if (!is.dev) {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' blob:; connect-src 'self'"
          ]
        }
      })
    })
  }

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // 初始化基础设施
  logger.init()
  paths.ensureAllDirs()
  logger.info('XMSR 启动，工作目录:', paths.currentWorkspace())

  // 注册 IPC 模块
  registerConfigIpc()
  registerDeviceIpc()
  registerEngineIpc()
  registerTaskIpc()
  registerPresetIpc()
  registerFileIpc()
  registerHistoryIpc()
  registerLoggerIpc()

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
