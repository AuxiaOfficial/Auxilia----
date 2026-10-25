import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Check, X } from 'lucide-react'
import DurationWheel from './DurationWheel'
import Toggle from '@/components/ui/Toggle'
import type { DisplayMode, DurationMode, Lifecycle, NewTaskInput } from '@/lib/types'
import { formatClock, formatTime } from '@/lib/time'
import { useTaskStore } from '@/store/taskStore'
import { useUiStore } from '@/store/uiStore'

type Step = 'title' | 'lifecycle' | 'duration' | 'alerts' | 'display' | 'done'

const EASE = [0.32, 0.72, 0, 1] as const

export default function CreationDrawer(): React.ReactElement | null {
  const open = useUiStore((s) => s.creationOpen)
  const close = useUiStore((s) => s.closeCreation)
  const notify = useUiStore((s) => s.notify)
  const setView = useUiStore((s) => s.setView)
  const openStart = useUiStore((s) => s.openStart)
  const create = useTaskStore((s) => s.create)

  const [step, setStep] = useState<Step>('title')
  const [title, setTitle] = useState('')
  const [lifecycle, setLifecycle] = useState<Lifecycle>('permanent')
  const [expireDays, setExpireDays] = useState(7)
  const [mode, setMode] = useState<DurationMode>('countdown')
  const [seconds, setSeconds] = useState(25 * 60)
  const [scheduledAt, setScheduledAt] = useState('09:00')
  const [alertDialog, setAlertDialog] = useState(true)
  const [alertFlash, setAlertFlash] = useState(false)
  const [alertSound, setAlertSound] = useState(false)
  const [display, setDisplay] = useState<DisplayMode>('topbar')
  const [savedId, setSavedId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setStep('title')
    setTitle('')
    setLifecycle('permanent')
    setMode('countdown')
    setSeconds(25 * 60)
    setAlertDialog(true)
    setAlertFlash(false)
    setAlertSound(false)
    setDisplay('topbar')
    setSavedId(null)
  }, [open])

  // 每进入一步就把焦点放到第一个可选项上：这样上下键立刻可用，不用先点一下
  useEffect(() => {
    if (!open || step === 'title' || step === 'done') return
    const id = requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>('[data-creation-body] [data-nav-item]')
      el?.focus()
    })
    return () => cancelAnimationFrame(id)
  }, [open, step])

  if (!open) return null

  const canNext = title.trim().length > 0

  const save = async (): Promise<string | null> => {
    if (busy) return null
    if (!canNext) {
      notify('先给任务起个名字', 'danger')
      return null
    }
    setBusy(true)
    try {
      const payload: NewTaskInput = {
        title,
        lifecycle,
        durationMode: mode,
        plannedSeconds: mode === 'countdown' ? seconds : 0,
        expireAt: lifecycle === 'expiring' ? Date.now() + expireDays * 86400000 : null,
        scheduledAt:
          mode === 'scheduled'
            ? new Date(`${new Date().toDateString()} ${scheduledAt}`).getTime() || null
            : null,
        alertDialog,
        alertFlash,
        alertSound,
        displayMode: display,
      }
      const task = await create(payload)
      setSavedId(task.id)
      setStep('done')
      return task.id
    } catch (err) {
      notify(err instanceof Error ? err.message : '创建失败', 'danger')
      return null
    } finally {
      setBusy(false)
    }
  }

  const startNow = async (): Promise<void> => {
    let id = savedId
    if (!id) id = await save()
    if (!id) return
    close()
    openStart(id)
  }

  const timeValue = new Date(`${new Date().toDateString()} ${scheduledAt}`).getTime()

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-40 flex items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      >
        <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.72)' }} onClick={close} />
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.995 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.32, ease: EASE }}
          className="relative flex max-h-[86vh] w-full max-w-[560px] flex-col rounded-lg p-8"
          style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}
        >
          <div className="flex items-start justify-between">
            <input
              value={title}
              autoFocus
              disabled={step !== 'title' && step !== 'done'}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canNext && step === 'title') setStep('lifecycle')
              }}
              placeholder="要做什么？"
              className="w-full bg-transparent text-[22px] font-medium text-text-1 placeholder:text-text-3"
            />
            <button
              type="button"
              onClick={close}
              className="ml-4 mt-1 shrink-0 text-text-3 transition-colors duration-fast hover:text-text-1"
              aria-label="关闭"
            >
              <X size={16} strokeWidth={1.6} />
            </button>
          </div>

          <div
            data-creation-body
            className="mt-6 min-h-[140px] overflow-y-auto pr-1"
            onKeyDown={(e) => {
              // 统一键盘层：数字直选、Enter 走主按钮、上下交由焦点元素自己处理
              if (e.metaKey || e.ctrlKey || e.altKey) return
              if (/^[1-9]$/.test(e.key)) {
                const items = Array.from(
                  e.currentTarget.querySelectorAll<HTMLElement>('[data-nav-item]:not([disabled])'),
                )
                const target = items[Number(e.key) - 1]
                if (target) {
                  e.preventDefault()
                  target.click()
                }
                return
              }
              if (e.key === 'Enter' && !(e.target instanceof HTMLTextAreaElement)) {
                const primary = e.currentTarget.querySelector<HTMLElement>('[data-primary]')
                if (primary) {
                  e.preventDefault()
                  primary.click()
                }
              }
            }}
          >
            {step === 'title' && (
              <p className="text-[13px] leading-relaxed text-text-3">
                回车继续。名字随时能改，先把事说出来比想清楚更重要。
              </p>
            )}

            {step === 'lifecycle' && (
              <Group title="它会存在多久">
                <Option
                  label="总是存在"
                  hint="长期任务，做完也不消失"
                  active={lifecycle === 'permanent'}
                  onClick={() => {
                    setLifecycle('permanent')
                    setStep('duration')
                  }}
                />
                <Option
                  label="完成即删除"
                  hint="一次性的，结束就清理"
                  active={lifecycle === 'disposable'}
                  onClick={() => {
                    setLifecycle('disposable')
                    setStep('duration')
                  }}
                />
                <Option
                  label="到日期后删除"
                  hint="给有期限的事"
                  active={lifecycle === 'expiring'}
                  onClick={() => setLifecycle('expiring')}
                />
                {lifecycle === 'expiring' && (
                  <div className="mt-2 flex items-center gap-2 pl-1">
                    {[3, 7, 30].map((d) => (
                      <Chip key={d} active={expireDays === d} onClick={() => setExpireDays(d)}>
                        {d} 天后
                      </Chip>
                    ))}
                    <button
                      type="button"
                      onClick={() => setStep('duration')}
                      className="ml-auto text-[12px] text-text-2 hover:text-text-1"
                    >
                      继续
                    </button>
                  </div>
                )}
              </Group>
            )}

            {step === 'duration' && (
              <Group title="怎么计时">
                <div className="mb-4 flex gap-2">
                  {(
                    [
                      ['countdown', '倒计时'],
                      ['countup', '正计时'],
                      ['scheduled', '定时触发'],
                    ] as const
                  ).map(([v, label]) => (
                    <Chip key={v} active={mode === v} onClick={() => setMode(v)}>
                      {label}
                    </Chip>
                  ))}
                </div>

                {mode === 'countdown' && (
                  <>
                    <DurationWheel seconds={seconds} onChange={setSeconds} />
                    <p className="mt-4 text-center text-[13px] text-text-2">{formatClock(seconds)}</p>
                  </>
                )}
                {mode === 'countup' && (
                  <p className="py-10 text-center text-[13px] leading-relaxed text-text-3">
                    不设上限，做到你想停为止。
                    <br />
                    正计时的意思是——你说了算。
                  </p>
                )}
                {mode === 'scheduled' && (
                  <div className="flex flex-col items-center gap-4 py-8">
                    <input
                      type="time"
                      value={scheduledAt}
                      onChange={(e) => setScheduledAt(e.target.value)}
                      className="rounded-md px-4 py-2 text-[24px] text-text-1"
                      style={{ background: 'var(--surface-2)' }}
                    />
                    <p className="text-[12px] text-text-3">
                      {Number.isNaN(timeValue) ? '选个时间' : `将于 ${formatTime(timeValue)} 提醒`}
                      。如果那时你在做别的，会先问你。
                    </p>
                  </div>
                )}

                <div className="mt-4 flex justify-end">
                  <NextButton onClick={() => setStep('alerts')} />
                </div>
              </Group>
            )}

            {step === 'alerts' && (
              <Group title="到点时怎么叫你">
                <Toggle label="跳出软件弹窗" value={alertDialog} onChange={setAlertDialog} />
                <Toggle label="屏幕闪一下" value={alertFlash} onChange={setAlertFlash} />
                <Toggle label="响一声" value={alertSound} onChange={setAlertSound} />
                <div className="mt-4 flex justify-end">
                  <NextButton onClick={() => setStep('display')} />
                </div>
              </Group>
            )}

            {step === 'display' && (
              <Group title="跑到哪儿都看得见吗">
                <Option
                  label="贴顶部迷你浮条"
                  hint="96×26，一直在屏幕最上方"
                  active={display === 'topbar'}
                  onClick={() => setDisplay('topbar')}
                />
                <Option
                  label="浮窗"
                  hint="可拖到任意位置的小卡片"
                  active={display === 'float'}
                  onClick={() => setDisplay('float')}
                />
                <Option
                  label="不显示"
                  hint="只在软件里看得到"
                  active={display === 'none'}
                  onClick={() => setDisplay('none')}
                />
                <div className="mt-6 flex justify-end">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void save()}
                    className="h-9 rounded-full px-6 text-[13px] font-medium disabled:opacity-50"
                    style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
                  >
                    {busy ? '创建中…' : '创建任务'}
                  </button>
                </div>
              </Group>
            )}

            {step === 'done' && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: EASE }}
                className="flex h-full flex-col items-center justify-center gap-6"
              >
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-full"
                  style={{ background: 'var(--surface-2)' }}
                >
                  <Check size={20} strokeWidth={1.8} className="text-text-1" />
                </div>
                <div className="text-center">
                  <p className="text-[15px] text-text-1">已经放进任务池</p>
                  <p className="mt-1 text-[12px] text-text-3">
                    {mode === 'countdown' ? formatClock(seconds) : mode === 'countup' ? '正计时' : `定时 ${scheduledAt}`}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => void startNow()}
                    className="h-9 rounded-full px-6 text-[13px] font-medium"
                    style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
                  >
                    马上开始
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      close()
                      setView('home')
                    }}
                    className="h-9 rounded-full px-4 text-[13px] text-text-2 transition-colors duration-fast hover:text-text-1"
                  >
                    暂不开始
                  </button>
                </div>
              </motion.div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }): React.ReactElement {
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.26, ease: EASE }}>
      <p className="mb-3 text-[11px] uppercase tracking-[0.14em] text-text-2">{title}</p>
      <div className="flex flex-col gap-1" data-nav-container>{children}</div>
    </motion.div>
  )
}

function Option({
  label,
  hint,
  active,
  onClick,
}: {
  label: string
  hint: string
  active: boolean
  onClick: () => void
}): React.ReactElement {
  return (
    <button
      type="button"
      data-nav-item
      onClick={onClick}
      className="flex h-14 items-center justify-between rounded-md px-4 text-left outline-none transition-colors duration-fast hover:bg-surface-2 focus-visible:bg-surface-2"
      style={{ background: active ? 'var(--surface-2)' : 'transparent' }}
    >
      <span>
        <span className="block text-[13.5px] text-text-1">{label}</span>
        <span className="mt-0.5 block text-[11.5px] text-text-3">{hint}</span>
      </span>
      {active && <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--accent)' }} />}
    </button>
  )
}



function Chip({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode
  active: boolean
  onClick: () => void
}): React.ReactElement {
  return (
    <button
      type="button"
      data-nav-item
      onClick={onClick}
      className="h-7 rounded-full px-3 text-[12px] outline-none transition-colors duration-fast focus-visible:ring-1"
      style={{
        background: active ? 'var(--accent)' : 'var(--surface-2)',
        color: active ? 'var(--accent-fg)' : 'var(--text-2)',
      }}
    >
      {children}
    </button>
  )
}

function NextButton({ onClick }: { onClick: () => void }): React.ReactElement {
  return (
    <button
      type="button"
      data-primary
      onClick={onClick}
      className="h-9 rounded-full px-6 text-[13px] font-medium"
      style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
    >
      下一步
    </button>
  )
}
