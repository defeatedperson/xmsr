import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// 保存事件监听器引用，便于精确移除（避免 removeAllListeners 误删其他页面监听）
let taskProgressHandlers = []
let deviceProbeHandlers = []

const api = {
  // ===== 窗口控制 =====
  windowMinimize: () => ipcRenderer.invoke('window:minimize'),
  windowMaximize: () => ipcRenderer.invoke('window:maximize'),
  windowClose: () => ipcRenderer.invoke('window:close'),
  windowIsMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  windowOnMaximized: (callback) =>
    ipcRenderer.on('window:maximized', (_event, value) => callback(value)),
  windowOffMaximized: () => ipcRenderer.removeAllListeners('window:maximized'),

  // ===== 配置 =====
  configGet: () => ipcRenderer.invoke('config:get'),
  configSet: (patch) => ipcRenderer.invoke('config:set', patch),

  // ===== 工作目录 =====
  workspaceGet: () => ipcRenderer.invoke('workspace:get'),
  workspacePick: () => ipcRenderer.invoke('workspace:pick'),
  workspaceSet: (ws) => ipcRenderer.invoke('workspace:set', ws),
  workspaceMigrate: (newWs) => ipcRenderer.invoke('workspace:migrate', newWs),
  workspaceOpenOutput: () => ipcRenderer.invoke('workspace:openOutput'),

  // ===== 磁盘空间 =====
  diskSpace: (path) => ipcRenderer.invoke('disk:space', path),

  // ===== 缓存管理 =====
  cacheSize: () => ipcRenderer.invoke('cache:size'),
  cacheClean: () => ipcRenderer.invoke('cache:clean'),

  // ===== 文件对话框 =====
  pickFiles: (opts) => ipcRenderer.invoke('dialog:pickFiles', opts),
  pickVideo: () => ipcRenderer.invoke('dialog:pickVideo'),
  openInFolder: (filePath) => ipcRenderer.invoke('shell:openInFolder', filePath),
  openPath: (targetPath) => ipcRenderer.invoke('shell:openPath', targetPath),
  // 用系统默认浏览器打开外部链接
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),

  // ===== 设备检测 =====
  deviceReport: () => ipcRenderer.invoke('device:report'),
  deviceProbe: () => ipcRenderer.invoke('device:probe'),
  // 精确注册/移除监听（保存引用，避免 removeAllListeners 误删其他页面的监听）
  deviceProbeOnProgress: (callback) => {
    const handler = (_event, data) => callback(data)
    deviceProbeHandlers.push(handler)
    ipcRenderer.on('device:probe:progress', handler)
  },
  deviceProbeOffProgress: () => {
    for (const h of deviceProbeHandlers) ipcRenderer.removeListener('device:probe:progress', h)
    deviceProbeHandlers = []
  },

  // ===== 引擎 =====
  engineList: () => ipcRenderer.invoke('engine:list'),
  engineGet: (id) => ipcRenderer.invoke('engine:get', id),

  // ===== 任务 =====
  taskCreate: (options) => ipcRenderer.invoke('task:create', options),
  taskList: () => ipcRenderer.invoke('task:list'),
  taskDetail: (taskId) => ipcRenderer.invoke('task:detail', taskId),
  taskCancel: (taskId) => ipcRenderer.invoke('task:cancel', taskId),
  taskEstimate: (params) => ipcRenderer.invoke('task:estimate', params),
  taskOnProgress: (callback) => {
    const handler = (_event, data) => callback(data)
    taskProgressHandlers.push(handler)
    ipcRenderer.on('task:progress', handler)
  },
  taskOffProgress: () => {
    for (const h of taskProgressHandlers) ipcRenderer.removeListener('task:progress', h)
    taskProgressHandlers = []
  },

  // ===== 预设 =====
  presetList: () => ipcRenderer.invoke('preset:list'),
  presetSave: (preset) => ipcRenderer.invoke('preset:save', preset),
  presetDelete: (id) => ipcRenderer.invoke('preset:delete', id),
  presetExport: (preset) => ipcRenderer.invoke('preset:export', preset),
  presetImport: () => ipcRenderer.invoke('preset:import'),

  // ===== 文件读取（主进程读文件→base64，渲染端不直接访问文件系统）=====
  fileReadAsDataUrl: (filePath) => ipcRenderer.invoke('file:readAsDataUrl', filePath),
  // 生成缩略图（sharp 缩放，避免大图全量载入内存）
  fileReadThumbnail: (filePath, maxEdge) =>
    ipcRenderer.invoke('file:readThumbnail', filePath, maxEdge),

  // ===== 成品库（扫描 output 目录）=====
  historyList: () => ipcRenderer.invoke('history:list'),
  historyVideoThumb: (videoPath) => ipcRenderer.invoke('history:videoThumb', videoPath),
  historyDelete: (filePath) => ipcRenderer.invoke('history:delete', filePath),
  historyShowInFolder: (filePath) => ipcRenderer.invoke('history:showInFolder', filePath)
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  window.electron = electronAPI
  window.api = api
}
