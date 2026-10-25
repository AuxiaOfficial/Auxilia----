import { create } from 'zustand'
import { runRepo } from '@/lib/db'
import { isDesktop, listen } from '@/lib/ipc'
import { devEngine } from '@/lib/devEngine'
import { liveActiveSeconds } from '@/lib/time'
import type { RunSnapshot, Task } from '@/lib/types'
import { useUiStore } from './uiStore'
import { useTaskStore } from './taskStore'

interface FinishResult {
  coinEarned: number
  activeSeconds: number
  level: number
}

interface RunStore {
  runs: RunSnapshot[]
  initialized: boolean
  init(): Promise<void>
  refresh(): Promise<void>
  start(task: Task, prospect: string, plannedSeconds: number): Promise<void>
  pause(taskId: string): Promise<void>
  resume(taskId: string): Promise<void>
  finish(taskId: string, outcome: string, moment: string, next: string): Promise<FinishResult>
  abort(taskId: string): Promise<void>
}

export const useRunStore = create<RunStore>((set, get) => ({
  runs: [],
  initialized: false,

  async init() {
    if (get().initialized) return
    set({ initialized: true })

    if (!isDesktop) {
      devEngine.subscribe((runs) => set({ runs: [...runs] }))
      devEngine.onFinished((taskId) => {
        useUiStore.getState().setFinish(taskId)
      })
      return
    }

    set({ runs: await runRepo.active() })
    await listen<RunSnapshot[]>('run:changed', (runs) => set({ runs }))
    await listen<{ taskId: string }>('timer:finished', (payload) => {
      void get().refresh()
      useUiStore.getState().setFinish(payload.taskId)
    })
    await listen<{ taskId: string; title: string }>('scheduled:conflict', (payload) => {
      useUiStore.getState().confirmStart(payload.taskId, payload.title)
    })
    await listen<{ taskId: string; title: string }>('scheduled:missed', (payload) => {
      useUiStore.getState().notify(`「${payload.title}」到点未开始，补上吗？`)
    })
    await listen<{ taskId: string }>('run:recovered', (payload) => {
      void get().refresh()
      useUiStore.getState().notify('上次异常退出，已恢复未结束的任务')
      useUiStore.getState().setFinish(payload.taskId)
    })
    await listen<string>('hotkey:failed', (reason) => {
      useUiStore.getState().notify(`快捷键注册失败：${reason}`)
    })
  },

  async refresh() {
    if (!isDesktop) {
      set({ runs: devEngine.active() })
      return
    }
    set({ runs: await runRepo.active() })
  },

  async start(task, prospect, plannedSeconds) {
    if (!isDesktop) {
      const run = devEngine.start(task, prospect, plannedSeconds)
      set({ runs: devEngine.active() })
      void run
      return
    }
    const run = await runRepo.start(task.id, prospect, plannedSeconds)
    set({ runs: [...get().runs.filter((r) => r.taskId !== task.id), run] })
  },

  async pause(taskId) {
    if (!isDesktop) {
      devEngine.pause(taskId)
      set({ runs: devEngine.active() })
      return
    }
    const run = await runRepo.pause(taskId)
    set({ runs: get().runs.map((r) => (r.taskId === taskId ? run : r)) })
  },

  async resume(taskId) {
    if (!isDesktop) {
      devEngine.resume(taskId)
      set({ runs: devEngine.active() })
      return
    }
    const run = await runRepo.resume(taskId)
    set({ runs: get().runs.map((r) => (r.taskId === taskId ? run : r)) })
  },

  async finish(taskId, outcome, moment, next) {
    if (!isDesktop) {
      const { activeSeconds } = devEngine.stop(taskId)
      const coin = Math.round(activeSeconds / 60)
      set({ runs: devEngine.active() })
      void useTaskStore.getState().fetch()
      return { coinEarned: coin, activeSeconds, level: 1 }
    }
    const result = await runRepo.finish(taskId, outcome, moment, next)
    set({ runs: get().runs.filter((r) => r.taskId !== taskId) })
    void useTaskStore.getState().fetch()
    return result
  },

  async abort(taskId) {
    if (!isDesktop) {
      devEngine.stop(taskId)
      set({ runs: devEngine.active() })
      return
    }
    await runRepo.abort(taskId)
    set({ runs: get().runs.filter((r) => r.taskId !== taskId) })
    void useTaskStore.getState().fetch()
  },
}))

/** 某个任务当前的已跑秒数（纯推算，不累加） */
export function useRunSeconds(taskId: string): number {
  return useRunStore((s) => {
    const run = s.runs.find((r) => r.taskId === taskId)
    if (!run) return 0
    return liveActiveSeconds(run.closedSeconds, run.segmentStartedAt)
  })
}
