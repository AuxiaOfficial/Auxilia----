import { create } from 'zustand'
import { taskRepo } from '@/lib/db'
import type { NewTaskInput, Task } from '@/lib/types'

interface TaskStore {
  tasks: Task[]
  keyword: string
  loading: boolean
  error: string | null
  loaded: boolean
  selected: string[]

  fetch(): Promise<void>
  search(keyword: string): void
  create(input: NewTaskInput): Promise<Task>
  update(id: string, patch: Partial<Task>): Promise<void>
  remove(id: string): Promise<void>
  batchRemove(ids: string[]): Promise<void>
  toggleSelect(id: string): void
  clearSelect(): void
  replace(task: Task): void
}

let debounce: ReturnType<typeof setTimeout> | null = null

export const useTaskStore = create<TaskStore>((set, get) => ({
  tasks: [],
  keyword: '',
  loading: false,
  error: null,
  loaded: false,
  selected: [],

  async fetch() {
    set({ loading: true, error: null })
    try {
      const tasks = await taskRepo.list({ keyword: get().keyword })
      set({ tasks, loading: false, loaded: true })
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : '读取任务失败' })
    }
  },

  search(keyword) {
    set({ keyword })
    if (debounce) clearTimeout(debounce)
    debounce = setTimeout(() => {
      void get().fetch()
    }, 250)
  },

  async create(input) {
    const task = await taskRepo.create(input)
    set({ tasks: [task, ...get().tasks] })
    return task
  },

  async update(id, patch) {
    const updated = await taskRepo.update(id, patch)
    set({ tasks: get().tasks.map((t) => (t.id === id ? updated : t)) })
  },

  async remove(id) {
    await taskRepo.remove(id)
    set({
      tasks: get().tasks.filter((t) => t.id !== id),
      selected: get().selected.filter((s) => s !== id),
    })
  },

  async batchRemove(ids) {
    await taskRepo.batchRemove(ids)
    set({
      tasks: get().tasks.filter((t) => !ids.includes(t.id)),
      selected: [],
    })
  },

  toggleSelect(id) {
    const selected = get().selected
    set({
      selected: selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id],
    })
  },

  clearSelect() {
    set({ selected: [] })
  },

  replace(task) {
    set({ tasks: get().tasks.map((t) => (t.id === task.id ? task : t)) })
  },
}))
