import { existsSync, readdirSync } from 'fs'
import { join, basename } from 'path'
import paths from './paths.js'
import logger from './logger.js'

/**
 * 引擎定义。所有 ncnn-vulkan 引擎的元信息集中在此。
 * exeName: 引擎可执行文件名
 * dirName: 引擎目录名（<id>-ncnn-vulkan）
 * modelsSub: 模型所在子目录名
 * modelNaming: 模型文件命名规则，用于从 .param 文件推断模型名
 * defaultModel: 不指定模型时的默认模型名
 * supportedScales: 支持的倍率
 * supportsDenoise: 是否支持降噪参数
 */
const ENGINE_DEFS = {
  realcugan: {
    id: 'realcugan',
    name: 'Real-CUGAN',
    builtin: true,
    exeName: 'realcugan-ncnn-vulkan.exe',
    dirName: 'realcugan-ncnn-vulkan',
    modelsSub: 'models-se',
    modelNaming: 'model-dir',
    defaultModel: 'models-se',
    supportedScales: [2, 3, 4],
    supportsDenoise: true,
    denoiseLevels: [-1, 0, 1, 2, 3],
    desc: '动漫/插画/人像超分，降噪可选（-1~3）'
  },
  realesrgan: {
    id: 'realesrgan',
    name: 'Real-ESRGAN',
    builtin: true,
    exeName: 'realesrgan-ncnn-vulkan.exe',
    dirName: 'realesrgan-ncnn-vulkan',
    modelsSub: 'models',
    modelNaming: 'model-file',
    defaultModel: 'realesr-animevideov3',
    supportedScales: [2, 3, 4],
    supportsDenoise: false,
    desc: '通用超分，含动漫视频模型'
  },
  waifu2x: {
    id: 'waifu2x',
    name: 'waifu2x',
    builtin: true,
    exeName: 'waifu2x-ncnn-vulkan.exe',
    dirName: 'waifu2x-ncnn-vulkan',
    modelsSub: 'models-cunet', // cunet 是最全的（含降噪+倍率）
    modelNaming: 'model-dir',
    defaultModel: 'models-cunet',
    supportedScales: [1, 2],
    supportsDenoise: true,
    denoiseLevels: [0, 1, 2, 3],
    desc: '动漫图片降噪放大（专精，最高 2x）'
  },
  realsr: {
    id: 'realsr',
    name: 'realSR',
    builtin: true,
    exeName: 'realsr-ncnn-vulkan.exe',
    dirName: 'realsr-ncnn-vulkan',
    modelsSub: 'models-DF2K',
    modelNaming: 'model-dir',
    defaultModel: 'models-DF2K',
    supportedScales: [2, 3, 4],
    supportsDenoise: false,
    desc: '真实照片超分（细节强）'
  },
  rife: {
    id: 'rife',
    name: 'RIFE',
    builtin: true,
    exeName: 'rife-ncnn-vulkan.exe',
    dirName: 'rife-ncnn-vulkan',
    modelsSub: 'rife-v4',
    modelNaming: 'model-dir',
    defaultModel: 'rife-v4',
    supportedScales: [], // 插帧引擎，不适用倍率
    supportsDenoise: false,
    isInterp: true,
    desc: '视频插帧（提升流畅度）'
  },
  cain: {
    id: 'cain',
    name: 'CAIN',
    builtin: true,
    exeName: 'cain-ncnn-vulkan.exe',
    dirName: 'cain-ncnn-vulkan',
    modelsSub: 'cain',
    modelNaming: 'model-dir',
    defaultModel: 'cain',
    supportedScales: [],
    supportsDenoise: false,
    isInterp: true,
    desc: '视频插帧（备选）'
  }
}

/**
 * 解析引擎 exe 的可能路径（工作目录优先，其次内置）。
 * @returns {{path:string, source:'workspace'|'bundled'} | null}
 */
function resolveEngine(engineId) {
  const def = ENGINE_DEFS[engineId]
  if (!def) return null

  const candidates = []
  // 工作目录下载的引擎
  candidates.push({ path: join(paths.currentWorkspace(), 'engines', def.dirName, def.exeName), source: 'workspace' })
  // 内置引擎
  if (def.builtin) {
    candidates.push({ path: join(paths.bundledEnginesDir(), def.dirName, def.exeName), source: 'bundled' })
  }
  for (const c of candidates) {
    if (existsSync(c.path)) return c
  }
  return null
}

/**
 * 获取引擎根目录（exe 所在目录）
 */
function resolveEngineDir(engineId) {
  const resolved = resolveEngine(engineId)
  if (!resolved) return null
  return { dir: join(resolved.path, '..'), source: resolved.source }
}

/**
 * 枚举引擎可用的模型列表，返回 [{ name, scales }]。
 * scales 为该模型支持的倍率数组（从实际 .param 文件名扫描，确保准确）。
 * 按引擎的 modelNaming 字段处理：
 *   - 'model-file'：realesrgan，扫描 modelsSub 下 xxx-xN.param，按去 -xN 后缀分组
 *   - 'model-dir'：realcugan/waifu2x/realsr 等，每个含 .param 的子目录是一个模型
 */
function listModels(engineId) {
  const def = ENGINE_DEFS[engineId]
  const engineDir = resolveEngineDir(engineId)
  if (!def || !engineDir) return []

  try {
    if (def.modelNaming === 'model-file') {
      // realesrgan：xxx-xN.param → 模型名 xxx，倍率 N
      const modelsDir = join(engineDir.dir, def.modelsSub)
      if (!existsSync(modelsDir)) return []
      const params = readdirSync(modelsDir).filter((f) => f.endsWith('.param'))
      const map = new Map() // name -> Set(scales)
      for (const f of params) {
        const m = f.replace(/\.param$/, '').match(/^(.+)-x(\d+)$/)
        if (m) {
          const [, name, scale] = m
          if (!map.has(name)) map.set(name, new Set())
          map.get(name).add(parseInt(scale, 10))
        }
      }
      return [...map.entries()].map(([name, scales]) => ({
        name,
        scales: [...scales].sort((a, b) => a - b)
      }))
    }
    if (def.modelNaming === 'model-dir') {
      // realcugan/waifu2x/realsr 等：含 .param 的子目录
      const entries = readdirSync(engineDir.dir, { withFileTypes: true })
      const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name)
      const result = []
      for (const d of dirs) {
        try {
          const files = readdirSync(join(engineDir.dir, d))
          const params = files.filter((f) => f.endsWith('.param'))
          if (params.length === 0) continue
          // 提取倍率，兼容多种命名：
          //   realcugan: up2x-no-denoise.param
          //   waifu2x:   scale2.0x_model.param / noise0_scale2.0x_model.param
          //   realsr:    x2.param / x4.param
          const scales = new Set()
          for (const f of params) {
            // 匹配 N.x 或 Nx 形式的倍率（如 2.0x、2x、4x）
            const m = f.match(/(\d+(?:\.\d+)?)x/i)
            if (m) scales.add(Math.round(parseFloat(m[1])))
          }
          result.push({
            name: d,
            scales: scales.size > 0 ? [...scales].sort((a, b) => a - b) : def.supportedScales
          })
        } catch {
          /* skip */
        }
      }
      return result
    }
  } catch (e) {
    logger.warn(`枚举 ${engineId} 模型失败:`, e.message)
  }
  return []
}

/**
 * 列出所有引擎及其状态（供 UI 选择）
 */
function listEngines() {
  return Object.values(ENGINE_DEFS).map((def) => {
    const resolved = resolveEngine(def.id)
    return {
      id: def.id,
      name: def.name,
      builtin: def.builtin,
      desc: def.desc,
      available: !!resolved,
      source: resolved?.source || null,
      exePath: resolved?.path || null,
      supportedScales: def.supportedScales,
      supportsDenoise: def.supportsDenoise,
      denoiseLevels: def.denoiseLevels || [],
      isInterp: !!def.isInterp, // 插帧引擎标识（rife/cain），供 UI 过滤
      models: resolved ? listModels(def.id) : []
    }
  })
}

/**
 * 获取单个引擎定义
 */
function getEngineDef(engineId) {
  return ENGINE_DEFS[engineId] || null
}

export default {
  ENGINE_DEFS,
  resolveEngine,
  resolveEngineDir,
  listModels,
  listEngines,
  getEngineDef
}
