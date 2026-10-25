import type React from 'react'

/**
 * 列表方向键导航：容器加 data-nav-container，每一项加 data-nav-item，
 * 上下左右都能走，Home/End 跳到首尾，Enter 交给元素自己（button 原生支持，
 * div 需要自己接 onClick）。
 */
export function listKeyDown(e: React.KeyboardEvent<HTMLElement>): void {
  const key = e.key
  if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key)) return
  const container = e.currentTarget.closest('[data-nav-container]')
  if (!container) return
  const items = Array.from(
    container.querySelectorAll<HTMLElement>('[data-nav-item]:not([disabled]):not([data-disabled="true"])'),
  )
  const current = e.currentTarget as HTMLElement
  const index = items.indexOf(current)
  if (index < 0) return
  e.preventDefault()
  let next = index
  if (key === 'ArrowDown' || key === 'ArrowRight') next = index + 1
  else if (key === 'ArrowUp' || key === 'ArrowLeft') next = index - 1
  else if (key === 'Home') next = 0
  else next = items.length - 1
  const target = items[Math.max(0, Math.min(items.length - 1, next))]
  target?.focus()
}

/** div 当按钮用时，Enter / Space 手动触发 */
export function activateOnEnter(e: React.KeyboardEvent<HTMLElement>): void {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    e.currentTarget.click()
  }
}
