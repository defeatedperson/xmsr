import paths from './paths.js'
import logger from './logger.js'

// ========== config.json（全局配置） ==========

const DEFAULT_CONFIG = {
  workspace: '', // 工作目录，空表示用默认
  cleanupCacheOnSuccess: true, // 任务成功后自动清理 cache
  videoCacheMultiplier: 2.5, // 视频磁盘估算保守倍率
  concurrency: 0, // 超分并发数，0 表示用设备推荐值
  theme: 'dark'
}

export function getConfig() {
  const cfg = paths.readJSON(paths.configFile(), {})
  return { ...DEFAULT_CONFIG, ...cfg }
}

// 简单的写串行化：保证多个并发 setConfig 不会因"读-改-写"竞态互相覆盖
let writeChain = Promise.resolve()
function serializeWrite(fn) {
  writeChain = writeChain.then(fn, fn)
  return writeChain
}

export function setConfig(patch) {
  return serializeWrite(() => {
    const cfg = { ...getConfig(), ...patch }
    paths.writeJSON(paths.configFile(), cfg)
    logger.info('配置已更新:', patch)
    return cfg
  })
}

export function getWorkspace() {
  const cfg = getConfig()
  return cfg.workspace || paths.defaultWorkspaceDir()
}

export function setWorkspace(ws) {
  return setConfig({ workspace: ws })
}

// ========== presets.json（预设） ==========

// 内置默认预设（参考旧项目的 presets.json 结构）
const BUILTIN_PRESETS = [
  {
    id: 'builtin-anime-standard',
    name: '动漫·标准',
    builtin: true,
    mode: 'image',
    engine: 'realcugan',
    model: 'models-nose',
    scale: 2,
    denoise: 1,
    sharpen: 'medium',
    format: 'jpg',
    capMode: 'height',
    capValue: 2160
  },
  {
    id: 'builtin-anime-restore',
    name: '动漫·老图修复',
    builtin: true,
    mode: 'image',
    engine: 'realcugan',
    model: 'models-nose',
    scale: 2,
    denoise: 3,
    sharpen: 'medium',
    format: 'jpg',
    capMode: 'height',
    capValue: 2160
  },
  {
    id: 'builtin-photo-4x',
    name: '实拍·4倍',
    builtin: true,
    mode: 'image',
    engine: 'realesrgan',
    model: 'realesr-animevideov3',
    scale: 4,
    denoise: 0.5,
    sharpen: 'light',
    format: 'jpg',
    capMode: 'height',
    capValue: 2160
  },
  {
    id: 'builtin-png-archive',
    name: 'PNG·无损存档',
    builtin: true,
    mode: 'image',
    engine: 'realcugan',
    model: 'models-nose',
    scale: 2,
    denoise: 1,
    sharpen: 'off',
    format: 'png',
    capMode: 'none',
    capValue: 2160
  }
]

export function getPresets() {
  const userPresets = paths.readJSON(paths.presetsFile(), [])
  return [...BUILTIN_PRESETS, ...userPresets]
}

export function getUserPresets() {
  return paths.readJSON(paths.presetsFile(), [])
}

export function saveUserPreset(preset) {
  const presets = getUserPresets()
  const idx = presets.findIndex((p) => p.id === preset.id)
  if (idx >= 0) {
    presets[idx] = preset
  } else {
    preset.id = preset.id || `user-${Date.now()}`
    preset.builtin = false
    presets.push(preset)
  }
  paths.writeJSON(paths.presetsFile(), presets)
  logger.info('预设已保存:', preset.name)
  return preset
}

export function deleteUserPreset(id) {
  const presets = getUserPresets().filter((p) => p.id !== id)
  paths.writeJSON(paths.presetsFile(), presets)
  logger.info('预设已删除:', id)
}

// ========== engines.json（引擎启用状态） ==========

export function getEnginesConfig() {
  return paths.readJSON(paths.enginesFile(), { enabled: {}, downloaded: [] })
}

export function setEnginesConfig(cfg) {
  paths.writeJSON(paths.enginesFile(), cfg)
}

// ========== device-report.json（兼容性测试结果） ==========

export function getDeviceReport() {
  return paths.readJSON(paths.deviceReportFile(), null)
}

export function setDeviceReport(report) {
  report.updatedAt = new Date().toISOString()
  paths.writeJSON(paths.deviceReportFile(), report)
  logger.info('设备报告已更新')
}

// ========== history.json（历史元数据，可选） ==========

export function getHistoryMeta() {
  return paths.readJSON(paths.historyFile(), { items: [] })
}

export function setHistoryMeta(meta) {
  paths.writeJSON(paths.historyFile(), meta)
}
