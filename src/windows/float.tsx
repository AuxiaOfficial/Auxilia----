import { createRoot } from 'react-dom/client'
import { useEffect } from 'react'
import { Pause, Play } from 'lucide-react'
import '@/styles/app.css'
import { call } from '@/lib/ipc'
import { formatClock, liveActiveSeconds } from '@/lib/time'
import { useRunStore } from '@/store/runStore'
import { useNow } from '@/hooks/useNow'

/** 可拖动浮窗：220×64，进度环 + 暂停/结束 */
function FloatCard(): React.ReactElement {
  const runs = useRunStore((s) => s.runs)
  const init = useRunStore((s) => s.init)
  const pause = useRunStore((s) => s.pause)
  const resume = useRunStore((s) => s.resume)
  const now = useNow(1000)

  useEffect(() => {
    void init()
  }, [init])

  const run = runs[runs.length - 1] ?? null

  const dragWindow = async (e: React.MouseEvent): Promise<void> => {
    if (e.button !== 0) return
    if ((e.target as HTMLElement).closest('button')) return
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    await getCurrentWindow().startDragging()
  }

  const menu = (e: React.MouseEvent): void => {
    e.preventDefault()
    void call('ui_popup_menu', { label: 'float' })
  }

  if (!run) {
    return (
      <div
        onMouseDown={(e) => void dragWindow(e)}
        onContextMenu={menu}
        className="flex h-full w-full items-center justify-center rounded-lg text-[11px] text-text-2"
        style={{ background: 'rgba(12,12,12,0.85)', border: '1px solid rgba(255,255,255,0.10)' }}
      >
        没有在跑的任务
      </div>
    )
  }

  const paused = run.segmentStartedAt === null
  const seconds = liveActiveSeconds(run.closedSeconds, run.segmentStartedAt, now)
  const isCountdown = run.mode === 'countdown' && run.plannedSeconds > 0
  const shown = isCountdown ? Math.max(0, run.plannedSeconds - seconds) : seconds
  const ratio = isCountdown ? Math.min(1, seconds / run.plannedSeconds) : 0
  const r = 18
  const c = 2 * Math.PI * r

  return (
    <div
      onMouseDown={(e) => void dragWindow(e)}
      onContextMenu={menu}
      className="flex h-full w-full items-center gap-3 rounded-lg px-3"
      style={{ background: 'rgba(12,12,12,0.85)', border: '1px solid rgba(255,255,255,0.10)' }}
    >
      <svg width="44" height="44" viewBox="0 0 44 44" className="shrink-0">
        <circle cx="22" cy="22" r={r} fill="none" stroke="var(--surface-3)" strokeWidth="3" />
        <circle
          cx="22"
          cy="22"
          r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="3"
          strokeDasharray={`${ratio * c} ${c}`}
          transform="rotate(-90 22 22)"
          strokeLinecap="round"
        />
        <text x="22" y="25" textAnchor="middle" fontSize="10" fill="var(--text-1)">
          {Math.round(ratio * 100)}%
        </text>
      </svg>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] text-text-2">{run.taskTitle}</p>
        <p className="text-[15px] text-text-1" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {formatClock(shown)}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => void (paused ? resume(run.taskId) : pause(run.taskId))}
          className="flex h-7 w-7 items-center justify-center rounded-full text-text-2 hover:bg-surface-3"
          aria-label={paused ? '继续' : '暂停'}
        >
          {paused ? <Play size={12} /> : <Pause size={12} />}
        </button>
        <button
          type="button"
          onClick={() => void call('ui_show_main')}
          className="flex h-7 w-7 items-center justify-center rounded-full text-text-2 hover:bg-surface-3"
          aria-label="打开主界面"
        >
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
            <path d="M3 9 9 3M9 3H5M9 3v4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  )
}

const el = document.getElementById('root')
if (!el) throw new Error('缺少 #root')
createRoot(el).render(<FloatCard />)
