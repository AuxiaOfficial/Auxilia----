import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight } from 'lucide-react'
import { call, isDesktop } from '@/lib/ipc'
import { settingsRepo } from '@/lib/db'
import { useUiStore } from '@/store/uiStore'

const EASE = [0.32, 0.72, 0, 1] as const

/** 把 KeyboardEvent 变成 Tauri 认识的 accelerator（KeyA / Digit1 / Space） */
function toAccelerator(e: KeyboardEvent): string | null {
  const parts: string[] = []
  if (e.ctrlKey) parts.push('Ctrl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  if (e.metaKey) parts.push('Super')

  const code = e.code
  const ignored = ['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight']
  if (ignored.includes(code)) return null
  if (!/^(Key[A-Z]|Digit[0-9]|F\d{1,2}|Space|Enter|Tab|Escape|Backquote|Minus|Equal|BracketLeft|BracketRight|Backslash|Semicolon|Quote|Comma|Period|Slash|ArrowUp|ArrowDown|ArrowLeft|ArrowRight)$/.test(code)) {
    return null
  }
  if (parts.length === 0) return null
  parts.push(code)
  return parts.join('+')
}

function pretty(accelerator: string): string {
  return accelerator
    .replace(/Key([A-Z])/g, '$1')
    .replace(/Digit(\d)/g, '$1')
    .replace(/\+/g, ' + ')
}

export default function Onboarding(): React.ReactElement | null {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)
  const [hotkey, setHotkey] = useState('Shift + Space')
  const [recording, setRecording] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const openCreation = useUiStore((s) => s.openCreation)

  useEffect(() => {
    void (async () => {
      const done = await settingsRepo.getBool('onboarded', false)
      if (done) return
      setOpen(true)
      if (isDesktop) {
        try {
          const current = await call<string>('hotkey_get')
          setHotkey(pretty(current))
        } catch {
          /* 读不到就显示默认值 */
        }
      }
    })()
  }, [])

  useEffect(() => {
    if (!recording) return
    const onKey = (e: KeyboardEvent): void => {
      e.preventDefault()
      if (e.key === 'Escape') {
        setRecording(false)
        return
      }
      const accel = toAccelerator(e)
      if (!accel) return
      void (async () => {
        try {
          await call('hotkey_set', { accelerator: accel })
          setHotkey(pretty(accel))
          setError(null)
          setRecording(false)
        } catch (err) {
          setError(err instanceof Error ? err.message : '这个组合注册不上，换一个')
        }
      })()
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [recording])

  const finish = async (): Promise<void> => {
    await settingsRepo.set('onboarded', '1')
    setOpen(false)
    openCreation()
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-bg px-10"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: EASE }}
        >
          <div className="w-full max-w-[460px]">
            <AnimatePresence mode="wait">
              {step === 0 && (
                <motion.div
                  key="s0"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.35, ease: EASE }}
                >
                  <p className="text-[11px] uppercase tracking-[0.16em] text-text-3">Auxilia</p>
                  <h1 className="mt-4 text-[24px] font-medium leading-snug text-text-1">
                    它不替你安排时间，
                    <br />
                    只帮你看清时间。
                  </h1>
                  <p className="mt-4 text-[13px] leading-relaxed text-text-3">
                    先做两件事：定一个唤起它的快捷键，然后建第一个任务。
                  </p>
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="mt-10 flex h-10 items-center gap-2 rounded-full px-6 text-[13px] font-medium"
                    style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
                  >
                    开始
                    <ArrowRight size={13} strokeWidth={2} />
                  </button>
                </motion.div>
              )}

              {step === 1 && (
                <motion.div
                  key="s1"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.35, ease: EASE }}
                >
                  <p className="text-[11px] uppercase tracking-[0.16em] text-text-3">第一步</p>
                  <h2 className="mt-3 text-[20px] font-medium text-text-1">用一个键，随时把它叫出来</h2>
                  <p className="mt-2 text-[13px] text-text-3">
                    在任何软件里按一下，Auxilia 就会出现；再按一下，它退到后台。
                  </p>

                  <div className="mt-8 flex items-center gap-3">
                    <div
                      className="flex h-12 min-w-[180px] items-center justify-center rounded-md px-5 text-[15px] text-text-1"
                      style={{ background: 'var(--surface-1)' }}
                    >
                      {recording ? '按下你想用的组合…' : hotkey}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setError(null)
                        setRecording(true)
                      }}
                      className="h-12 px-4 text-[13px] text-text-2 transition-colors duration-fast hover:text-text-1"
                    >
                      改一下
                    </button>
                  </div>
                  {error && <p className="mt-3 text-[12px] leading-relaxed" style={{ color: 'var(--warn)' }}>{error}</p>}

                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="mt-10 flex h-10 items-center gap-2 rounded-full px-6 text-[13px] font-medium"
                    style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
                  >
                    下一步
                    <ArrowRight size={13} strokeWidth={2} />
                  </button>
                </motion.div>
              )}

              {step === 2 && (
                <motion.div
                  key="s2"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.35, ease: EASE }}
                >
                  <p className="text-[11px] uppercase tracking-[0.16em] text-text-3">第二步</p>
                  <h2 className="mt-3 text-[20px] font-medium text-text-1">现在，建第一个任务</h2>
                  <p className="mt-2 text-[13px] leading-relaxed text-text-3">
                    随便写一件你最近要做的事。名字不重要，开始才是。
                  </p>
                  <button
                    type="button"
                    onClick={() => void finish()}
                    className="mt-10 flex h-10 items-center gap-2 rounded-full px-6 text-[13px] font-medium"
                    style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
                  >
                    新建第一个任务
                    <ArrowRight size={13} strokeWidth={2} />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
