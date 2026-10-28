import { join } from 'path'
import { app } from 'electron'
import { appendFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs'
import paths from './paths.js'

const MAX_LOG_DAYS = 7 // 保留最近 7 天日志

let initialized = false
let logDir = ''

function init() {
  if (initialized) return
  logDir = join(paths.configDir(), 'logs')
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true })
  }
  initialized = true
  cleanupOldLogs()
}

function todayFile() {
  const d = new Date()
  const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return join(logDir, `${dateStr}.log`)
}

function timestamp() {
  const d = new Date()
  return (
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ` +
    `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`
  )
}

function format(level, args) {
  return `[${timestamp()}] [${level}] ${args.map((a) => (typeof a === 'object' ? safeStringify(a) : String(a))).join(' ')}\n`
}

function safeStringify(obj) {
  try {
    if (obj instanceof Error) return `${obj.message}\n${obj.stack || ''}`
    return JSON.stringify(obj)
  } catch {
    return String(obj)
  }
}

function write(level, args) {
  if (!initialized) init()
  const line = format(level, args)
  // 控制台输出（开发期方便）
  if (level === 'ERROR') {
    console.error(line.trimEnd())
  } else {
    console.log(line.trimEnd())
  }
  // 文件输出
  try {
    appendFileSync(todayFile(), line, 'utf-8')
  } catch {
    /* 日志写失败不应阻断主流程 */
  }
}

// 清理过期日志
function cleanupOldLogs() {
  try {
    const files = readdirSync(logDir).filter((f) => f.endsWith('.log'))
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - MAX_LOG_DAYS)
    for (const f of files) {
      const dateStr = f.replace('.log', '')
      const fileDate = new Date(dateStr)
      if (!isNaN(fileDate) && fileDate < cutoff) {
        unlinkSync(join(logDir, f))
      }
    }
  } catch {
    /* ignore */
  }
}

const logger = {
  init,
  info: (...args) => write('INFO', args),
  warn: (...args) => write('WARN', args),
  error: (...args) => write('ERROR', args),
  debug: (...args) => {
    if (!app.isPackaged) write('DEBUG', args)
  }
}

export default logger
