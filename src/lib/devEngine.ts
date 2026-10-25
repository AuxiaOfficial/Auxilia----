/* ============================================================
   浏览器预览专用的假引擎（桌面端不使用）
   仅用于在没有 Rust 的情况下检查界面与流程
   ============================================================ */

import { newId } from './id'
import type { RunSnapshot, Task } from './types'

type Listener = (runs: RunSnapshot[]) => void
type FinishListener = (taskId: string) => void

const runs = new Map<string, RunSnapshot>()
const listeners = new Set<Listener>()
const finishListeners = new Set<FinishListener>()
let timer: ReturnType<typeof setInterval> | null = null

function snapshot(): RunSnapshot[] {
  return [...runs.values()]
}

function broadcast(): void {
  listeners.forEach((fn) => fn(snapshot()))
}

function ensureTimer(): void {
  if (timer) return
  timer = setInterval(() => {
    const now = Date.now()
    for (const run of runs.values()) {
      if (run.segmentStartedAt === null || run.mode !== 'countdown') continue
      const active = run.closedSeconds + Math.floor((now - run.segmentStartedAt) / 1000)
      if (active >= run.plannedSeconds && run.plannedSeconds > 0) {
        run.closedSeconds = run.plannedSeconds
        run.segmentStartedAt = null
        run.pausedSeconds += 0
        finishListeners.forEach((fn) => fn(run.taskId))
        broadcast()
      }
    }
  }, 500)
}

const tick = (): void => {
  broadcast()
}

export const devEngine = {
  subscribe(fn: Listener): () => void {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },
  onFinished(fn: FinishListener): () => void {
    finishListeners.add(fn)
    return () => finishListeners.delete(fn)
  },
  active(): RunSnapshot[] {
    return snapshot()
  },
  start(task: Task, prospect: string, plannedSeconds: number): RunSnapshot {
    const run: RunSnapshot = {
      runId: newId(),
      taskId: task.id,
      taskTitle: task.title,
      mode: task.durationMode,
      plannedSeconds,
      segmentStartedAt: Date.now(),
      closedSeconds: 0,
      pausedSeconds: 0,
      startedAt: Date.now(),
      prospect,
      displayMode: task.displayMode,
      alertDialog: task.alertDialog,
      alertFlash: task.alertFlash,
      alertSound: task.alertSound,
    }
    runs.set(task.id, run)
    ensureTimer()
    tick()
    return run
  },
  pause(taskId: string): RunSnapshot {
    const run = runs.get(taskId)
    if (!run) throw new Error('任务不在运行中')
    if (run.segmentStartedAt !== null) {
      run.closedSeconds += Math.floor((Date.now() - run.segmentStartedAt) / 1000)
      run.segmentStartedAt = null
    }
    tick()
    return run
  },
  resume(taskId: string): RunSnapshot {
    const run = runs.get(taskId)
    if (!run) throw new Error('任务不在运行中')
    if (run.segmentStartedAt === null) run.segmentStartedAt = Date.now()
    tick()
    return run
  },
  stop(taskId: string): { activeSeconds: number } {
    const run = runs.get(taskId)
    if (run && run.segmentStartedAt !== null) {
      run.closedSeconds += Math.floor((Date.now() - run.segmentStartedAt) / 1000)
      run.segmentStartedAt = null
    }
    runs.delete(taskId)
    tick()
    return { activeSeconds: run?.closedSeconds ?? 0 }
  },
  get(taskId: string): RunSnapshot | undefined {
    return runs.get(taskId)
  },
}
