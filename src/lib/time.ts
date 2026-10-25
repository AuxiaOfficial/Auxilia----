/* ============================================================
   时间工具 · 全部以毫秒 / 秒（整数）传递
   格式化只在这里做
   ============================================================ */

export const SEC = 1000
export const MIN = 60 * SEC
export const HOUR = 60 * MIN
export const DAY = 24 * HOUR

export function nowMs(): number {
  return Date.now()
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v
}

const pad2 = (n: number): string => (n < 10 ? `0${n}` : `${n}`)

/** 秒 → 24:31（超过 1 小时自动变 1:24:31） */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return h > 0 ? `${h}:${pad2(m)}:${pad2(sec)}` : `${pad2(m)}:${pad2(sec)}`
}

/** 秒 → 2h 15m / 45m / 12s（列表、统计用） */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  if (s < 60) return `${s}s`
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

/** 滚轮展示用：小时 / 分钟两段 */
export function splitDuration(totalSeconds: number): { h: number; m: number; s: number } {
  const s = Math.max(0, Math.floor(totalSeconds))
  return {
    h: Math.floor(s / 3600),
    m: Math.floor((s % 3600) / 60),
    s: s % 60,
  }
}

export function minuteOfDay(ts: number): number {
  const d = new Date(ts)
  return d.getHours() * 60 + d.getMinutes()
}

export function fromMinuteOfDay(minute: number, base: Date = new Date()): number {
  const d = new Date(base)
  d.setHours(Math.floor(minute / 60), minute % 60, 0, 0)
  return d.getTime()
}

/** 11:05 */
export function formatMinuteOfDay(minute: number): string {
  const m = clamp(Math.round(minute), 0, 1439)
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`
}

export function formatTime(ts: number): string {
  const d = new Date(ts)
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/** yyyy-MM-dd（本地时区，用于热力图/统计分组） */
export function dayKey(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export function startOfDay(ts: number = Date.now()): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function addDays(ts: number, days: number): number {
  const d = new Date(ts)
  d.setDate(d.getDate() + days)
  return d.getTime()
}

/** 距离下一次整点的秒数，用于重新对齐计时显示 */
export function secondsToNextMinute(ts: number = Date.now()): number {
  return 60 - Math.floor((ts % MIN) / SEC)
}

/** 中文相对日期：今天 / 昨天 / 10月24日 */
export function relativeDay(ts: number, base: number = Date.now()): string {
  const a = dayKey(ts)
  const b = dayKey(base)
  if (a === b) return '今天'
  if (a === dayKey(addDays(base, -1))) return '昨天'
  const d = new Date(ts)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

/** 运行快照的实时已跑秒数（纯前端推算，不累加） */
export function liveActiveSeconds(
  closedSeconds: number,
  segmentStartedAt: number | null,
  now: number = Date.now(),
): number {
  if (segmentStartedAt === null) return closedSeconds
  return closedSeconds + Math.max(0, Math.floor((now - segmentStartedAt) / 1000))
}
