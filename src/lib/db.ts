/* ============================================================
   数据层 · 唯一允许出现 SQL / invoke 的地方
   · 桌面端：SQLite（Rust db_select / db_execute / db_tx）
   · 浏览器预览：内存数据（不持久化，仅用于看界面）
   ============================================================ */

import { call, isDesktop } from './ipc'
import { newId } from './id'
import { addDays, dayKey, startOfDay } from './time'
import type {
  AchievementSummary,
  DailyStat,
  Decoration,
  NewTaskInput,
  OwnedDecoration,
  Review,
  ReviewSettings,
  RunRecord,
  RunSnapshot,
  Task,
  TaskLine,
  TaskLineEntry,
  TaskQuery,
  TaskRun,
  TaskStat,
  UserBadge,
  WallItem,
} from './types'

type Row = Record<string, unknown>

const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v ?? 0))
const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v))
const bool = (v: unknown): boolean => v === true || v === 1 || v === '1'
const numOrNull = (v: unknown): number | null =>
  v === null || v === undefined ? null : Number(v)

/* ---------------- SQL 执行原语 ---------------- */

async function select<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return call<T[]>('db_select', { sql, params })
}

async function exec(sql: string, params: unknown[] = []): Promise<void> {
  await call<number>('db_execute', { sql, params })
}

/* ---------------- 行映射 ---------------- */

function mapTask(r: Row): Task {
  return {
    id: str(r.id),
    title: str(r.title),
    note: str(r.note),
    lifecycle: str(r.lifecycle) as Task['lifecycle'],
    expireAt: numOrNull(r.expireAt),
    durationMode: str(r.durationMode) as Task['durationMode'],
    plannedSeconds: num(r.plannedSeconds),
    scheduledAt: numOrNull(r.scheduledAt),
    alertDialog: bool(r.alertDialog),
    alertFlash: bool(r.alertFlash),
    alertSound: bool(r.alertSound),
    displayMode: str(r.displayMode) as Task['displayMode'],
    status: str(r.status) as Task['status'],
    totalSeconds: num(r.totalSeconds),
    level: num(r.level),
    runCount: num(r.runCount),
    lastActiveAt: numOrNull(r.lastActiveAt),
    createdAt: num(r.createdAt),
    updatedAt: num(r.updatedAt),
    deletedAt: numOrNull(r.deletedAt),
  }
}

const TASK_COLS = `id, title, note, lifecycle, expire_at AS "expireAt",
  duration_mode AS "durationMode", planned_seconds AS "plannedSeconds",
  scheduled_at AS "scheduledAt", alert_dialog AS "alertDialog",
  alert_flash AS "alertFlash", alert_sound AS "alertSound",
  display_mode AS "displayMode", status, total_seconds AS "totalSeconds",
  level, run_count AS "runCount", last_active_at AS "lastActiveAt",
  created_at AS "createdAt", updated_at AS "updatedAt", deleted_at AS "deletedAt"`

function mapRun(r: Row): TaskRun {
  return {
    id: str(r.id),
    taskId: str(r.taskId),
    prospect: str(r.prospect),
    startedAt: num(r.startedAt),
    endedAt: numOrNull(r.endedAt),
    activeSeconds: num(r.activeSeconds),
    pausedSeconds: num(r.pausedSeconds),
    interruptions: num(r.interruptions),
    outcome: str(r.outcome),
    reflectMoment: str(r.reflectMoment),
    reflectNext: str(r.reflectNext),
    result: (r.result ?? null) as TaskRun['result'],
    coinEarned: num(r.coinEarned),
  }
}

function mapTaskLine(r: Row): TaskLine {
  return {
    id: str(r.id),
    name: str(r.name),
    startHour: num(r.startHour),
    endHour: num(r.endHour),
    sortIndex: num(r.sortIndex),
    createdAt: num(r.createdAt),
  }
}

function mapEntry(r: Row): TaskLineEntry {
  return {
    id: str(r.id),
    tasklineId: str(r.tasklineId),
    taskId: str(r.taskId),
    minuteOfDay: num(r.minuteOfDay),
    durationMinutes: num(r.durationMinutes) || 30,
    sortIndex: num(r.sortIndex),
  }
}

/* ============================================================
   浏览器预览用的内存假数据
   ============================================================ */

function seedTasks(): Task[] {
  const now = Date.now()
  const base = (title: string, level: number, total: number, mode: Task['durationMode'], planned: number): Task => ({
    id: newId(),
    title,
    note: '',
    lifecycle: 'permanent',
    expireAt: null,
    durationMode: mode,
    plannedSeconds: planned,
    scheduledAt: null,
    alertDialog: true,
    alertFlash: false,
    alertSound: false,
    displayMode: 'topbar',
    status: 'idle',
    totalSeconds: total,
    level,
    runCount: Math.floor(total / 3000),
    lastActiveAt: now - 86400000,
    createdAt: now - 86400000 * 3,
    updatedAt: now,
    deletedAt: null,
  })
  return [
    base('写 Auxilia 技术方案', 5, 32400, 'countdown', 1500),
    base('读《深度工作》第三章', 2, 5400, 'countdown', 2700),
    base('整理上周复盘', 1, 1200, 'countup', 0),
    base('跑步 5 公里', 3, 7200, 'countdown', 1800),
    base('回复邮件', 1, 600, 'countup', 0),
    base('学习 Rust 所有权', 7, 46800, 'countdown', 3600),
  ]
}

interface MemDb {
  tasks: Task[]
  lines: TaskLine[]
  entries: TaskLineEntry[]
  runs: TaskRun[]
  settings: Map<string, string>
  badges: UserBadge[]
  coin: number
  reviews: Review[]
  wall: WallItem[]
  owned: OwnedDecoration[]
  decorations: Decoration[]
}

let mem: MemDb | null = null

function memory(): MemDb {
  if (mem) return mem
  const now = Date.now()
  const tasks = seedTasks()
  const first = tasks[0] as Task
  const third = tasks[2] as Task
  const line: TaskLine = {
    id: newId(),
    name: '默认 TaskLine',
    startHour: 6,
    endHour: 24,
    sortIndex: 0,
    createdAt: now,
  }
  mem = {
    tasks,
    lines: [line],
    entries: [
      { id: newId(), tasklineId: line.id, taskId: first.id, minuteOfDay: 9 * 60, durationMinutes: 25, sortIndex: 0 },
      { id: newId(), tasklineId: line.id, taskId: third.id, minuteOfDay: 14 * 60 + 30, durationMinutes: 60, sortIndex: 1 },
    ],
    runs: [],
    settings: new Map(),
    badges: [],
    coin: 128,
    reviews: [],
    wall: [],
    owned: [],
    decorations: [],
  }
  return mem as MemDb
}

/* ============================================================
   设置
   ============================================================ */

export const settingsRepo = {
  async get(key: string): Promise<string | null> {
    if (!isDesktop) return memory().settings.get(key) ?? null
    const rows = await select<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key])
    return rows[0]?.value ?? null
  },
  async set(key: string, value: string): Promise<void> {
    if (!isDesktop) {
      memory().settings.set(key, value)
      return
    }
    await exec(
      'INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      [key, value],
    )
  },
  async getBool(key: string, fallback: boolean): Promise<boolean> {
    const v = await settingsRepo.get(key)
    return v === null ? fallback : v === '1'
  },
}

/* ============================================================
   任务池
   ============================================================ */

export const taskRepo = {
  async list(query: TaskQuery = {}): Promise<Task[]> {
    const kw = (query.keyword ?? '').trim().toLowerCase()
    if (!isDesktop) {
      const all = memory().tasks.filter((t) => t.deletedAt === null)
      const filtered = kw
        ? all.filter((t) => t.title.toLowerCase().includes(kw) || t.note.toLowerCase().includes(kw))
        : all
      const byStatus = query.status ? filtered.filter((t) => t.status === query.status) : filtered
      return byStatus
        .slice()
        .sort((a, b) => (b.lastActiveAt ?? b.createdAt) - (a.lastActiveAt ?? a.createdAt))
        .slice(0, query.limit ?? 200)
    }
    const params: unknown[] = []
    let sql = `SELECT ${TASK_COLS} FROM tasks WHERE deleted_at IS NULL`
    if (kw) {
      sql += ' AND (lower(title) LIKE ? OR lower(note) LIKE ?)'
      params.push(`%${kw}%`, `%${kw}%`)
    }
    if (query.status) {
      sql += ' AND status = ?'
      params.push(query.status)
    }
    sql += ' ORDER BY COALESCE(last_active_at, created_at) DESC LIMIT ?'
    params.push(query.limit ?? 200)
    const rows = await select<Row>(sql, params)
    return rows.map(mapTask)
  },

  async get(id: string): Promise<{ task: Task; runs: TaskRun[] } | null> {
    if (!isDesktop) {
      const task = memory().tasks.find((t) => t.id === id && t.deletedAt === null)
      if (!task) return null
      return { task, runs: memory().runs.filter((r) => r.taskId === id) }
    }
    const rows = await select<Row>(`SELECT ${TASK_COLS} FROM tasks WHERE id = ?`, [id])
    const first = rows[0]
    if (!first) return null
    const runRows = await select<Row>(
      `SELECT id, task_id AS "taskId", prospect, started_at AS "startedAt",
              ended_at AS "endedAt", active_seconds AS "activeSeconds",
              paused_seconds AS "pausedSeconds", interruptions,
              outcome, reflect_moment AS "reflectMoment", reflect_next AS "reflectNext",
              result, coin_earned AS "coinEarned"
       FROM task_runs WHERE task_id = ? ORDER BY started_at DESC LIMIT 100`,
      [id],
    )
    return { task: mapTask(first), runs: runRows.map(mapRun) }
  },

  async create(input: NewTaskInput): Promise<Task> {
    const title = input.title.trim()
    if (!title) throw new Error('任务标题不能为空')
    const now = Date.now()
    const task: Task = {
      id: newId(),
      title,
      note: (input.note ?? '').trim(),
      lifecycle: input.lifecycle,
      expireAt: input.expireAt ?? null,
      durationMode: input.durationMode,
      plannedSeconds: Math.max(0, Math.round(input.plannedSeconds ?? 0)),
      scheduledAt: input.scheduledAt ?? null,
      alertDialog: input.alertDialog ?? true,
      alertFlash: input.alertFlash ?? false,
      alertSound: input.alertSound ?? false,
      displayMode: input.displayMode ?? 'topbar',
      status: 'idle',
      totalSeconds: 0,
      level: 1,
      runCount: 0,
      lastActiveAt: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
    if (task.lifecycle === 'expiring' && task.expireAt === null) {
      throw new Error('限时任务需要设置过期时间')
    }
    if (task.durationMode === 'scheduled' && task.scheduledAt === null) {
      throw new Error('定时任务需要设置触发时间')
    }
    if (!isDesktop) {
      memory().tasks.unshift(task)
      return task
    }
    await exec(
      `INSERT INTO tasks (id, title, note, lifecycle, expire_at, duration_mode,
        planned_seconds, scheduled_at, alert_dialog, alert_flash, alert_sound,
        display_mode, status, total_seconds, level, run_count, last_active_at,
        created_at, updated_at, deleted_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'idle',0,1,0,NULL,?,?,NULL)`,
      [
        task.id, task.title, task.note, task.lifecycle, task.expireAt, task.durationMode,
        task.plannedSeconds, task.scheduledAt, task.alertDialog ? 1 : 0,
        task.alertFlash ? 1 : 0, task.alertSound ? 1 : 0, task.displayMode,
        task.createdAt, task.updatedAt,
      ],
    )
    return task
  },

  async update(id: string, patch: Partial<Task>): Promise<Task> {
    const current = await taskRepo.get(id)
    if (!current) throw new Error('任务不存在')
    const next: Task = { ...current.task, ...patch, updatedAt: Date.now() }
    if (!next.title.trim()) throw new Error('任务标题不能为空')
    if (!isDesktop) {
      const list = memory().tasks
      const idx = list.findIndex((t) => t.id === id)
      if (idx >= 0) list[idx] = { ...next, title: next.title.trim() }
      return list[idx] as Task
    }
    await exec(
      `UPDATE tasks SET title=?, note=?, lifecycle=?, expire_at=?, duration_mode=?,
        planned_seconds=?, scheduled_at=?, alert_dialog=?, alert_flash=?, alert_sound=?,
        display_mode=?, updated_at=? WHERE id=?`,
      [
        next.title.trim(), next.note, next.lifecycle, next.expireAt, next.durationMode,
        next.plannedSeconds, next.scheduledAt, next.alertDialog ? 1 : 0,
        next.alertFlash ? 1 : 0, next.alertSound ? 1 : 0, next.displayMode,
        next.updatedAt, id,
      ],
    )
    return { ...next, title: next.title.trim() }
  },

  async remove(id: string): Promise<void> {
    if (!isDesktop) {
      const t = memory().tasks.find((x) => x.id === id)
      if (t) t.deletedAt = Date.now()
      return
    }
    const now = Date.now()
    await exec('UPDATE tasks SET deleted_at = ?, updated_at = ? WHERE id = ?', [now, now, id])
  },

  async batchRemove(ids: string[]): Promise<void> {
    if (ids.length === 0) return
    if (!isDesktop) {
      const now = Date.now()
      for (const t of memory().tasks) if (ids.includes(t.id)) t.deletedAt = now
      return
    }
    const now = Date.now()
    const placeholders = ids.map(() => '?').join(',')
    await exec(
      `UPDATE tasks SET deleted_at = ?, updated_at = ? WHERE id IN (${placeholders})`,
      [now, now, ...ids],
    )
  },

  /** disposable 任务完成后物理删除 */
  async hardRemove(id: string): Promise<void> {
    if (!isDesktop) {
      const m = memory()
      m.tasks = m.tasks.filter((t) => t.id !== id)
      m.entries = m.entries.filter((e) => e.taskId !== id)
      return
    }
    await exec('DELETE FROM tasks WHERE id = ?', [id])
  },
}

/* ============================================================
   TaskLine
   ============================================================ */

export const tasklineRepo = {
  async list(): Promise<TaskLine[]> {
    if (!isDesktop) return memory().lines.slice().sort((a, b) => a.sortIndex - b.sortIndex)
    const rows = await select<Row>(
      `SELECT id, name, start_hour AS "startHour", end_hour AS "endHour",
              sort_index AS "sortIndex", created_at AS "createdAt"
       FROM tasklines ORDER BY sort_index ASC, created_at ASC`,
    )
    return rows.map(mapTaskLine)
  },

  async create(name: string): Promise<TaskLine> {
    const line: TaskLine = {
      id: newId(),
      name: name.trim() || '未命名 TaskLine',
      startHour: 6,
      endHour: 24,
      sortIndex: 0,
      createdAt: Date.now(),
    }
    if (!isDesktop) {
      const m = memory()
      line.sortIndex = m.lines.length
      m.lines.push(line)
      return line
    }
    const countRows = await select<{ n: number }>('SELECT COUNT(*) AS n FROM tasklines')
    const sortIndex = countRows[0]?.n ?? 0
    await exec(
      `INSERT INTO tasklines (id, name, start_hour, end_hour, sort_index, created_at)
       VALUES (?,?,?,?,?,?)`,
      [line.id, line.name, line.startHour, line.endHour, sortIndex, line.createdAt],
    )
    return { ...line, sortIndex }
  },

  async rename(id: string, name: string): Promise<void> {
    const clean = name.trim()
    if (!clean) throw new Error('TaskLine 名称不能为空')
    if (!isDesktop) {
      const l = memory().lines.find((x) => x.id === id)
      if (l) l.name = clean
      return
    }
    await exec('UPDATE tasklines SET name = ? WHERE id = ?', [clean, id])
  },

  async remove(id: string): Promise<void> {
    if (!isDesktop) {
      const m = memory()
      m.lines = m.lines.filter((l) => l.id !== id)
      m.entries = m.entries.filter((e) => e.tasklineId !== id)
      return
    }
    await exec('DELETE FROM taskline_entries WHERE taskline_id = ?', [id])
    await exec('DELETE FROM tasklines WHERE id = ?', [id])
  },

  async entries(tasklineId: string): Promise<TaskLineEntry[]> {
    if (!isDesktop) {
      return memory()
        .entries.filter((e) => e.tasklineId === tasklineId)
        .sort((a, b) => a.minuteOfDay - b.minuteOfDay)
    }
    const rows = await select<Row>(
      `SELECT id, taskline_id AS "tasklineId", task_id AS "taskId",
              minute_of_day AS "minuteOfDay",
              COALESCE(duration_minutes, 30) AS "durationMinutes",
              sort_index AS "sortIndex"
       FROM taskline_entries WHERE taskline_id = ?
       ORDER BY minute_of_day ASC, sort_index ASC`,
      [tasklineId],
    )
    return rows.map(mapEntry)
  },

  async addEntry(
    tasklineId: string,
    taskId: string,
    minute: number,
    durationMinutes = 30,
  ): Promise<TaskLineEntry> {
    const entry: TaskLineEntry = {
      id: newId(),
      tasklineId,
      taskId,
      minuteOfDay: Math.min(1439, Math.max(0, Math.round(minute))),
      durationMinutes: Math.min(600, Math.max(5, Math.round(durationMinutes))),
      sortIndex: 0,
    }
    if (!isDesktop) {
      const m = memory()
      const sameSpot = m.entries.filter(
        (e) => e.tasklineId === tasklineId && e.minuteOfDay === entry.minuteOfDay,
      )
      entry.sortIndex = sameSpot.length
      m.entries.push(entry)
      return entry
    }
    const rows = await select<{ n: number }>(
      'SELECT COUNT(*) AS n FROM taskline_entries WHERE taskline_id = ? AND minute_of_day = ?',
      [tasklineId, entry.minuteOfDay],
    )
    const sortIndex = rows[0]?.n ?? 0
    await exec(
      `INSERT INTO taskline_entries (id, taskline_id, task_id, minute_of_day, duration_minutes, sort_index)
       VALUES (?,?,?,?,?,?)`,
      [entry.id, tasklineId, taskId, entry.minuteOfDay, entry.durationMinutes, sortIndex],
    )
    return { ...entry, sortIndex }
  },

  async setEntryDuration(entryId: string, durationMinutes: number): Promise<void> {
    const d = Math.min(600, Math.max(5, Math.round(durationMinutes)))
    if (!isDesktop) {
      const e = memory().entries.find((x) => x.id === entryId)
      if (e) e.durationMinutes = d
      return
    }
    await exec('UPDATE taskline_entries SET duration_minutes = ? WHERE id = ?', [d, entryId])
  },

  async moveEntry(entryId: string, minute: number): Promise<void> {
    const m = Math.min(1439, Math.max(0, Math.round(minute)))
    if (!isDesktop) {
      const e = memory().entries.find((x) => x.id === entryId)
      if (e) e.minuteOfDay = m
      return
    }
    await exec('UPDATE taskline_entries SET minute_of_day = ? WHERE id = ?', [m, entryId])
  },

  async removeEntry(entryId: string): Promise<void> {
    if (!isDesktop) {
      const mm = memory()
      mm.entries = mm.entries.filter((e) => e.id !== entryId)
      return
    }
    await exec('DELETE FROM taskline_entries WHERE id = ?', [entryId])
  },

  async removeEntries(entryIds: string[]): Promise<void> {
    if (entryIds.length === 0) return
    if (!isDesktop) {
      const mm = memory()
      mm.entries = mm.entries.filter((e) => !entryIds.includes(e.id))
      return
    }
    const ph = entryIds.map(() => '?').join(',')
    await exec(`DELETE FROM taskline_entries WHERE id IN (${ph})`, entryIds)
  },
}

/* ============================================================
   执行引擎（Rust 权威，前端只发指令 / 读快照）
   ============================================================ */

export const runRepo = {
  async active(): Promise<RunSnapshot[]> {
    if (!isDesktop) return []
    return call<RunSnapshot[]>('runs_active')
  },

  async start(taskId: string, prospect: string, plannedSeconds: number): Promise<RunSnapshot> {
    if (!isDesktop) throw new Error('浏览器预览无法开始任务')
    return call<RunSnapshot>('run_start', { taskId, prospect, plannedSeconds })
  },

  async pause(taskId: string): Promise<RunSnapshot> {
    return call<RunSnapshot>('run_pause', { taskId })
  },

  async resume(taskId: string): Promise<RunSnapshot> {
    return call<RunSnapshot>('run_resume', { taskId })
  },

  async finish(
    taskId: string,
    outcome: string,
    reflectMoment: string,
    reflectNext: string,
  ): Promise<{ coinEarned: number; activeSeconds: number; level: number }> {
    return call('run_finish', { taskId, outcome, reflectMoment, reflectNext })
  },

  async abort(taskId: string): Promise<void> {
    await call('run_abort', { taskId })
  },

  /** 历史运行记录：复盘页用来回顾「上次我是怎么想的」 */
  async history(limit = 60): Promise<RunRecord[]> {
    if (!isDesktop) return []
    const rows = await select<Row>(
      `SELECT r.id, r.task_id AS "taskId", COALESCE(t.title, '已删除任务') AS title,
              r.started_at AS "startedAt", COALESCE(r.ended_at, r.started_at) AS "endedAt",
              r.active_seconds AS "activeSeconds", r.result, r.outcome,
              r.reflect_moment AS "reflectMoment", r.reflect_next AS "reflectNext",
              r.coin_earned AS "coinEarned"
       FROM task_runs r LEFT JOIN tasks t ON t.id = r.task_id
       WHERE r.ended_at IS NOT NULL
       ORDER BY r.started_at DESC LIMIT ?`,
      [limit],
    )
    return rows.map((r) => ({
      id: str(r.id),
      taskId: str(r.taskId),
      title: str(r.title),
      startedAt: num(r.startedAt),
      endedAt: num(r.endedAt),
      activeSeconds: num(r.activeSeconds),
      result: str(r.result),
      outcome: str(r.outcome),
      reflectMoment: str(r.reflectMoment),
      reflectNext: str(r.reflectNext),
      coinEarned: num(r.coinEarned),
    }))
  },
}

/* ============================================================
   统计
   ============================================================ */

export const statsRepo = {
  async daily(days = 365): Promise<DailyStat[]> {
    if (!isDesktop) return []
    const since = startOfDay() - (days - 1) * 86400000
    const rows = await select<Row>(
      `SELECT date(started_at/1000, 'unixepoch', 'localtime') AS date,
              SUM(active_seconds) AS seconds, COUNT(*) AS runs
       FROM task_runs WHERE started_at >= ? GROUP BY date ORDER BY date ASC`,
      [since],
    )
    return rows.map((r) => ({
      date: str(r.date),
      seconds: num(r.seconds),
      runs: num(r.runs),
    }))
  },

  async byTask(days = 30): Promise<TaskStat[]> {
    if (!isDesktop) {
      const items = memory()
        .tasks.filter((t) => t.deletedAt === null && t.totalSeconds > 0)
        .map((t) => ({ taskId: t.id, title: t.title, seconds: t.totalSeconds }))
        .sort((a, b) => b.seconds - a.seconds)
      return items
    }
    const since = Date.now() - days * 86400000
    const rows = await select<Row>(
      `SELECT r.task_id AS "taskId", COALESCE(t.title, '已删除任务') AS title,
              SUM(r.active_seconds) AS seconds
       FROM task_runs r LEFT JOIN tasks t ON t.id = r.task_id
       WHERE r.started_at >= ? GROUP BY r.task_id ORDER BY seconds DESC LIMIT 12`,
      [since],
    )
    return rows.map((r) => ({ taskId: str(r.taskId), title: str(r.title), seconds: num(r.seconds) }))
  },

  async summary(): Promise<AchievementSummary> {
    const week = 7
    const data = await statsRepo.daily(365)
    const map = new Map(data.map((d) => [d.date, d.seconds]))
    let streak = 0
    for (let i = 0; i < 366; i += 1) {
      const key = dayKey(addDays(startOfDay(), -i))
      const seconds = map.get(key) ?? 0
      if (seconds > 0) streak += 1
      else if (i > 0) break
    }
    const today = map.get(dayKey(Date.now())) ?? 0
    const total = data.reduce((sum, d) => sum + d.seconds, 0)
    let coin = 0
    let totalRuns = 0
    let completedRuns = 0
    if (!isDesktop) {
      coin = memory().coin
      totalRuns = memory().runs.length
      completedRuns = memory().runs.filter((r) => r.result === 'completed').length
    } else {
      const rows = await select<Row>(
        `SELECT COUNT(*) AS total, SUM(CASE WHEN result='completed' THEN 1 ELSE 0 END) AS done
         FROM task_runs`,
      )
      totalRuns = num(rows[0]?.total)
      completedRuns = num(rows[0]?.done)
      const w = await select<{ coin: number }>('SELECT coin FROM wallet WHERE id = 1')
      coin = num(w[0]?.coin)
    }
    return {
      totalSeconds: total,
      totalRuns,
      completedRuns,
      coin,
      streakDays: streak,
      bestStreak: Math.max(streak, week > 0 ? streak : 0),
      todaySeconds: today,
      todayRuns: data.find((d) => d.date === dayKey(Date.now()))?.runs ?? 0,
    }
  },
}

/* ============================================================
   成就 / 装饰墙
   ============================================================ */

export const achievementRepo = {
  async catalog(): Promise<UserBadgeWithMeta[]> {
    if (!isDesktop) return []
    const rows = await select<Row>(
      `SELECT b.code, b.name, b.description, b.icon, b.tier,
              b.reward_coin AS "rewardCoin", b.condition,
              ub.earned_at AS "earnedAt", ub.redeemed
       FROM badges b LEFT JOIN user_badges ub ON ub.code = b.code
       ORDER BY b.tier DESC, b.code ASC`,
    )
    return rows.map((r) => ({
      code: str(r.code),
      name: str(r.name),
      description: str(r.description),
      icon: str(r.icon),
      tier: str(r.tier) as UserBadgeWithMeta['tier'],
      rewardCoin: num(r.rewardCoin),
      condition: str(r.condition),
      earnedAt: numOrNull(r.earnedAt),
      redeemed: bool(r.redeemed),
    }))
  },

  async redeem(code: string): Promise<number> {
    if (!isDesktop) return 0
    return call<number>('badge_redeem', { code })
  },

  async decorations(): Promise<Decoration[]> {
    if (!isDesktop) return []
    const rows = await select<Row>(
      'SELECT id, name, kind, price, asset FROM decorations ORDER BY price ASC',
    )
    return rows.map((r) => ({
      id: str(r.id),
      name: str(r.name),
      kind: str(r.kind) as Decoration['kind'],
      price: num(r.price),
      asset: str(r.asset),
    }))
  },

  async owned(): Promise<OwnedDecoration[]> {
    if (!isDesktop) return memory().owned
    const rows = await select<Row>(
      'SELECT decoration_id AS "decorationId", bought_at AS "boughtAt" FROM owned_decorations',
    )
    return rows.map((r) => ({ decorationId: str(r.decorationId), boughtAt: num(r.boughtAt) }))
  },

  async buy(decorationId: string): Promise<number> {
    if (!isDesktop) return memory().coin
    return call<number>('decoration_buy', { decorationId })
  },

  async wall(): Promise<WallItem[]> {
    if (!isDesktop) return memory().wall
    const rows = await select<Row>(
      'SELECT id, kind, ref_id AS "refId", x, y, scale, z FROM wall_items ORDER BY z ASC',
    )
    return rows.map((r) => ({
      id: str(r.id),
      kind: str(r.kind) as WallItem['kind'],
      refId: str(r.refId),
      x: num(r.x),
      y: num(r.y),
      scale: num(r.scale),
      z: num(r.z),
    }))
  },

  async place(item: Omit<WallItem, 'id'>): Promise<WallItem> {
    const full: WallItem = { ...item, id: newId() }
    if (!isDesktop) {
      memory().wall.push(full)
      return full
    }
    await exec(
      'INSERT INTO wall_items (id, kind, ref_id, x, y, scale, z) VALUES (?,?,?,?,?,?,?)',
      [full.id, full.kind, full.refId, full.x, full.y, full.scale, full.z],
    )
    return full
  },

  async move(id: string, x: number, y: number): Promise<void> {
    if (!isDesktop) {
      const w = memory().wall.find((i) => i.id === id)
      if (w) {
        w.x = x
        w.y = y
      }
      return
    }
    await exec('UPDATE wall_items SET x = ?, y = ? WHERE id = ?', [x, y, id])
  },

  async unplace(id: string): Promise<void> {
    if (!isDesktop) {
      const m = memory()
      m.wall = m.wall.filter((i) => i.id !== id)
      return
    }
    await exec('DELETE FROM wall_items WHERE id = ?', [id])
  },
}

export interface UserBadgeWithMeta {
  code: string
  name: string
  description: string
  icon: string
  tier: 'bronze' | 'silver' | 'gold'
  rewardCoin: number
  condition: string
  earnedAt: number | null
  redeemed: boolean
}

/* ============================================================
   复盘
   ============================================================ */

export const reviewRepo = {
  async list(limit = 50): Promise<Review[]> {
    if (!isDesktop) return memory().reviews
    const rows = await select<Row>(
      `SELECT id, period, period_start AS "periodStart", period_end AS "periodEnd",
              content_md AS "contentMd", file_path AS "filePath", created_at AS "createdAt"
       FROM reviews ORDER BY period_start DESC LIMIT ?`,
      [limit],
    )
    return rows.map((r) => ({
      id: str(r.id),
      period: str(r.period) as Review['period'],
      periodStart: num(r.periodStart),
      periodEnd: num(r.periodEnd),
      contentMd: str(r.contentMd),
      filePath: (r.filePath ?? null) as string | null,
      createdAt: num(r.createdAt),
    }))
  },

  async save(input: Omit<Review, 'id' | 'createdAt' | 'filePath'>): Promise<Review> {
    const review: Review = { ...input, id: newId(), createdAt: Date.now(), filePath: null }
    if (!isDesktop) {
      memory().reviews.unshift(review)
      return review
    }
    await exec(
      `INSERT INTO reviews (id, period, period_start, period_end, content_md, file_path, created_at)
       VALUES (?,?,?,?,?,NULL,?)`,
      [review.id, review.period, review.periodStart, review.periodEnd, review.contentMd, review.createdAt],
    )
    return review
  },

  /** 把 markdown 写到本地（dir 为空走默认目录：文档/Auxilia/复盘） */
  async saveToFile(dir: string, filename: string, content: string): Promise<string> {
    if (!isDesktop) throw new Error('浏览器预览无法写入本地文件')
    return call<string>('review_save_md', { dir: dir || null, filename, content })
  },

  async attachFile(id: string, filePath: string): Promise<void> {
    if (!isDesktop) return
    await exec('UPDATE reviews SET file_path = ? WHERE id = ?', [filePath, id])
  },

  async defaultDir(): Promise<string> {
    if (!isDesktop) return ''
    return call<string>('review_default_dir')
  },

  async settings(): Promise<ReviewSettings> {
    if (!isDesktop) {
      return {
        dailyOn: true, dailyHour: 21, weeklyOn: true, weeklyDow: 0, weeklyHour: 20,
        monthlyOn: true, monthlyDom: 1, monthlyHour: 10, exportDir: null,
        lastDailyAt: 0, lastWeeklyAt: 0, lastMonthlyAt: 0,
      }
    }
    const rows = await select<Row>(
      `SELECT daily_on AS "dailyOn", daily_hour AS "dailyHour", weekly_on AS "weeklyOn",
              weekly_dow AS "weeklyDow", weekly_hour AS "weeklyHour", monthly_on AS "monthlyOn",
              monthly_dom AS "monthlyDom", monthly_hour AS "monthlyHour", export_dir AS "exportDir",
              last_daily_at AS "lastDailyAt", last_weekly_at AS "lastWeeklyAt",
              last_monthly_at AS "lastMonthlyAt"
       FROM review_settings WHERE id = 1`,
    )
    const r = rows[0]
    if (!r) throw new Error('复盘设置缺失')
    return {
      dailyOn: bool(r.dailyOn),
      dailyHour: num(r.dailyHour),
      weeklyOn: bool(r.weeklyOn),
      weeklyDow: num(r.weeklyDow),
      weeklyHour: num(r.weeklyHour),
      monthlyOn: bool(r.monthlyOn),
      monthlyDom: num(r.monthlyDom),
      monthlyHour: num(r.monthlyHour),
      exportDir: (r.exportDir ?? null) as string | null,
      lastDailyAt: num(r.lastDailyAt),
      lastWeeklyAt: num(r.lastWeeklyAt),
      lastMonthlyAt: num(r.lastMonthlyAt),
    }
  },
}

/* ============================================================
   导入导出（P9 接真实逻辑，这里先定义契约）
   ============================================================ */

export const transferRepo = {
  async exportTasks(ids: string[]): Promise<string> {
    return call<string>('export_code', { ids })
  },
  async importCode(code: string, strategy: 'skip' | 'overwrite' | 'copy'): Promise<number> {
    return call<number>('import_code', { code, strategy })
  },
}
