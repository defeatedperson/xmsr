import { existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import logger from './logger.js'

let cachedPath = ''

/**
 * 解析 ffmpeg 可执行文件路径。
 * 统一用 resources/ffmpeg/ffmpeg.exe（与超分引擎同机制，打包后最可靠）。
 */
function getFfmpegPath() {
  if (cachedPath && existsSync(cachedPath)) return cachedPath

  // 打包后：resourcesPath/ffmpeg/ffmpeg.exe
  // dev：项目根/resources/ffmpeg/ffmpeg.exe
  const candidates = []
  if (app.isPackaged) {
    candidates.push(join(process.resourcesPath, 'ffmpeg', 'ffmpeg.exe'))
  }
  candidates.push(join(app.getAppPath(), 'resources', 'ffmpeg', 'ffmpeg.exe'))

  for (const p of candidates) {
    if (existsSync(p)) {
      cachedPath = p
      logger.info('ffmpeg 路径:', p)
      return p
    }
  }

  logger.error('ffmpeg 二进制未找到，请检查 resources/ffmpeg/ffmpeg.exe 是否存在')
  return null
}

export default { getFfmpegPath }
