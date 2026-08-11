import si from 'systeminformation'
import { existsSync } from 'fs'
import { join } from 'path'
import paths from './paths.js'
import logger from './logger.js'
import engineManager from './engine-manager.js'

// ========== 基础信息采集 ==========

async function probeSystem() {
  const [cpu, mem, osInfo] = await Promise.all([si.cpu(), si.mem(), si.osInfo()])
  return {
    cpu: {
      manufacturer: cpu.manufacturer,
      brand: cpu.brand,
      cores: cpu.cores,
      physicalCores: cpu.physicalCores
    },
    memory: {
      total: mem.total,
      totalGB: round(mem.total / 1024 / 1024 / 1024, 1),
      free: mem.free,
      freeGB: round(mem.free / 1024 / 1024 / 1024, 1)
    },
    os: {
      platform: osInfo.platform,
      distro: osInfo.distro,
      release: osInfo.release,
      arch: process.arch
    }
  }
}

// ========== GPU 枚举 ==========

// 虚拟显卡特征关键字（向日葵 Oray、Idd 虚拟显示驱动、Microsoft 基本渲染等）
const VIRTUAL_GPU_KEYWORDS = [
  'oray',          // 向日葵 OrayIddDriver
  'idd',           // 通用间接显示驱动（Idd）
  'basic render',  // Microsoft Basic Render Driver
  'microsoft',     // Microsoft 虚拟显卡
  'parsec',        // Parsec 虚拟显卡
  'ddi:virtual',   // 虚拟
  'virtual'
]

function isVirtualGpu(controller) {
  const text = `${controller.vendor || ''} ${controller.model || ''}`.toLowerCase()
  // 匹配虚拟驱动关键字
  if (VIRTUAL_GPU_KEYWORDS.some((kw) => text.includes(kw))) return true
  // 显存为 0 的也视为虚拟/无效（真实显卡至少有显存）
  if (!controller.vram || controller.vram <= 0) return true
  return false
}

async function probeGraphics() {
  try {
    const graphics = await si.graphics()
    const allControllers = graphics.controllers || []
    const gpus = allControllers
      .filter((c) => c && c.model)
      .filter((c) => !isVirtualGpu(c)) // 排除虚拟显卡
      .map((c) => ({
        vendor: c.vendor,
        model: c.model,
        vram: c.vram || 0, // MB
        vramGB: round((c.vram || 0) / 1024, 1),
        driverVersion: c.driverVersion
      }))
    if (allControllers.length > gpus.length) {
      logger.info(
        '已过滤虚拟显卡:',
        allControllers.filter((c) => c && isVirtualGpu(c)).map((c) => c.model).join(', ')
      )
    }
    return gpus
  } catch (err) {
    logger.warn('GPU 枚举失败:', err.message)
    return []
  }
}

// ========== Vulkan 运行时检测 ==========

/**
 * 检测 Vulkan 运行时是否安装（Windows: vulkan-1.dll）。
 * 只检测文件是否存在——vulkan-1.dll 是 Vulkan 加载器，
 * 由显卡驱动或 Vulkan Runtime 自动安装。文件存在即表示运行时已就绪。
 * 不做 process.dlopen（vulkan-1.dll 不是 Node 原生模块，dlopen 会误报 self-register 错误）。
 * 真正的可用性由 ncnn 引擎实际运行时验证（Vulkan 不可用会直接报错退出）。
 */
function probeVulkanRuntime() {
  if (process.platform !== 'win32') {
    return { installed: false, reason: '非 Windows 平台，跳过检测' }
  }
  const sysRoot = process.env.SystemRoot || 'C:\\Windows'
  const vulkanPath = join(sysRoot, 'System32', 'vulkan-1.dll')
  if (existsSync(vulkanPath)) {
    return { installed: true, path: vulkanPath }
  }
  // 兜底：SysWOW64（64位系统的32位子系统）
  const wow64Path = join(sysRoot, 'SysWOW64', 'vulkan-1.dll')
  if (existsSync(wow64Path)) {
    return { installed: true, path: wow64Path }
  }
  return {
    installed: false,
    reason: '未找到 vulkan-1.dll。请更新显卡驱动（通常自带 Vulkan 支持），或从 https://vulkan.lunarg.com/sdk/home 下载安装 Vulkan Runtime。'
  }
}

// ========== 引擎可用性检测 ==========

/**
 * 引擎检测：直接复用 engine-manager 的能力（避免重复维护引擎定义）。
 * 检测每个引擎的 exe 是否存在，返回可用性。
 */
function probeEngines() {
  return engineManager.listEngines().map((e) => ({
    id: e.id,
    name: e.name,
    builtin: e.builtin,
    available: e.available,
    path: e.exePath,
    source: e.source
  }))
}

// ========== 推荐配置计算 ==========

/**
 * 根据显存、内存给出推荐配置。
 * 规则：
 *   显存 < 2GB：仅 2x，禁用视频超分，并发 1
 *   显存 2-4GB：≤3x，视频超分可选，并发 1
 *   显存 4-6GB：≤4x，视频超分可用，并发 1-2
 *   显存 ≥ 6GB：全开，并发 2
 *   内存 < 8GB：进一步限制（视频超分关闭）
 */
function computeRecommendation(gpus, memory, engines) {
  // 取最大显存的 GPU 作为主显卡
  const mainGpu = gpus.length > 0 ? gpus.reduce((a, b) => (a.vram > b.vram ? a : b)) : null
  const vramMB = mainGpu ? mainGpu.vram : 0
  const memGB = memory.totalGB

  let maxScale = 2
  let videoSuperRes = false
  let videoInterp = true // 插帧对显存要求相对低
  let concurrency = 1
  let level = 'minimal'

  if (vramMB >= 6144 && memGB >= 16) {
    maxScale = 4
    videoSuperRes = true
    videoInterp = true
    concurrency = 2
    level = 'high'
  } else if (vramMB >= 4096 && memGB >= 12) {
    maxScale = 4
    videoSuperRes = true
    videoInterp = true
    concurrency = 2
    level = 'medium'
  } else if (vramMB >= 2048 && memGB >= 8) {
    maxScale = 3
    videoSuperRes = true
    videoInterp = true
    concurrency = 1
    level = 'medium'
  } else if (vramMB >= 1024) {
    maxScale = 2
    videoSuperRes = false
    videoInterp = true
    concurrency = 1
    level = 'low'
  } else {
    maxScale = 2
    videoSuperRes = false
    videoInterp = false
    concurrency = 1
    level = 'minimal'
  }

  // 无可用 GPU 时降级
  if (!mainGpu) {
    maxScale = 2
    videoSuperRes = false
    videoInterp = false
    concurrency = 1
    level = 'minimal'
  }

  // 可用引擎数量
  const availableEngineCount = engines.filter((e) => e.available).length

  return {
    level, // minimal | low | medium | high
    mainGpu: mainGpu ? `${mainGpu.vendor} ${mainGpu.model}` : '未检测到 GPU',
    vramMB,
    maxScale,
    videoSuperRes,
    videoInterp,
    concurrency,
    availableEngineCount
  }
}

// ========== 主检测入口 ==========

/**
 * 执行完整兼容性检测。
 * @param {(stage: string, data?: any) => void} onProgress 阶段进度回调
 * @returns 完整设备报告对象
 */
async function runProbe(onProgress = () => {}) {
  logger.info('开始兼容性检测')
  onProgress('system', { status: 'running' })
  const system = await probeSystem()
  onProgress('system', { status: 'done' })

  onProgress('graphics', { status: 'running' })
  const gpus = await probeGraphics()
  onProgress('graphics', { status: 'done', gpus })

  onProgress('vulkan', { status: 'running' })
  const vulkan = probeVulkanRuntime()
  onProgress('vulkan', { status: 'done', vulkan })

  onProgress('engines', { status: 'running' })
  const engines = probeEngines()
  onProgress('engines', { status: 'done', engines })

  onProgress('recommend', { status: 'running' })
  const recommended = computeRecommendation(gpus, system.memory, engines)
  onProgress('recommend', { status: 'done' })

  const report = {
    system,
    gpus,
    vulkanRuntime: vulkan,
    engines,
    recommended,
    probedAt: new Date().toISOString()
  }

  logger.info('兼容性检测完成:', {
    gpu: recommended.mainGpu,
    vram: recommended.vramMB + 'MB',
    level: recommended.level,
    engines: recommended.availableEngineCount + '个可用'
  })

  return report
}

function round(n, digits = 1) {
  const f = Math.pow(10, digits)
  return Math.round(n * f) / f
}

export default {
  runProbe
}
