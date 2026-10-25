import { create } from 'zustand'
import type { View } from '@/lib/types'
import { settingsRepo } from '@/lib/db'

interface Toast {
  id: number
  text: string
  tone: 'normal' | 'danger'
}

interface UiStore {
  view: View
  sidebarCollapsed: boolean
  rightbarCollapsed: boolean
  creationOpen: boolean
  finishTaskId: string | null
  /** 正在编辑的任务（新建 / 修改共用同一个抽屉） */
  editingTaskId: string | null
  /** 同时跑多个任务时的二次确认 */
  pendingStart: { taskId: string; title: string } | null
  /** 开始任务前的预期（prospect）面板 */
  startSheetTaskId: string | null
  /** 任务属性面板 */
  propsTaskId: string | null
  toast: Toast | null

  setView(view: View): void
  openCreation(): void
  closeCreation(): void
  openEditor(taskId: string): void
  closeEditor(): void
  confirmStart(taskId: string, title: string): void
  clearPendingStart(): void
  openStart(taskId: string): void
  closeStart(): void
  openProps(taskId: string): void
  closeProps(): void
  setFinish(taskId: string | null): void
  toggleSidebar(): void
  toggleRightbar(): void
  notify(text: string, tone?: Toast['tone']): void
  dismissToast(): void
  hydrate(): Promise<void>
}

export const useUiStore = create<UiStore>((set, get) => ({
  view: 'home',
  sidebarCollapsed: false,
  rightbarCollapsed: false,
  creationOpen: false,
  finishTaskId: null,
  editingTaskId: null,
  pendingStart: null,
  startSheetTaskId: null,
  propsTaskId: null,
  toast: null,

  setView(view) {
    set({ view })
  },
  openCreation() {
    set({ creationOpen: true, editingTaskId: null })
  },
  closeCreation() {
    set({ creationOpen: false, editingTaskId: null })
  },
  openEditor(taskId) {
    set({ editingTaskId: taskId, creationOpen: false })
  },
  closeEditor() {
    set({ editingTaskId: null })
  },
  confirmStart(taskId, title) {
    set({ pendingStart: { taskId, title } })
  },
  clearPendingStart() {
    set({ pendingStart: null })
  },
  openStart(taskId) {
    set({ startSheetTaskId: taskId })
  },
  closeStart() {
    set({ startSheetTaskId: null })
  },
  openProps(taskId) {
    set({ propsTaskId: taskId })
  },
  closeProps() {
    set({ propsTaskId: null })
  },
  setFinish(taskId) {
    set({ finishTaskId: taskId, view: taskId ? 'finish' : 'home' })
  },
  toggleSidebar() {
    const next = !get().sidebarCollapsed
    set({ sidebarCollapsed: next })
    void settingsRepo.set('ui.sidebarCollapsed', next ? '1' : '0')
  },
  toggleRightbar() {
    const next = !get().rightbarCollapsed
    set({ rightbarCollapsed: next })
    void settingsRepo.set('ui.rightbarCollapsed', next ? '1' : '0')
  },
  notify(text, tone = 'normal') {
    set({ toast: { id: Date.now(), text, tone } })
  },
  dismissToast() {
    set({ toast: null })
  },
  async hydrate() {
    const [sidebar, rightbar] = await Promise.all([
      settingsRepo.getBool('ui.sidebarCollapsed', false),
      settingsRepo.getBool('ui.rightbarCollapsed', false),
    ])
    set({ sidebarCollapsed: sidebar, rightbarCollapsed: rightbar })
  },
}))

export const useView = (): View => useUiStore((s) => s.view)
