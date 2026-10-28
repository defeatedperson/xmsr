import { statfsSync, statSync } from 'fs'
import paths from './paths.js'
import { getConfig } from './store.js'

// 输出格式系数（相对原图字节的膨胀/压缩比）
const FORMAT_FACTOR = {
  png: 1.0, // 无损，约等于原图
  jpg: 0.3,
  jpeg: 0.3,
  webp: 0.5,
  bmp: 1.0
}

/**
 * 估算图片超分所需磁盘空间（字节）
 * @param {number} srcBytes 原图字节数
 * @param {number} scale 放大倍率
 * @param {string} format 输出格式
 * @returns 预计所需字节数
 */
function estimateImageSpace(srcBytes, scale, format = 'png') {
  const factor = FORMAT_FACTOR[format.toLowerCase()] || 1.0
  // 输出图 ≈ 原图 × scale² × 格式系数；再预留 1.2 倍临时开销
  const outputBytes = srcBytes * scale * scale * factor
  return Math.ceil(outputBytes * 1.2)
}

/**
 * 估算视频超分所需磁盘空间（字节）
 * 公式：时长 × 源帧率 × scale² × 单帧PNG字节 × 保守倍率
 * @param {number} durationSec 视频时长（秒）
 * @param {number} fps 源帧率
 * @param {number} scale 放大倍率
 * @param {number} srcBytes 视频总字节数（用于估算单帧）
 * @param {number} targetFps 目标帧率（插帧后，0 表示不插帧）
 * @returns 预计所需字节数
 */
function estimateVideoSpace(durationSec, fps, scale, srcBytes, targetFps = 0) {
  // 防护：fps 无效时回退 25（避免除零导致 Infinity）
  const safeFps = fps > 0 ? fps : 25
  const safeDuration = durationSec > 0 ? durationSec : 1
  const srcFrameCount = Math.max(1, Math.round(safeDuration * safeFps))
  // 单帧源 PNG 估算（视频压缩率高，原始帧大小约为 srcBytes / frameCount × 5）
  const perFrameBytes = srcFrameCount > 0 ? (srcBytes / srcFrameCount) * 5 : 1024 * 1024
  // 超分阶段：帧数不变，单帧 ×scale²
  const superResBytes = srcFrameCount * perFrameBytes * scale * scale
  // 插帧阶段：新增帧数 × 单帧大小（targetFps=0 表示不插帧）
  const interpFrames = targetFps > safeFps ? safeDuration * (targetFps - safeFps) : 0
  const interpBytes = interpFrames * perFrameBytes * scale * scale
  // 乘保守倍率（拆帧 + 超分帧 + 合成同时存在）
  const multiplier = getConfig().videoCacheMultiplier || 2.5
  return Math.ceil((superResBytes + interpBytes) * multiplier)
}

/**
 * 检查指定估算量在目标路径所在磁盘是否充足。
 * @param {number} requiredBytes 预计所需字节数
 * @param {string} targetPath 目标路径（默认工作目录）
 * @returns {{enough:boolean, requiredGB:number, availableGB:number, suggested:string}}
 */
function checkSpace(requiredBytes, targetPath) {
  const p = targetPath || paths.currentWorkspace()
  let available = 0
  try {
    const stats = statfsSync(p)
    available = stats.bavail * stats.bsize
  } catch {
    available = 0
  }
  const requiredGB = round(requiredBytes / 1024 / 1024 / 1024, 2)
  const availableGB = round(available / 1024 / 1024 / 1024, 2)
  const enough = available >= requiredBytes
  let suggested = ''
  if (!enough) {
    const gap = requiredBytes - available
    suggested = `空间不足，还需约 ${round(gap / 1024 / 1024 / 1024, 2)} GB。建议清理缓存或更换工作目录。`
  }
  return { enough, requiredBytes, requiredGB, available, availableGB, suggested }
}

/**
 * 对一组图片做磁盘检查（便利方法）
 * @param {Array<{bytes:number}>} images 图片列表
 * @param {number} scale
 * @param {string} format
 */
function checkImagesSpace(images, scale, format, targetPath) {
  const totalRequired = images.reduce(
    (sum, img) => sum + estimateImageSpace(img.bytes || 0, scale, format),
    0
  )
  return checkSpace(totalRequired, targetPath)
}

function round(n, digits = 2) {
  const f = Math.pow(10, digits)
  return Math.round(n * f) / f
}

export default {
  estimateImageSpace,
  estimateVideoSpace,
  checkSpace,
  checkImagesSpace,
  FORMAT_FACTOR
}
