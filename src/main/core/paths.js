import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'

const APP_NAME = '星梦超分工具'

// ========== 固定路径 ==========

// 配置目录：始终在 %APPDATA%\星梦超分工具\config（C 盘，小文件，更新不丢失）
function configDir() {
  return join(app.getPath('userData'), 'config')
}

// 默认工作目录：首次运行时用（用户可改到大盘）
function defaultWorkspaceDir() {
  return join(app.getPath('userData'), 'workspace')
}

// 工作目录下的子目录
function workspaceCacheDir(ws) {
  return join(ws, 'cache')
}
function workspaceOutputDir(ws) {
  return join(ws, 'output')
}
function workspaceModelsDir(ws) {
  return join(ws, 'models')
}
function workspaceEnginesDir(ws) {
  return join(ws, 'engines')
}

// 配置文件路径（均在 configDir 下）
function configFile() {
  return join(configDir(), 'config.json')
}
function presetsFile() {
  return join(configDir(), 'presets.json')
}
function enginesFile() {
  return join(configDir(), 'engines.json')
}
function deviceReportFile() {
  return join(configDir(), 'device-report.json')
}
function historyFile() {
  return join(configDir(), 'history.json')
}

// ========== 内置资源路径（打包后） ==========

// 开发期用项目下 resources/，打包后用 process.resourcesPath
function resourcesDir() {
  if (app.isPackaged) {
    return process.resourcesPath
  }
  // 开发期：项目根/resources
  return join(app.getAppPath(), 'resources')
}

function bundledEnginesDir() {
  return join(resourcesDir(), 'engines')
}
function bundledModelsDir() {
  return join(resourcesDir(), 'models')
}
function bundledFfmpegDir() {
  return join(resourcesDir(), 'ffmpeg')
}
function bundledVulkanRuntimeDir() {
  return join(resourcesDir(), 'vulkan-runtime')
}

// ========== 当前工作目录解析（从 config.json 读取） ==========

/**
 * 读取当前工作目录路径（来自 config.json 的 workspace 字段）。
 * 若未设置，返回默认工作目录。
 */
function currentWorkspace() {
  try {
    const cfg = readJSON(configFile())
    if (cfg && cfg.workspace) return cfg.workspace
  } catch {
    /* 未初始化，走默认 */
  }
  return defaultWorkspaceDir()
}

// ========== 目录确保存在 ==========

function ensureDir(dir) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

/**
 * 初始化所有必要的目录结构（app ready 后调用）。
 * 确保 config 目录、当前工作目录及其子目录都存在。
 */
function ensureAllDirs() {
  ensureDir(configDir())
  const ws = currentWorkspace()
  ensureDir(ws)
  ensureDir(workspaceCacheDir(ws))
  ensureDir(workspaceOutputDir(ws))
  ensureDir(workspaceModelsDir(ws))
  ensureDir(workspaceEnginesDir(ws))
}

// ========== JSON 读写工具（供 store.js 使用） ==========

function readJSON(file, fallback = null) {
  try {
    return JSON.parse(readFileSync(file, 'utf-8'))
  } catch {
    return fallback
  }
}

function writeJSON(file, data) {
  ensureDir(join(file, '..'))
  writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8')
}

export default {
  APP_NAME,
  configDir,
  defaultWorkspaceDir,
  workspaceCacheDir,
  workspaceOutputDir,
  workspaceModelsDir,
  workspaceEnginesDir,
  configFile,
  presetsFile,
  enginesFile,
  deviceReportFile,
  historyFile,
  resourcesDir,
  bundledEnginesDir,
  bundledModelsDir,
  bundledFfmpegDir,
  bundledVulkanRuntimeDir,
  currentWorkspace,
  ensureDir,
  ensureAllDirs,
  readJSON,
  writeJSON
}
