import { create } from 'zustand'
import { tasklineRepo } from '@/lib/db'
import { useTaskStore } from '@/store/taskStore'
import type { TaskLine, TaskLineEntry } from '@/lib/types'

interface TimelineStore {
  lines: TaskLine[]
  activeId: string | null
  entries: TaskLineEntry[]
  loading: boolean
  error: string | null

  init(): Promise<void>
  select(id: string): Promise<void>
  createLine(name?: string): Promise<TaskLine>
  renameLine(id: string, name: string): Promise<void>
  removeLine(id: string): Promise<void>
  addEntry(taskId: string, minute: number, durationMinutes?: number): Promise<void>
  /** 右键菜单用：塞到当前 TaskLine 的下一个空闲 5 分钟刻度，返回落点分钟 */
  addToActive(taskId: string): Promise<number>
  setEntryDuration(entryId: string, durationMinutes: number): Promise<void>
  moveEntry(entryId: string, minute: number): Promise<void>
  removeEntry(entryId: string): Promise<void>
  reload(): Promise<void>
}

export const useTimelineStore = create<TimelineStore>((set, get) => ({
  lines: [],
  activeId: null,
  entries: [],
  loading: false,
  error: null,

  async init() {
    set({ loading: true, error: null })
    try {
      let lines = await tasklineRepo.list()
      if (lines.length === 0) {
        const created = await tasklineRepo.create('默认 TaskLine')
        lines = [created]
      }
      const activeId = get().activeId ?? lines[0]?.id ?? null
      const entries = activeId ? await tasklineRepo.entries(activeId) : []
      set({ lines, activeId, entries, loading: false })
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : '读取 TaskLine 失败' })
    }
  },

  async select(id) {
    const entries = await tasklineRepo.entries(id)
    set({ activeId: id, entries })
  },

  async createLine(name) {
    const line = await tasklineRepo.create(name ?? `TaskLine ${get().lines.length + 1}`)
    set({ lines: [...get().lines, line], activeId: line.id, entries: [] })
    return line
  },

  async renameLine(id, name) {
    await tasklineRepo.rename(id, name)
    set({ lines: get().lines.map((l) => (l.id === id ? { ...l, name: name.trim() } : l)) })
  },

  async removeLine(id) {
    await tasklineRepo.remove(id)
    const lines = get().lines.filter((l) => l.id !== id)
    const activeId = get().activeId === id ? (lines[0]?.id ?? null) : get().activeId
    const entries = activeId ? await tasklineRepo.entries(activeId) : []
    set({ lines, activeId, entries })
  },

  async addEntry(taskId, minute, durationMinutes) {
    const activeId = get().activeId
    if (!activeId) return
    // 块长取任务的计划时长；正计时/定时任务没有计划时长，退回 30 分钟
    const task = useTaskStore.getState().tasks.find((t) => t.id === taskId)
    const fallback = Math.round((task?.plannedSeconds ?? 0) / 60) || 30
    const entry = await tasklineRepo.addEntry(activeId, taskId, minute, durationMinutes ?? fallback)
    set({
      entries: [...get().entries, entry].sort((a, b) => a.minuteOfDay - b.minuteOfDay),
    })
  },

  async setEntryDuration(entryId, durationMinutes) {
    await tasklineRepo.setEntryDuration(entryId, durationMinutes)
    set({
      entries: get().entries.map((e) =>
        e.id === entryId
          ? { ...e, durationMinutes: Math.min(600, Math.max(5, Math.round(durationMinutes))) }
          : e,
      ),
    })
  },

  async addToActive(taskId) {
    const { activeId, entries } = get()
    if (!activeId) throw new Error('还没有可用的 TaskLine')
    const now = new Date()
    let minute = Math.min(1435, Math.max(0, now.getHours() * 60 + Math.round(now.getMinutes() / 5) * 5))
    const taken = new Set(entries.map((e) => e.minuteOfDay))
    let guard = 0
    while (taken.has(minute) && guard < 288) {
      minute = (minute + 5) % 1440
      guard += 1
    }
    await get().addEntry(taskId, minute)
    return minute
  },

  async moveEntry(entryId, minute) {
    await tasklineRepo.moveEntry(entryId, minute)
    set({
      entries: get()
        .entries.map((e) => (e.id === entryId ? { ...e, minuteOfDay: Math.round(minute) } : e))
        .sort((a, b) => a.minuteOfDay - b.minuteOfDay),
    })
  },

  async removeEntry(entryId) {
    await tasklineRepo.removeEntry(entryId)
    set({ entries: get().entries.filter((e) => e.id !== entryId) })
  },

  async reload() {
    const activeId = get().activeId
    const lines = await tasklineRepo.list()
    const entries = activeId ? await tasklineRepo.entries(activeId) : []
    set({ lines, entries })
  },
}))
