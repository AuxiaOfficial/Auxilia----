import { create } from 'zustand'

/**
 * 拖拽期间的全局载荷。
 * dragover 阶段浏览器不允许读 dataTransfer 里的数据，所以把
 * 被拖任务的标题和预计时长放在这里，时间轴才能在悬停时画出"幽灵块"。
 */
interface DragStore {
  taskId: string | null
  title: string
  minutes: number
  begin(payload: { taskId: string; title: string; minutes: number }): void
  end(): void
}

export const useDragStore = create<DragStore>((set) => ({
  taskId: null,
  title: '',
  minutes: 30,
  begin(payload) {
    set(payload)
  },
  end() {
    set({ taskId: null, title: '', minutes: 30 })
  },
}))
