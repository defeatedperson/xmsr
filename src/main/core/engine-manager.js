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
      // 无倍率后缀的固定倍率模型（如 realesrgan-x4plus.param）只暴露原生倍率：
      // exe 对"非原生倍率"走 4x 推理后缩放的路径，存在上游 tile 错位 bug
      // （xinntao/Real-ESRGAN#247、Real-ESRGAN-ncnn-vulkan#73），不能暴露
      const modelsDir = join(engineDir.dir, def.modelsSub)
      if (!existsSync(modelsDir)) return []
      const params = readdirSync(modelsDir).filter((f) => f.endsWith('.param'))
      const map = new Map() // name -> Set(scales)
      for (const f of params) {
        const base = f.replace(/\.param$/, '')
        const m = base.match(/^(.+)-x(\d+)$/)
        if (m) {
          const [, name, scale] = m
          if (!map.has(name)) map.set(name, new Set())
          map.get(name).add(parseInt(scale, 10))
        } else if (!map.has(base)) {
          const native = parseNativeScale(base)
          map.set(base, new Set(native ? [native] : def.supportedScales))
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
          // 从文件名解析 倍率 + 降噪等级（各引擎命名规则见 parseModelFile）：
          //   realcugan: up2x-no-denoise.param / up2x-conservative.param / up2x-denoise1x.param
          //   waifu2x:   scale2.0x_model.param / noise2_scale2.0x_model.param
          //   realsr:    x2.param / x4.param
          const scaleSet = new Set()
          const denoiseByScale = new Map() // scale -> Set(denoise)
          for (const f of params) {
            const info = parseModelFile(def, f)
            if (!info) continue
            scaleSet.add(info.scale)
            if (info.denoise !== null) {
              if (!denoiseByScale.has(info.scale)) denoiseByScale.set(info.scale, new Set())
              denoiseByScale.get(info.scale).add(info.denoise)
            }
          }
          const entry = {
            name: d,
            scales: scaleSet.size > 0 ? [...scaleSet].sort((a, b) => a - b) : def.supportedScales
          }
          // 只有解析出降噪信息的引擎（realcugan/waifu2x）才附带该字段
          if (denoiseByScale.size > 0) {
            entry.denoiseByScale = Object.fromEntries(
              [...denoiseByScale.entries()]
                .sort((a, b) => a[0] - b[0])
                .map(([s, set]) => [s, [...set].sort((a, b) => a - b)])
            )
          }
          result.push(entry)
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
 * 从固定倍率模型名解析原生倍率（如 realesrgan-x4plus → 4）。
 * 解析不出返回 null（调用方自行兜底）。
 */
function parseNativeScale(modelName) {
  const m = modelName.match(/x\s*(\d+(?:\.\d+)?)/i)
  if (!m) return null
  return Math.round(parseFloat(m[1]))
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
      defaultModel: def.defaultModel || null, // 推荐默认模型（UI 初始选中用）
      isInterp: !!def.isInterp, // 插帧引擎标识（rife/cain），供 UI 过滤
      models: resolved ? listModels(def.id) : []
    }
  })
}

/**
 * 从模型文件名解析 倍率/降噪等级（与各引擎 exe 的文件命名规则一一对应）。
 * @returns {{scale:number, denoise:(number|null)}|null} denoise 为 null 表示该引擎无降噪概念
 */
function parseModelFile(def, filename) {
  if (def.id === 'realcugan') {
    // up2x-no-denoise.param / up2x-conservative.param / up2x-denoise3x.param
    const m = filename.match(/^up(\d+)x-(no-denoise|conservative|denoise(\d+)x)\.param$/)
    if (!m) return null
    const denoise = m[2] === 'no-denoise' ? -1 : m[2] === 'conservative' ? 0 : parseInt(m[3], 10)
    return { scale: parseInt(m[1], 10), denoise }
  }
  if (def.id === 'waifu2x') {
    // noise2_scale2.0x_model.param（降噪+2x）/ noise2_model.param（仅降噪）/ scale2.0x_model.param（无降噪 2x）
    let m = filename.match(/^noise(\d+)_scale2\.0x_model\.param$/)
    if (m) return { scale: 2, denoise: parseInt(m[1], 10) }
    m = filename.match(/^noise(\d+)_model\.param$/)
    if (m) return { scale: 1, denoise: parseInt(m[1], 10) }
    if (filename === 'scale2.0x_model.param') return { scale: 2, denoise: -1 }
    return null
  }
  if (def.id === 'realsr') {
    // x4.param（注意是 x 在前）
    const m = filename.match(/^x(\d+)\.param$/)
    if (m) return { scale: parseInt(m[1], 10), denoise: null }
    return null
  }
  // 通用兜底：从名字提取倍率（兼容 Nx / N.x / xN 写法），如 rife 等插帧模型通常解析不出
  const m = filename.match(/(\d+(?:\.\d+)?)\s*x|x\s*(\d+(?:\.\d+)?)/i)
  if (m) return { scale: Math.round(parseFloat(m[1] || m[2])), denoise: null }
  return null
}

/**
 * 按引擎命名规则拼出 模型×倍率×降噪 对应的 .param 候选相对路径（任一存在即合法）。
 * 未知规则返回 null（跳过校验）。
 */
function modelParamCandidates(def, model, scale, denoise) {
  if (def.id === 'realcugan') {
    const suffix = denoise === -1 ? 'no-denoise' : denoise === 0 ? 'conservative' : `denoise${denoise}x`
    return [join(model, `up${scale}x-${suffix}.param`)]
  }
  if (def.id === 'waifu2x') {
    if (scale === 1) return [join(model, `noise${denoise}_model.param`)]
    if (denoise === -1) return [join(model, 'scale2.0x_model.param')]
    return [join(model, `noise${denoise}_scale2.0x_model.param`)]
  }
  if (def.id === 'realsr') {
    return [join(model, `x${scale}.param`)]
  }
  if (def.id === 'realesrgan') {
    // 多倍率模型为 xxx-xN.param，精确匹配；
    // 固定倍率模型（realesrgan-x4plus 等）仅在 目标倍率==原生倍率 时放行
    // （非原生倍率会触发上游 exe 的 tile 错位 bug）
    const candidates = [join(def.modelsSub, `${model}-x${scale}.param`)]
    const native = parseNativeScale(model)
    if (native === null || native === scale) {
      candidates.push(join(def.modelsSub, `${model}.param`))
    }
    return candidates
  }
  return null
}

/**
 * 调用引擎前校验 模型×倍率×降噪 对应的模型文件是否存在。
 * 部分 ncnn-vulkan 引擎在模型文件缺失时不会退出，而是带着空网络继续跑导致进程崩溃
 * （退出码 0xC0000409），因此必须在启动前拦截。
 * @returns {{ok:boolean, error?:string}}
 */
function checkParams(engineId, params = {}) {
  const def = ENGINE_DEFS[engineId]
  if (!def) return { ok: false, error: `未知引擎 ${engineId}` }
  if (def.isInterp) return { ok: true }

  const engineDir = resolveEngineDir(engineId)
  if (!engineDir) return { ok: false, error: `引擎 ${engineId} 不可用` }

  const scale = Number(params.scale)
  if (!scale) return { ok: true } // 未指定倍率时交给引擎默认值
  const model = params.model || def.defaultModel
  // 与 image-pipeline.buildArgs 的默认降噪保持一致
  const denoise = params.denoise !== undefined ? params.denoise : (def.denoiseLevels?.[0] ?? -1)

  // 固定倍率模型 + 非原生倍率：给出针对性提示（通用报错会误导用户去补模型文件）
  if (def.id === 'realesrgan') {
    const native = parseNativeScale(model)
    if (native !== null && native !== scale && existsSync(join(engineDir.dir, def.modelsSub, `${model}.param`))) {
      return {
        ok: false,
        error: `${def.name} 模型 ${model} 为固定 ${native}x 模型，不支持 ${scale}x（非原生倍率会触发上游引擎 tile 错位 bug）。请将倍率改为 ${native}x，或改用 realesr-animevideov3 等支持 ${scale}x 的模型`
      }
    }
  }

  const rel = modelParamCandidates(def, model, scale, denoise)
  if (!rel) return { ok: true } // 未知命名规则，不校验
  if (!rel.some((p) => existsSync(join(engineDir.dir, p)))) {
    const denoiseText = def.supportsDenoise ? ` + 降噪${denoise}` : ''
    return {
      ok: false,
      error: `${def.name} 模型 ${model} 不支持 ${scale}x${denoiseText} 的组合（缺少 ${rel[0].replace(/\\/g, '/')}），请更换模型、倍率或降噪等级`
    }
  }
  return { ok: true }
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
  getEngineDef,
  checkParams
}
