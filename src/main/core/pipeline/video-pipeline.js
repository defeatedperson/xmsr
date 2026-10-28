import { spawn } from 'child_process'
import { join, basename } from 'path'
import { existsSync, readdirSync, mkdirSync, rmSync, renameSync, statSync } from 'fs'
import ffmpegMgr from '../ffmpeg.js'
import engineManager from '../engine-manager.js'
import imagePipeline from './image-pipeline.js'
import paths from '../paths.js'
import logger from '../logger.js'

// ========== 视频信息探测 ==========

/**
 * 用 ffmpeg -i 获取视频信息（时长、帧率、宽高、音轨）。
 * 带超时保护，防止损坏视频导致永久阻塞。
 */
function probeVideo(videoPath) {
  return new Promise((resolve) => {
    const ffmpeg = ffmpegMgr.getFfmpegPath()
    const child = spawn(ffmpeg, ['-i', videoPath], { windowsHide: true })
    let stderr = ''
    child.stderr.on('data', (d) => (stderr += d.toString()))
    // 超时保护（10秒）
    const timer = setTimeout(() => {
      try { child.kill() } catch { /* ignore */ }
      logger.warn('probeVideo 超时')
    }, 10000)
    child.on('close', () => {
      clearTimeout(timer)
      resolve(parseFfmpegInfo(stderr))
    })
    child.on('error', () => {
      clearTimeout(timer)
      resolve(null)
    })
  })
}

function parseFfmpegInfo(stderr) {
  const info = { duration: 0, fps: 0, width: 0, height: 0, hasAudio: false }
  try {
    // Duration: 00:00:10.50
    const durMatch = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/)
    if (durMatch) {
      info.duration = (+durMatch[1] * 3600) + (+durMatch[2] * 60) + parseFloat(durMatch[3])
    }
    // 分辨率：Video: ... 1920x1080 ...
    const videoMatch = stderr.match(/Video:.*?(\d{2,5})x(\d{2,5})/)
    if (videoMatch) {
      info.width = +videoMatch[1]
      info.height = +videoMatch[2]
    }
    // 帧率：优先 fps，其次 tbr（很多容器只输出 tbr）
    const fpsMatch = stderr.match(/(\d+(?:\.\d+)?)\s*fps/)
    const tbrMatch = stderr.match(/(\d+(?:\.\d+)?)\s*tbr/)
    if (fpsMatch) info.fps = parseFloat(fpsMatch[1])
    else if (tbrMatch) info.fps = parseFloat(tbrMatch[1])
    // fps 兜底：无法探测时用 25（避免 0 导致下游除零）
    if (!info.fps || info.fps <= 0) info.fps = 25
    // 音轨：匹配 Stream #x:y ... Audio:
    info.hasAudio = /Stream\s+#\d+:\d+.*?Audio:/i.test(stderr)
    logger.info('视频信息:', JSON.stringify(info))
  } catch (e) {
    logger.warn('解析视频信息失败:', e.message)
  }
  return info
}

// ========== 阶段1：ffmpeg 拆帧 ==========

function extractFrames(videoPath, framesDir, onProgress, controller, totalDuration, totalFrames) {
  return new Promise((resolve, reject) => {
    mkdirSync(framesDir, { recursive: true })
    const ffmpeg = ffmpegMgr.getFfmpegPath()
    // PNG 无损拆帧；-vsync 0/passthrough 保留所有帧
    const args = ['-i', videoPath, '-vsync', '0', join(framesDir, '%08d.png')]
    logger.info('拆帧:', ffmpeg, args.join(' '))
    const child = spawn(ffmpeg, args, { windowsHide: true })

    if (controller) {
      controller.signal.addEventListener('abort', () => killProcessTree(child))
    }

    child.stderr.on('data', (d) => {
      const text = d.toString()
      // 优先用 frame= 计算进度（配合总帧数），其次 time=
      const frameMatch = text.match(/frame=\s*(\d+)/)
      if (frameMatch && totalFrames > 0) {
        onProgress(Math.min(100, (parseInt(frameMatch[1], 10) / totalFrames) * 100))
        return
      }
      const timeMatch = text.match(/time=\s*(\d+):(\d+):(\d+(?:\.\d+)?)/)
      if (timeMatch && totalDuration > 0) {
        const t = (+timeMatch[1] * 3600) + (+timeMatch[2] * 60) + parseFloat(timeMatch[3])
        onProgress(Math.min(100, (t / totalDuration) * 100))
      }
    })

    child.on('close', (code) => {
      if (code === 0 || controller?.signal.aborted) resolve()
      else reject(new Error(`拆帧失败，退出码 ${code}`))
    })
    child.on('error', reject)
  })
}

// ========== 阶段2：超分每帧（并发） ==========

/**
 * @returns {{success:boolean, failedCount:number, total:number}}
 */
async function superResolveFrames(srcFramesDir, outFramesDir, params, concurrency, onProgress, controller) {
  mkdirSync(outFramesDir, { recursive: true })
  const allFrames = readdirSync(srcFramesDir).filter((f) => f.endsWith('.png')).sort()
  // 断点续跑：跳过已存在且非空的输出帧
  const todo = allFrames.filter((f) => {
    const outPath = join(outFramesDir, changeSuffix(f, params.scale))
    if (!existsSync(outPath)) return true
    // 校验文件非空（防止半成品）
    try { return statSync(outPath).size === 0 } catch { return true }
  })
  logger.info(`超分帧：共 ${allFrames.length}，待处理 ${todo.length}`)

  let done = allFrames.length - todo.length
  let failedCount = 0
  const total = allFrames.length

  const queue = [...todo]
  async function worker() {
    while (queue.length > 0 && !controller?.signal.aborted) {
      const frameName = queue.shift()
      const src = join(srcFramesDir, frameName)
      const out = join(outFramesDir, changeSuffix(frameName, params.scale))
      const res = await imagePipeline.processOne({
        engineId: params.engineId,
        input: src,
        output: out,
        params,
        onLog: () => {}
      }, controller)
      done++
      if (!res.success) {
        failedCount++
        logger.warn(`超分失败 ${frameName}:`, res.error)
      }
      onProgress(done, total)
    }
  }

  const workers = []
  for (let i = 0; i < Math.max(1, concurrency); i++) workers.push(worker())
  await Promise.all(workers)

  return { success: failedCount === 0, failedCount, total }
}

function changeSuffix(filename, scale) {
  return filename.replace(/(\.[^.]+)$/, `_x${scale}$1`)
}

// ========== 阶段3：RIFE 插帧 ==========

/**
 * RIFE 插帧：用 -n 传目标总帧数（= 源帧数 × 倍数），-m 传模型路径。
 * 输出连续序号 PNG（00000001.png, 00000002.png...）。
 */
async function interpolateFrames(srcFramesDir, outFramesDir, mult, modelPath, onProgress, controller) {
  const rifeResolved = engineManager.resolveEngine('rife')
  if (!rifeResolved) throw new Error('RIFE 引擎未安装')

  mkdirSync(outFramesDir, { recursive: true })
  // 计算目标总帧数
  const srcCount = readdirSync(srcFramesDir).filter((f) => f.endsWith('.png')).length
  const targetCount = Math.round(srcCount * mult)

  return new Promise((resolve, reject) => {
    // -n targetCount（目标总帧数），-m 模型路径
    const args = ['-i', srcFramesDir, '-o', outFramesDir, '-n', String(targetCount), '-m', modelPath]
    logger.info('RIFE 插帧:', rifeResolved.path, args.join(' '))
    const child = spawn(rifeResolved.path, args, {
      cwd: join(rifeResolved.path, '..'),
      windowsHide: true
    })
    if (controller) {
      controller.signal.addEventListener('abort', () => killProcessTree(child))
    }
    child.stdout.on('data', (d) => {
      const text = d.toString()
      const match = text.match(/(\d+(?:\.\d+)?)%/)
      if (match) onProgress(parseFloat(match[1]), 100)
    })
    child.stderr.on('data', () => {})
    child.on('close', (code) => {
      if (code === 0 || controller?.signal.aborted) resolve()
      else reject(new Error(`RIFE 插帧失败，退出码 ${code}`))
    })
    child.on('error', reject)
  })
}

// ========== 阶段4：ffmpeg 合成 ==========

/**
 * 合成前先把最终帧目录的文件统一重命名为连续序号（解决命名不一致 + glob 问题）。
 * 然后用 %08d.png 喂给 ffmpeg。
 */
function normalizeFramesForCompose(framesDir, normalizedDir) {
  mkdirSync(normalizedDir, { recursive: true })
  const files = readdirSync(framesDir)
    .filter((f) => f.endsWith('.png'))
    .sort() // 按文件名排序，保证帧顺序
  let seq = 1
  for (const f of files) {
    const newName = String(seq).padStart(8, '0') + '.png'
    // 复制（用 rename 移动，原目录后续清理）
    renameSync(join(framesDir, f), join(normalizedDir, newName))
    seq++
  }
  return normalizedDir
}

function composeVideo(framesDir, outputPath, srcVideoPath, fps, crf, hasAudio, onProgress, controller, totalDuration) {
  return new Promise((resolve, reject) => {
    mkdirSync(join(outputPath, '..'), { recursive: true })
    const ffmpeg = ffmpegMgr.getFfmpegPath()
    // 帧率保留 3 位小数，去掉浮点乘法产生的长尾（如 71.94000000000001）
    const fpsStr = String(Math.round(fps * 1000) / 1000)
    const args = [
      '-y',
      '-framerate', fpsStr,           // 必须在 -i 之前
      '-i', join(framesDir, '%08d.png'),
      '-i', srcVideoPath,
      '-map', '0:v:0'
    ]
    // 音轨：有则 map 并用 aac 重编码（兼容 mkv/opus 等源格式）
    if (hasAudio) {
      args.push('-map', '1:a:0?', '-c:a', 'aac', '-b:a', '192k')
    }
    args.push(
      '-c:v', 'libx264',
      '-crf', String(crf || 20),
      '-preset', 'medium',
      '-pix_fmt', 'yuv420p',
      '-shortest',
      outputPath
    )
    logger.info('合成视频:', ffmpeg, args.join(' '))
    const child = spawn(ffmpeg, args, { windowsHide: true })
    if (controller) {
      controller.signal.addEventListener('abort', () => killProcessTree(child))
    }
    child.stderr.on('data', (d) => {
      const text = d.toString()
      const timeMatch = text.match(/time=\s*(\d+):(\d+):(\d+(?:\.\d+)?)/)
      if (timeMatch && totalDuration > 0) {
        const t = (+timeMatch[1] * 3600) + (+timeMatch[2] * 60) + parseFloat(timeMatch[3])
        onProgress(Math.min(100, (t / totalDuration) * 100))
      }
    })
    child.on('close', (code) => {
      if (code === 0 || controller?.signal.aborted) resolve()
      else reject(new Error(`合成失败，退出码 ${code}`))
    })
    child.on('error', reject)
  })
}

// Windows 下杀整棵进程树（防止子进程残留占显存）
function killProcessTree(child) {
  if (!child || !child.pid) return
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true })
    } else {
      child.kill()
    }
  } catch { /* ignore */ }
}

// ========== 主流水线 ==========

/**
 * 执行完整视频超分（+可选插帧）流水线。
 */
async function runVideoPipeline(opts, controller) {
  const { videoPath, superRes, interp, crf, concurrency, onStage, onProgress, onLog } = opts

  // 前置校验 模型×倍率×降噪 组合（避免拆完一整段视频后才在超分阶段失败）
  const paramCheck = engineManager.checkParams(superRes.engineId, superRes)
  if (!paramCheck.ok) {
    throw new Error(paramCheck.error)
  }

  // 0. 探测视频信息
  onStage('probe', { status: 'running' })
  onProgress(0)
  const info = await probeVideo(videoPath)
  if (!info || !info.duration) {
    throw new Error('无法读取视频信息（可能不是有效视频或 ffmpeg 不可用）')
  }
  onLog(`视频：${info.width}x${info.height}，${info.fps}fps，时长 ${info.duration.toFixed(1)}s，${info.hasAudio ? '有音轨' : '无音轨'}`)
  const totalFrames = Math.round(info.duration * info.fps)
  onStage('probe', { status: 'done', info })

  // 准备 cache 目录
  const ws = paths.currentWorkspace()
  const taskCache = join(paths.workspaceCacheDir(ws), `video_${Date.now()}`)
  const srcFramesDir = join(taskCache, 'frames_src')
  const srFramesDir = join(taskCache, 'frames_sr')
  const interpFramesDir = join(taskCache, 'frames_interp')

  try {
    // 1. 拆帧
    onStage('extract', { status: 'running' })
    onProgress(0)
    onLog(`阶段1/4：拆帧（预计 ${totalFrames} 帧）`)
    await extractFrames(videoPath, srcFramesDir, (p) => onProgress(p), controller, info.duration, totalFrames)
    if (controller?.signal.aborted) return { canceled: true }
    onStage('extract', { status: 'done' })

    // 2. 超分每帧
    onStage('superres', { status: 'running' })
    onProgress(0)
    onLog(`阶段2/4：超分（并发 ${concurrency}）`)
    const srResult = await superResolveFrames(
      srcFramesDir,
      srFramesDir,
      { ...superRes, format: 'png' },
      concurrency,
      (current, total) => onProgress(total > 0 ? (current / total) * 100 : 0),
      controller
    )
    if (controller?.signal.aborted) return { canceled: true }
    if (srResult.failedCount > 0) {
      throw new Error(`超分阶段有 ${srResult.failedCount}/${srResult.total} 帧失败，已中止（可能是显存不足，请降低并发数或倍率）`)
    }
    onLog(`超分完成：${srResult.total} 帧`)
    onStage('superres', { status: 'done' })

    // 3. 可选插帧
    let finalFramesDir = srFramesDir
    let finalFps = info.fps
    if (interp?.enabled) {
      onStage('interp', { status: 'running' })
      onProgress(0)
      const mult = Math.max(2, Math.min(8, Math.round(interp.targetFps / info.fps)))
      onLog(`阶段3/4：插帧（预期 ≥${interp.targetFps}fps，实际 ${mult}x → 约 ${Math.round(info.fps * mult)}fps）`)
      // RIFE 模型路径：优先用用户选的，否则默认 rife-v4
      const rifeModel = interp.model || 'rife-v4'
      await interpolateFrames(
        srFramesDir,
        interpFramesDir,
        mult,
        rifeModel,
        (current, total) => onProgress(total > 0 ? (current / total) * 100 : 0),
        controller
      )
      if (controller?.signal.aborted) return { canceled: true }
      finalFramesDir = interpFramesDir
      // 合成帧率必须 = 源帧率 × 实际插帧倍数（方案A）。
      // RIFE 只能按整数倍数插帧，实际输出帧率不一定恰好等于用户选择的
      // targetFps（那只是"预期下限"）。若直接用 targetFps 编码，
      // 当 源帧率×mult ≠ targetFps 时，输出时长会被拉长（慢放）或压缩。
      // 用 info.fps×mult 可保证：输出时长 ≈ 原时长，速度不变。
      finalFps = info.fps * mult
      onStage('interp', { status: 'done' })
    } else {
      onLog('阶段3/4：跳过插帧（未启用）')
    }

    // 4. 合成视频（先归一化帧序列）
    onStage('compose', { status: 'running' })
    onProgress(0)
    const normalizedDir = join(taskCache, 'frames_final')
    normalizeFramesForCompose(finalFramesDir, normalizedDir)
    // 文件名使用实际输出帧率（finalFps），而非用户选择的预期值，避免误导
    const outName = `${basename(videoPath).replace(/\.[^.]+$/, '')}_x${superRes.scale}${interp?.enabled ? `_${Math.round(finalFps)}fps` : ''}.mp4`
    const outputPath = join(opts.outputDir, outName)
    onLog(`阶段4/4：合成视频 → ${outName}`)
    await composeVideo(
      normalizedDir,
      outputPath,
      videoPath,
      finalFps,
      crf,
      info.hasAudio,
      (p) => onProgress(p),
      controller,
      info.duration
    )
    if (controller?.signal.aborted) return { canceled: true }
    onStage('compose', { status: 'done' })

    onLog('视频处理完成：' + outputPath)
    return { success: true, outputPath, canceled: false }
  } finally {
    // 无论成功/失败/取消，都清理本次任务的 cache（释放空间）
    // 注意：这会清除断点续跑的能力，但避免了磁盘爆炸
    try {
      if (existsSync(taskCache)) {
        rmSync(taskCache, { recursive: true, force: true })
        logger.info('已清理任务 cache:', taskCache)
      }
    } catch (e) {
      logger.warn('清理 cache 失败:', e.message)
    }
  }
}

export default {
  runVideoPipeline,
  probeVideo
}
