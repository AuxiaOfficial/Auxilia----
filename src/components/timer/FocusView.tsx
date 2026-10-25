import { useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { ArrowLeft, Pause, Play, Square } from 'lucide-react'
import { formatClock, formatTime, liveActiveSeconds } from '@/lib/time'
import { useRunStore } from '@/store/runStore'
import { useUiStore } from '@/store/uiStore'
import { useNow } from '@/hooks/useNow'

const EASE = [0.32, 0.72, 0, 1] as const

export default function FocusView(): React.ReactElement {
  const runs = useRunStore((s) => s.runs)
  const pause = useRunStore((s) => s.pause)
  const resume = useRunStore((s) => s.resume)
  const abort = useRunStore((s) => s.abort)
  const setFinish = useUiStore((s) => s.setFinish)
  const notify = useUiStore((s) => s.notify)
  const setView = useUiStore((s) => s.setView)
  const now = useNow(1000)
  const [pinned, setPinned] = useState<string | null>(null)

  const active = useMemo(() => {
    if (runs.length === 0) return null
    return runs.find((r) => r.taskId === pinned) ?? runs[runs.length - 1] ?? null
  }, [runs, pinned])

  if (!active) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-text-3">
        <p className="text-[15px]">现在没有在跑的任务</p>
        <button
          type="button"
          onClick={() => setView('home')}
          className="text-[13px] text-text-2 transition-colors duration-fast hover:text-text-1"
        >
          回到任务池
        </button>
      </div>
    )
  }

  const seconds = liveActiveSeconds(active.closedSeconds, active.segmentStartedAt, now)
  const paused = active.segmentStartedAt === null
  const isCountdown = active.mode === 'countdown' && active.plannedSeconds > 0
  const display = isCountdown ? Math.max(0, active.plannedSeconds - seconds) : seconds
  const ratio = isCountdown ? Math.min(1, seconds / active.plannedSeconds) : 0
  const urgent = isCountdown && display <= 60

  return (
    <div className="relative flex h-full flex-col items-center justify-center px-10">
      <button
        type="button"
        onClick={() => setView('home')}
        className="absolute left-6 top-2 flex items-center gap-1.5 text-[12px] text-text-2 transition-colors duration-fast hover:text-text-1"
      >
        <ArrowLeft size={13} strokeWidth={1.8} />
        返回
        <span className="text-[10px] text-text-dim">Esc</span>
      </button>
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.38, ease: EASE }}
        className="flex w-full max-w-[560px] flex-col items-center"
      >
        <div className="flex items-center gap-2 text-[12px] text-text-3">
          <span className="uppercase tracking-[0.14em]">
            {active.mode === 'countdown' ? '倒计时' : active.mode === 'countup' ? '正计时' : '定时'}
          </span>
          {paused && <span className="text-text-2">· 已暂停</span>}
          {runs.length > 1 && <span>· 同时 {runs.length} 个</span>}
        </div>

        <div
          className="mt-4 select-none font-light tracking-tight"
          style={{
            fontSize: 'var(--timer-size)',
            lineHeight: 1.05,
            color: urgent ? 'var(--warn)' : 'var(--text-1)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {formatClock(display)}
        </div>

        {isCountdown && (
          <div className="mt-6 h-[2px] w-full overflow-hidden rounded-full" style={{ background: 'var(--surface-3)' }}>
            <motion.div
              animate={{ width: `${ratio * 100}%` }}
              transition={{ duration: 0.6, ease: 'linear' }}
              style={{ height: '100%', background: urgent ? 'var(--warn)' : 'var(--accent)' }}
            />
          </div>
        )}

        <h2 className="mt-8 text-center text-[18px] font-medium text-text-1">{active.taskTitle}</h2>
        {active.prospect && (
          <p className="mt-2 max-w-[420px] text-center text-[13px] leading-relaxed text-text-3">
            {active.prospect}
          </p>
        )}

        <div className="mt-10 flex items-center gap-3">
          <button
            type="button"
            onClick={() => void (paused ? resume(active.taskId) : pause(active.taskId))}
            className="flex h-10 items-center gap-2 rounded-full px-5 text-[13px] text-text-1 transition-colors duration-fast hover:bg-surface-2"
            style={{ background: 'var(--surface-1)' }}
          >
            {paused ? <Play size={13} strokeWidth={1.8} /> : <Pause size={13} strokeWidth={1.8} />}
            {paused ? '继续' : '暂停'}
          </button>
          <button
            type="button"
            onClick={() => {
              if (!paused) void pause(active.taskId)
              setFinish(active.taskId)
            }}
            className="flex h-10 items-center gap-2 rounded-full px-5 text-[13px]"
            style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
          >
            <Square size={11} strokeWidth={2.4} />
            结束并复盘
          </button>
          <button
            type="button"
            onClick={() => {
              void abort(active.taskId).then(() => notify('已放弃本次任务，不计分'))
            }}
            className="text-[12px] text-text-3 transition-colors duration-fast hover:text-danger"
          >
            放弃
          </button>
        </div>

        <p className="mt-6 text-[11px] text-text-3">开始于 {formatTime(active.startedAt)}</p>

        {runs.length > 1 && (
          <div className="mt-10 w-full">
            <p className="mb-2 text-[11px] uppercase tracking-[0.14em] text-text-3">其他在跑</p>
            <div className="flex flex-col gap-1">
              {runs
                .filter((r) => r.taskId !== active.taskId)
                .map((r) => {
                  const s = liveActiveSeconds(r.closedSeconds, r.segmentStartedAt, now)
                  const left =
                    r.mode === 'countdown' && r.plannedSeconds > 0
                      ? Math.max(0, r.plannedSeconds - s)
                      : s
                  return (
                    <button
                      key={r.runId}
                      type="button"
                      onClick={() => setPinned(r.taskId)}
                      className="flex h-10 items-center justify-between rounded-md px-3 text-left transition-colors duration-fast hover:bg-surface-2"
                    >
                      <span className="truncate text-[13px] text-text-2">{r.taskTitle}</span>
                      <span className="text-[12px] text-text-3">{formatClock(left)}</span>
                    </button>
                  )
                })}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  )
}
