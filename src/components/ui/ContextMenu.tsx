import { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useMenuStore } from '@/store/menuStore'

const EASE = [0.32, 0.72, 0, 1] as const

/** 自绘右键菜单：替代 WebView2 默认菜单，全部可键盘操作 */
export default function ContextMenu(): React.ReactElement {
  const open = useMenuStore((s) => s.open)
  const x = useMenuStore((s) => s.x)
  const y = useMenuStore((s) => s.y)
  const items = useMenuStore((s) => s.items)
  const index = useMenuStore((s) => s.index)
  const close = useMenuStore((s) => s.close)
  const move = useMenuStore((s) => s.move)
  const setIndex = useMenuStore((s) => s.setIndex)
  const choose = useMenuStore((s) => s.choose)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) close()
    }
    window.addEventListener('mousedown', onDown, true)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('blur', close)
    }
  }, [open, close])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        close()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        e.stopPropagation()
        move(1)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        e.stopPropagation()
        move(-1)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        e.stopPropagation()
        choose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, close, move, choose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={ref}
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.12, ease: EASE }}
          className="fixed z-[80] w-[200px] rounded-md p-1.5"
          style={{
            left: x,
            top: y,
            background: 'rgba(20,20,20,0.96)',
            border: '1px solid var(--border-strong)',
            backdropFilter: 'blur(18px)',
            boxShadow: '0 12px 32px rgba(0,0,0,0.6)',
          }}
          // 菜单自己不要触发全局 contextmenu
          onContextMenu={(e) => e.preventDefault()}
        >
          {items.map((item, i) => (
            <button
              key={item.label}
              type="button"
              disabled={item.disabled}
              onMouseEnter={() => setIndex(i)}
              onClick={() => {
                close()
                item.onSelect()
              }}
              className="flex h-8 w-full items-center justify-between rounded-sm px-2.5 text-left text-[12.5px] transition-colors duration-fast"
              style={{
                background: i === index ? 'var(--surface-3)' : 'transparent',
                color: item.disabled
                  ? 'var(--text-dim)'
                  : item.danger
                    ? 'var(--danger)'
                    : 'var(--text-1)',
                cursor: item.disabled ? 'default' : 'pointer',
              }}
            >
              <span>{item.label}</span>
              {item.hint && <span className="text-[10.5px] text-text-dim">{item.hint}</span>}
            </button>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
