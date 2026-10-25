import { create } from 'zustand'

export interface MenuItem {
  label: string
  hint?: string
  danger?: boolean
  disabled?: boolean
  onSelect: () => void
}

interface MenuStore {
  open: boolean
  x: number
  y: number
  items: MenuItem[]
  /** 键盘导航高亮项 */
  index: number
  openAt(x: number, y: number, items: MenuItem[]): void
  close(): void
  move(delta: number): void
  setIndex(index: number): void
  choose(): void
}

export const useMenuStore = create<MenuStore>((set, get) => ({
  open: false,
  x: 0,
  y: 0,
  items: [],
  index: -1,

  openAt(x, y, items) {
    // 越靠边越往上/往左翻，避免菜单被裁掉
    const w = 200
    const h = items.length * 32 + 12
    const px = x + w > window.innerWidth - 8 ? window.innerWidth - w - 8 : x
    const py = y + h > window.innerHeight - 8 ? window.innerHeight - h - 8 : y
    set({ open: true, x: px, y: py, items, index: -1 })
  },

  close() {
    set({ open: false, items: [], index: -1 })
  },

  move(delta) {
    const { items, index } = get()
    if (items.length === 0) return
    let next = index
    for (let i = 0; i < items.length; i += 1) {
      next = (next + delta + items.length) % items.length
      if (!items[next]?.disabled) break
    }
    set({ index: next })
  },

  setIndex(index) {
    set({ index })
  },

  choose() {
    const { items, index } = get()
    const item = items[index]
    if (!item || item.disabled) return
    get().close()
    item.onSelect()
  },
}))
