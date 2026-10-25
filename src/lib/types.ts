/* ============================================================
   Auxilia · 领域模型
   与 src-tauri/migrations/001_init.sql 一一对应
   时间一律毫秒 number
   ============================================================ */

export type Lifecycle = 'permanent' | 'disposable' | 'expiring'
export type DurationMode = 'countdown' | 'countup' | 'scheduled'
export type DisplayMode = 'topbar' | 'none' | 'float'
export type TaskStatus = 'idle' | 'running' | 'paused'
export type RunResult = 'completed' | 'aborted' | 'crashed'
export type Period = 'daily' | 'weekly' | 'monthly'
export type BadgeTier = 'bronze' | 'silver' | 'gold'
export type WallKind = 'decoration' | 'badge' | 'task'
export type DecorationKind = 'sticker' | 'frame' | 'bg'

export interface Task {
  id: string
  title: string
  note: string
  lifecycle: Lifecycle
  expireAt: number | null
  durationMode: DurationMode
  plannedSeconds: number
  scheduledAt: number | null
  alertDialog: boolean
  alertFlash: boolean
  alertSound: boolean
  displayMode: DisplayMode
  status: TaskStatus
  totalSeconds: number
  level: number
  runCount: number
  lastActiveAt: number | null
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

export interface NewTaskInput {
  title: string
  note?: string
  lifecycle: Lifecycle
  expireAt?: number | null
  durationMode: DurationMode
  plannedSeconds?: number
  scheduledAt?: number | null
  alertDialog?: boolean
  alertFlash?: boolean
  alertSound?: boolean
  displayMode?: DisplayMode
}

export interface TaskRun {
  id: string
  taskId: string
  prospect: string
  startedAt: number
  endedAt: number | null
  activeSeconds: number
  pausedSeconds: number
  interruptions: number
  outcome: string
  reflectMoment: string
  reflectNext: string
  result: RunResult | null
  coinEarned: number
}

/** Rust 引擎推给前端的运行时快照（唯一权威计时来源） */
export interface RunSnapshot {
  runId: string
  taskId: string
  taskTitle: string
  mode: DurationMode
  plannedSeconds: number
  /** null = 暂停中 */
  segmentStartedAt: number | null
  /** 已闭合区间累计秒数（不含当前区间、不含暂停） */
  closedSeconds: number
  pausedSeconds: number
  startedAt: number
  prospect: string
  displayMode: DisplayMode
  alertDialog: boolean
  alertFlash: boolean
  alertSound: boolean
}

export interface TaskLine {
  id: string
  name: string
  startHour: number
  endHour: number
  sortIndex: number
  createdAt: number
}

export interface TaskLineEntry {
  id: string
  tasklineId: string
  taskId: string
  minuteOfDay: number
  /** 块长（分钟）：决定在时间轴上画多高，可后续拉伸微调 */
  durationMinutes: number
  sortIndex: number
}

/** 时间轴渲染用的合并视图 */
export interface TimelineBlock {
  entry: TaskLineEntry
  task: Task
}

export interface Badge {
  code: string
  name: string
  description: string
  icon: string
  tier: BadgeTier
  rewardCoin: number
  condition: string
}

export interface UserBadge {
  code: string
  earnedAt: number
  redeemed: boolean
}

export interface Decoration {
  id: string
  name: string
  kind: DecorationKind
  price: number
  asset: string
}

export interface OwnedDecoration {
  decorationId: string
  boughtAt: number
}

export interface WallItem {
  id: string
  kind: WallKind
  refId: string
  x: number
  y: number
  scale: number
  z: number
}

/** 复盘页里展示的一条历史运行记录（含当时写的三问） */
export interface RunRecord {
  id: string
  taskId: string
  title: string
  startedAt: number
  endedAt: number
  activeSeconds: number
  result: string
  outcome: string
  reflectMoment: string
  reflectNext: string
  coinEarned: number
}

export interface Review {
  id: string
  period: Period
  periodStart: number
  periodEnd: number
  contentMd: string
  filePath: string | null
  createdAt: number
}

export interface ReviewSettings {
  dailyOn: boolean
  dailyHour: number
  weeklyOn: boolean
  weeklyDow: number
  weeklyHour: number
  monthlyOn: boolean
  monthlyDom: number
  monthlyHour: number
  exportDir: string | null
  lastDailyAt: number
  lastWeeklyAt: number
  lastMonthlyAt: number
}

export interface DailyStat {
  /** yyyy-MM-dd（本地时区） */
  date: string
  seconds: number
  runs: number
}

export interface TaskStat {
  taskId: string
  title: string
  seconds: number
}

export interface AchievementSummary {
  totalSeconds: number
  totalRuns: number
  completedRuns: number
  coin: number
  streakDays: number
  bestStreak: number
  todaySeconds: number
  todayRuns: number
}

export type View = 'home' | 'focus' | 'finish' | 'achievements' | 'review' | 'settings'

export interface TaskQuery {
  keyword?: string
  status?: TaskStatus
  limit?: number
}
