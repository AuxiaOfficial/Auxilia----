import { createRoot } from 'react-dom/client'
import { useEffect } from 'react'
import '@/styles/app.css'
import { call } from '@/lib/ipc'
import { formatClock, liveActiveSeconds } from '@/lib/time'
import { useRunStore } from '@/store/runStore'
import { useNow } from '@/hooks/useNow'

/** 贴屏幕顶部的迷你浮条：96×26，只显示最重要的一个数字 */
function MiniBar(): React.ReactElement {
  const runs = useRunStore((s) => s.runs)
  const init = useRunStore((s) => s.init)
  const now = useNow(1000)

  useEffect(() => {
    void init()
  }, [init])

  const run = runs[runs.length - 1] ?? null
  const paused = run?.segmentStartedAt === null

  const text = (() => {
    if (!run) return 'Auxilia'
    const s = liveActiveSeconds(run.closedSeconds, run.segmentStartedAt, now)
    const shown = run.mode === 'countdown' && run.plannedSeconds > 0
      ? Math.max(0, run.plannedSeconds - s)
      : s
    return formatClock(shown)
  })()

  const dragWindow = async (e: React.MouseEvent): Promise<void> => {
    if (e.button !== 0) return
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    await getCurrentWindow().startDragging()
  }

  return (
    <div
      onMouseDown={(e) => void dragWindow(e)}
      onClick={() => void call('ui_show_main')}
      onContextMenu={(e) => {
        e.preventDefault()
        void call('ui_popup_menu', { label: 'mini' })
      }}
      className="flex h-full w-full cursor-default items-center gap-1.5 rounded-full px-2.5"
      style={{
        background: 'rgba(12,12,12,0.82)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.10)',
      }}
    >
      <span
        className={`h-[5px] w-[5px] shrink-0 rounded-full ${paused ? '' : 'animate-pulse'}`}
        style={{ background: paused ? 'var(--text-2)' : 'var(--accent)' }}
      />
      <span className="text-[11px] text-text-1" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {text}
      </span>
      <span className="min-w-0 flex-1 truncate text-left text-[10px] text-text-2">
        {run?.taskTitle ?? ''}
      </span>
    </div>
  )
}

const el = document.getElementById('root')
if (!el) throw new Error('缺少 #root')
createRoot(el).render(<MiniBar />)
