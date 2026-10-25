import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useTaskStore } from '@/store/taskStore'
import { useUiStore } from '@/store/uiStore'
import Toggle from '@/components/ui/Toggle'
import type { DisplayMode, DurationMode } from '@/lib/types'

const EASE = [0.32, 0.72, 0, 1] as const

const MODES: { key: DurationMode; label: string }[] = [
  { key: 'countdown', label: '倒计时' },
  { key: 'countup', label: '正计时' },
  { key: 'scheduled', label: '定时' },
]

const DISPLAYS: { key: DisplayMode; label: string }[] = [
  { key: 'topbar', label: '顶部浮条' },
  { key: 'float', label: '浮窗' },
  { key: 'none', label: '不显示' },
]

/** 任务属性：不用重建任务就能改时长、提示、显示方式 */
export default function TaskPropsSheet(): React.ReactElement {
  const taskId = useUiStore((s) => s.propsTaskId)
  const close = useUiStore((s) => s.closeProps)
  const notify = useUiStore((s) => s.notify)
  const tasks = useTaskStore((s) => s.tasks)
  const update = useTaskStore((s) => s.update)

  const task = tasks.find((t) => t.id === taskId) ?? null

  const [mode, setMode] = useState<DurationMode>('countdown')
  const [minutes, setMinutes] = useState(25)
  const [alertDialog, setAlertDialog] = useState(true)
  const [alertFlash, setAlertFlash] = useState(true)
  const [alertSound, setAlertSound] = useState(true)
  const [display, setDisplay] = useState<DisplayMode>('topbar')

  useEffect(() => {
    if (!task) return
    setMode(task.durationMode)
    setMinutes(Math.max(1, Math.round((task.plannedSeconds || 1500) / 60)))
    setAlertDialog(task.alertDialog)
    setAlertFlash(task.alertFlash)
    setAlertSound(task.alertSound)
    setDisplay(task.displayMode)
  }, [task])

  if (!task) return <AnimatePresence />

  const save = async (): Promise<void> => {
    try {
      await update(task.id, {
        durationMode: mode,
        plannedSeconds: mode === 'countdown' ? Math.max(60, minutes * 60) : 0,
        alertDialog,
        alertFlash,
        alertSound,
        displayMode: display,
      })
      notify('已保存任务属性')
      close()
    } catch (err) {
      notify(err instanceof Error ? err.message : '保存失败', 'danger')
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-40 flex justify-end"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2, ease: EASE }}
        style={{ background: 'rgba(0,0,0,0.55)' }}
        onClick={close}
      >
        <motion.div
          initial={{ x: 24, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 24, opacity: 0 }}
          transition={{ duration: 0.24, ease: EASE }}
          className="flex h-full w-[380px] flex-col"
          style={{ background: 'var(--surface-1)', borderLeft: '1px solid var(--border)' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-6 pb-2 pt-5">
            <div>
              <p className="text-[11px] uppercase tracking-[0.14em] text-text-2">任务属性</p>
              <p className="mt-1 max-w-[280px] truncate text-[15px] text-text-1">{task.title}</p>
            </div>
            <button type="button" onClick={close} className="text-[12px] text-text-2 hover:text-text-1">
              关闭
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
            <p className="mt-6 mb-2 text-[11px] uppercase tracking-[0.14em] text-text-2">计时方式</p>
            <div className="flex gap-2" data-nav-container>
              {MODES.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  data-nav-item
                  onClick={() => setMode(m.key)}
                  className="h-8 rounded-full px-4 text-[12px] outline-none transition-colors duration-fast"
                  style={{
                    background: mode === m.key ? 'var(--accent)' : 'var(--surface-2)',
                    color: mode === m.key ? 'var(--accent-fg)' : 'var(--text-2)',
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {mode === 'countdown' && (
              <div className="mt-4 flex items-center justify-between rounded-md px-4 py-3" style={{ background: 'var(--surface-2)' }}>
                <span className="text-[13px] text-text-1">计划时长</span>
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => setMinutes((v) => Math.max(1, v - 5))} className="text-[13px] text-text-2 hover:text-text-1">
                    −5
                  </button>
                  <input
                    type="number"
                    value={minutes}
                    onChange={(e) => setMinutes(Math.max(1, Number(e.target.value) || 1))}
                    className="w-12 bg-transparent text-center text-[13px] text-text-1"
                  />
                  <span className="text-[12px] text-text-2">分钟</span>
                  <button type="button" onClick={() => setMinutes((v) => v + 5)} className="text-[13px] text-text-2 hover:text-text-1">
                    +5
                  </button>
                </div>
              </div>
            )}

            <p className="mt-6 mb-2 text-[11px] uppercase tracking-[0.14em] text-text-2">提示力度</p>
            <div className="rounded-md" style={{ background: 'var(--surface-2)' }}>
              <Toggle label="弹出软件" value={alertDialog} onChange={setAlertDialog} />
              <Toggle label="屏幕提示" value={alertFlash} onChange={setAlertFlash} />
              <Toggle label="响一声" value={alertSound} onChange={setAlertSound} />
            </div>

            <p className="mt-6 mb-2 text-[11px] uppercase tracking-[0.14em] text-text-2">显示方式</p>
            <div className="flex flex-col gap-1" data-nav-container>
              {DISPLAYS.map((d) => (
                <button
                  key={d.key}
                  type="button"
                  data-nav-item
                  onClick={() => setDisplay(d.key)}
                  className="flex h-10 items-center justify-between rounded-md px-4 text-[13px] outline-none transition-colors duration-fast"
                  style={{ background: display === d.key ? 'var(--surface-2)' : 'transparent' }}
                >
                  <span className="text-text-1">{d.label}</span>
                  {display === d.key && (
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--accent)' }} />
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 px-6 py-4">
            <button type="button" onClick={close} className="text-[12.5px] text-text-2 hover:text-text-1">
              取消
            </button>
            <button
              type="button"
              onClick={() => void save()}
              className="h-9 rounded-full px-6 text-[13px] font-medium"
              style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
            >
              保存
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
