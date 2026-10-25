import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight, Check } from 'lucide-react'
import { formatClock, liveActiveSeconds } from '@/lib/time'
import { useRunStore } from '@/store/runStore'
import { useTaskStore } from '@/store/taskStore'
import { useUiStore } from '@/store/uiStore'
import { useSettingsStore } from '@/store/settingsStore'
import { useNow } from '@/hooks/useNow'

const EASE = [0.32, 0.72, 0, 1] as const

export default function FinishFlow(): React.ReactElement {
  const taskId = useUiStore((s) => s.finishTaskId)
  const setFinish = useUiStore((s) => s.setFinish)
  const setView = useUiStore((s) => s.setView)
  const notify = useUiStore((s) => s.notify)
  const runs = useRunStore((s) => s.runs)
  const finish = useRunStore((s) => s.finish)
  const tasks = useTaskStore((s) => s.tasks)
  const reviewEnabled = useSettingsStore((s) => s.reviewEnabled)
  const reviewQuestions = useSettingsStore((s) => s.reviewQuestions)
  const now = useNow(1000)

  const questions = reviewEnabled ? reviewQuestions.slice(0, 3) : []
  const total = questions.length

  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<string[]>([])
  const [draft, setDraft] = useState('')
  const [result, setResult] = useState<{ coin: number; seconds: number; level: number } | null>(null)
  const [busy, setBusy] = useState(false)

  const task = tasks.find((t) => t.id === taskId) ?? null
  const run = runs.find((r) => r.taskId === taskId) ?? null
  const seconds = run ? liveActiveSeconds(run.closedSeconds, run.segmentStartedAt, now) : 0
  const coin = result?.coin ?? Math.ceil(seconds / 60)

  if (!taskId || !task) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-text-2">
        <p className="text-[15px]">没有待结束的任务</p>
        <button type="button" onClick={() => setView('home')} className="text-[13px] text-text-1">
          回到任务池
        </button>
      </div>
    )
  }

  /** 统一的收尾：写库、更新任务、切到结果页。skip 时答案为空但照常结算 */
  const settle = async (useAnswers: boolean, goHome = false): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      const a = useAnswers ? answers : []
      const res = await finish(taskId, a[0] ?? '', a[1] ?? '', a[2] ?? '')
      await useTaskStore.getState().fetch()
      if (goHome) {
        // 「跳过」= 结算完直接回去，不摆结果页
        setFinish(null)
        setView('home')
        return
      }
      setResult({ coin: res.coinEarned, seconds: res.activeSeconds, level: res.level })
    } catch (err) {
      notify(err instanceof Error ? err.message : '保存失败', 'danger')
    } finally {
      setBusy(false)
    }
  }

  const startQuestions = (): void => {
    if (total === 0) {
      void settle(true)
      return
    }
    setStep(1)
  }

  const submitAnswer = (): void => {
    const index = step - 1
    const next = [...answers]
    next[index] = draft.trim()
    setAnswers(next)
    setDraft('')
    if (step >= total) void settle(true)
    else setStep(step + 1)
  }

  const doneView = result !== null
  const current = step >= 1 ? questions[step - 1] : undefined

  return (
    <div className="flex h-full items-center justify-center px-10">
      <div className="w-full max-w-[520px]">
        <AnimatePresence mode="wait">
          {step === 0 && !doneView && (
            <motion.div
              key="ready"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.32, ease: EASE }}
              className="flex flex-col items-center text-center"
            >
              <p className="text-[11px] uppercase tracking-[0.14em] text-text-2">完成了</p>
              <h2 className="mt-4 text-[24px] font-medium leading-snug text-text-1">{task.title}</h2>
              <p className="mt-2 text-[13px] text-text-2">
                专注 {formatClock(seconds)} · 本次 +{coin} coin
              </p>
              {run?.prospect && (
                <p
                  className="mt-6 max-w-[420px] rounded-md px-4 py-3 text-[12.5px] leading-relaxed text-text-2"
                  style={{ background: 'var(--surface-1)' }}
                >
                  你开始时写的是：{run.prospect}
                </p>
              )}
              <button
                type="button"
                autoFocus
                onClick={startQuestions}
                disabled={busy}
                className="mt-10 flex h-10 items-center gap-2 rounded-full px-6 text-[13px] font-medium disabled:opacity-50"
                style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
              >
                {busy ? '保存中…' : total === 0 ? '完成' : '花一分钟，把这一轮想清楚'}
                <ArrowRight size={13} strokeWidth={2} />
              </button>
              <button
                type="button"
                onClick={() => void settle(false, true)}
                className="mt-3 text-[12px] text-text-2 transition-colors duration-fast hover:text-text-1"
              >
                跳过，直接回去（照常结算）
              </button>
            </motion.div>
          )}

          {current !== undefined && !doneView && (
            <motion.div
              key={`q${step}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: EASE }}
            >
              {questions.slice(0, step - 1).map((q, i) =>
                answers[i] ? (
                  <p key={q} className="mb-3 text-[12px] leading-relaxed text-text-dim">
                    {answers[i]}
                  </p>
                ) : null,
              )}
              <p className="text-[18px] font-medium leading-snug text-text-1">{current}</p>
              <textarea
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={4}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    submitAnswer()
                  }
                }}
                className="mt-5 w-full resize-none rounded-md px-4 py-3 text-[13.5px] leading-relaxed text-text-1"
                style={{ background: 'var(--surface-1)' }}
              />
              <div className="mt-5 flex items-center justify-between">
                <span className="text-[11px] text-text-dim">
                  第 {step} / {total} 问 · Enter 继续，Shift+Enter 换行
                </span>
                <button
                  type="button"
                  onClick={submitAnswer}
                  disabled={busy}
                  className="h-9 rounded-full px-5 text-[13px] font-medium disabled:opacity-50"
                  style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
                >
                  {step >= total ? (busy ? '保存中…' : '收尾') : '下一问'}
                </button>
              </div>
            </motion.div>
          )}

          {doneView && result && (
            <motion.div
              key="done"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.34, ease: EASE }}
              className="flex flex-col items-center text-center"
            >
              <div
                className="flex h-12 w-12 items-center justify-center rounded-full"
                style={{ background: 'var(--surface-2)' }}
              >
                <Check size={20} strokeWidth={1.8} />
              </div>
              <p className="mt-5 text-[18px] font-medium text-text-1">
                这一轮，{formatClock(result.seconds)}
              </p>
              <p className="mt-2 text-[13px] text-text-2">
                +{result.coin} coin · 任务升到 LV.{result.level}
              </p>
              <p className="mt-8 max-w-[380px] text-[12.5px] leading-relaxed text-text-2">
                站起来，离开屏幕五分钟。倒杯水，或者只是看看窗外。
                <br />
                休息不是奖励，是下一轮的准备工作。
              </p>
              <button
                type="button"
                autoFocus
                onClick={() => {
                  setFinish(null)
                  setView('home')
                }}
                className="mt-8 h-10 rounded-full px-6 text-[13px] font-medium"
                style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
              >
                回到任务池
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
