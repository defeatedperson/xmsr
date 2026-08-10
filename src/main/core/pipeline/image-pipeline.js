import { spawn } from 'child_process'
import { join, basename, extname } from 'path'
import { existsSync } from 'fs'
import engineManager from '../engine-manager.js'
import paths from '../paths.js'
import logger from '../logger.js'

/**
 * 构造 ncnn 引擎的命令行参数。
 * 不同引擎参数略有差异，统一在此处理。
 * @param {object} def 引擎定义
 * @param {string} input 输入路径
 * @param {string} output 输出路径
 * @param {object} params { model, scale, denoise, format }
 */
function buildArgs(def, input, output, params) {
  const args = ['-i', input, '-o', output]

  // 模型：按 modelNaming 区分参数
  // - 'model-file'（realesrgan）：-n 指定模型名
  // - 'model-dir'（realcugan/waifu2x/realsr）：-m 指定模型目录（相对路径，cwd 为 exe 目录）
  if (params.model) {
    if (def.modelNaming === 'model-file') {
      args.push('-n', params.model)
    } else if (def.modelNaming === 'model-dir') {
      args.push('-m', params.model)
    }
  }

  // 倍率
  if (params.scale && def.supportedScales.length > 0) {
    args.push('-s', String(params.scale))
  }

  // 降噪：realcugan/waifu2x 用 -n 传降噪等级（realsr/realesrgan 不支持）
  // 注意 realcugan 的 -n 范围 -1~3，waifu2x 的 -n 范围 0~3
  if (def.supportsDenoise) {
    const denoise = params.denoise !== undefined ? params.denoise : (def.denoiseLevels?.[0] ?? -1)
    args.push('-n', String(denoise))
  }

  // 输出格式
  if (params.format) {
    args.push('-f', params.format)
  }

  return args
}

/**
 * 处理单张图片（内部方法，实际调引擎）。
 * @param {object} opts { engineId, input, output, params, onLog }
 * @param {AbortController} controller 取消控制器（可选）
 * @returns {Promise<{success:boolean, error?:string}>}
 */
function processOne({ engineId, input, output, params, onLog }, controller) {
  return new Promise((resolve) => {
    const resolved = engineManager.resolveEngine(engineId)
    if (!resolved) {
      resolve({ success: false, error: `引擎 ${engineId} 不可用` })
      return
    }

    const def = engineManager.getEngineDef(engineId)

    // 校验倍率是否被引擎支持（防止预设等传入非法倍率导致引擎找不到模型文件）
    if (def.supportedScales.length > 0 && params.scale && !def.supportedScales.includes(params.scale)) {
      resolve({ success: false, error: `${def.name} 不支持 ${params.scale}x 倍率（支持 ${def.supportedScales.join('/')}x）` })
      return
    }

    const args = buildArgs(def, input, output, params)
    const cmdLine = `${resolved.path} ${args.join(' ')}`
    logger.info('执行图片超分:', cmdLine)
    onLog?.(`命令: ${cmdLine}`)

    const child = spawn(resolved.path, args, {
      cwd: join(resolved.path, '..'),
      windowsHide: true
    })

    // 注册取消
    if (controller) {
      controller.signal.addEventListener('abort', () => {
        try {
          child.kill()
        } catch {
          /* ignore */
        }
      })
    }

    let stderr = ''
    child.stdout.on('data', (data) => {
      const text = data.toString()
      logger.debug(`[${engineId}]`, text.trimEnd())
      onLog?.(text.trimEnd())
      // 解析进度（ncnn 输出形如 "12.34%"）
      const match = text.match(/(\d+(?:\.\d+)?)%/)
      if (match) {
        onLog?.({ progress: parseFloat(match[1]) })
      }
    })
    child.stderr.on('data', (data) => {
      const text = data.toString()
      stderr += text
      logger.debug(`[${engineId} stderr]`, text.trimEnd())
    })

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true })
      } else {
        resolve({ success: false, error: `进程退出码 ${code}: ${stderr.slice(-500)}` })
      }
    })
    child.on('error', (err) => {
      resolve({ success: false, error: err.message })
    })
  })
}

/**
 * 批量处理图片。
 * @param {object} opts
 *   { engineId, images:[{path, bytes}], params:{model,scale,denoise,format}, outputDir,
 *     onProgress:(current,total)=>void, onLog:(msg)=>void }
 * @param {AbortController} controller
 */
async function processBatch(opts, controller) {
  const { engineId, images, params, outputDir, onProgress, onLog } = opts
  const total = images.length
  const results = []

  for (let i = 0; i < total; i++) {
    if (controller?.signal.aborted) {
      onLog?.('任务已取消')
      break
    }

    const src = images[i].path
    const ext = params.format ? `.${params.format}` : extname(src)
    const outName = changeExt(basename(src), ext)
    // 加 _xNs 后缀避免覆盖（如 pic_x4.png）
    const scaleSuffix = `_x${params.scale || 1}`
    const outPath = join(outputDir, insertSuffix(outName, scaleSuffix))

    onProgress?.(i, total, basename(src))
    onLog?.(`[${i + 1}/${total}] 处理 ${basename(src)}`)

    const res = await processOne(
      { engineId, input: src, output: outPath, params, onLog },
      controller
    )

    results.push({
      input: src,
      output: res.success ? outPath : null,
      success: res.success,
      error: res.error || null
    })

    if (!res.success) {
      logger.warn(`处理失败 ${src}:`, res.error)
    }
  }

  onProgress?.(total, total, '')
  return results
}

function changeExt(filename, newExt) {
  return filename.replace(/\.[^.]+$/, '') + newExt
}

function insertSuffix(filename, suffix) {
  // pic.png → pic_x4.png
  return filename.replace(/(\.[^.]+)$/, `${suffix}$1`)
}

export default {
  processOne,
  processBatch,
  buildArgs
}
