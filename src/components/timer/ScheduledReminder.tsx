import { AnimatePresence, motion } from 'motion/react'
import { Bell } from 'lucide-react'
import { useUiStore } from '@/store/uiStore'

const EASE = [0.32, 0.72, 0, 1] as const

/**
 * 定时任务到点提醒。
 * 语义修正：定时任务是「提醒你该去做这件事」，不是替你开跑 ——
 * 开会、吃药、打电话这些事本来就不该被计时器占用。
 */
export default function ScheduledReminder(): React.ReactElement {
  const due = useUiStore((s) => s.scheduledDue)
  const close = useUiStore((s) => s.setScheduledDue)
  const openStart = useUiStore((s) => s.openStart)
  const notify = useUiStore((s) => s.notify)

  return (
    <AnimatePresence>
      {due && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center px-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.62)' }} onClick={() => close(null)} />
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.26, ease: EASE }}
            className="relative w-full max-w-[420px] rounded-lg p-6"
            style={{ background: 'var(--surface-1)', border: '1px solid var(--border-strong)' }}
          >
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-text-2">
              <Bell size={12} strokeWidth={1.8} />
              到点了
            </div>
            <h3 className="mt-3 text-[19px] font-medium text-text-1">{due.title}</h3>
            <p className="mt-2 text-[12.5px] leading-relaxed text-text-2">
              该去做这件事了。要现在开始计时吗？
            </p>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  close(null)
                  notify('提醒已关闭，10 分钟后再响')
                  window.setTimeout(() => useUiStore.getState().setScheduledDue(due), 10 * 60 * 1000)
                }}
                className="text-[12.5px] text-text-2 hover:text-text-1"
              >
                10 分钟后再说
              </button>
              <button
                type="button"
                onClick={() => {
                  close(null)
                  openStart(due.taskId)
                }}
                className="h-9 rounded-full px-5 text-[13px] font-medium"
                style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
              >
                现在开始
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
