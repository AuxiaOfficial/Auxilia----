import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { formatClock, formatTime } from '@/lib/time'
import { useTaskStore } from '@/store/taskStore'
import { useRunStore } from '@/store/runStore'
import { useUiStore } from '@/store/uiStore'
import { flowCoinsForCount, walletRepo } from '@/lib/db'

const EASE = [0.32, 0.72, 0, 1] as const

export default function StartSheet(): React.ReactElement {
  const taskId = useUiStore((s) => s.startSheetTaskId)
  const close = useUiStore((s) => s.closeStart)
  const notify = useUiStore((s) => s.notify)
  const setView = useUiStore((s) => s.setView)
  const tasks = useTaskStore((s) => s.tasks)
  const runs = useRunStore((s) => s.runs)
  const start = useRunStore((s) => s.start)
  const [prospect, setProspect] = useState('')
  const [busy, setBusy] = useState(false)
  const typed = useRef(0)

  useEffect(() => {
    if (taskId) {
      setProspect('')
      typed.current = 0
    }
  }, [taskId])

  const task = tasks.find((t) => t.id === taskId) ?? null
  const others = runs.filter((r) => r.taskId !== taskId)

  const submit = async (): Promise<void> => {
    if (!task || busy) return
    setBusy(true)
    try {
      const run = await start(task, prospect.trim(), task.plannedSeconds)
      // 开始前写的预期也换心流币（只算手打的字）
      if (run && typed.current >= 30) {
        const coins = flowCoinsForCount(typed.current)
        if (coins > 0) {
          const granted = await walletRepo.grantFlow(`run:${run.runId}:prospect`, coins)
          if (granted > 0) notify(`预期 +${granted} 心流币`)
        }
      }
      close()
      setView('focus')
    } catch (err) {
      notify(err instanceof Error ? err.message : '开始失败', 'danger')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AnimatePresence>
      {task && (
        <motion.div
          className="fixed inset-0 z-40 flex items-center justify-center px-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={close}
        >
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.6)' }} />
          <motion.div
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, y: 10, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.995 }}
            transition={{ duration: 0.28, ease: EASE }}
            className="relative w-full max-w-[520px] rounded-lg p-6"
            style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}
          >
            <p className="text-[11px] uppercase tracking-[0.14em] text-text-3">开始前，先定个调子</p>
            <h3 className="mt-2 text-[18px] font-medium text-text-1">{task.title}</h3>

            <div className="mt-1 flex items-center gap-2 text-[12px] text-text-3">
              {task.durationMode === 'countdown' && <span>倒计时 {formatClock(task.plannedSeconds)}</span>}
              {task.durationMode === 'countup' && <span>正计时，不设上限</span>}
              {task.durationMode === 'scheduled' && task.scheduledAt !== null && (
                <span>定时 {formatTime(task.scheduledAt)}</span>
              )}
              {task.runCount > 0 && <span>· 第 {task.runCount + 1} 次</span>}
            </div>

            <textarea
              value={prospect}
              onChange={(e) => setProspect(e.target.value)}
              rows={3}
              autoFocus
              placeholder="这一轮想达成什么？结束后你会拿它对照自己。"
              className="mt-5 w-full resize-none rounded-md px-3 py-2.5 text-[13.5px] leading-relaxed text-text-1 placeholder:text-text-dim"
              style={{ background: 'var(--surface-2)' }}
              onKeyDown={(e) => {
                // Enter 直接开始，Shift+Enter 才是换行 —— 键盘不该来回跳到鼠标
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void submit()
                  return
                }
                if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) typed.current += 1
                else if (e.key === 'Backspace') typed.current = Math.max(0, typed.current - 1)
              }}
              onCompositionEnd={(e) => {
                typed.current += e.data.length
              }}
              onPaste={(e) => {
                // 粘贴照收，但不计心流币
                e.preventDefault()
                const text = e.clipboardData.getData('text')
                const el = e.currentTarget
                const start = el.selectionStart ?? el.value.length
                const end = el.selectionEnd ?? el.value.length
                setProspect(el.value.slice(0, start) + text + el.value.slice(end))
              }}
            />

            {others.length > 0 && (
              <p className="mt-3 text-[12px] leading-relaxed" style={{ color: 'var(--warn)' }}>
                已有 {others.length} 个任务在跑（{others.map((r) => r.taskTitle).join('、')}）。同时开始会分散注意力。
              </p>
            )}

            <div className="mt-6 flex items-center justify-between">
              <button
                type="button"
                onClick={close}
                className="text-[13px] text-text-3 transition-colors duration-fast hover:text-text-1"
              >
                取消
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void submit()}
                className="h-9 rounded-full px-6 text-[13px] font-medium transition-opacity duration-fast disabled:opacity-50"
                style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
              >
                {busy ? '开始中…' : '开始'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
