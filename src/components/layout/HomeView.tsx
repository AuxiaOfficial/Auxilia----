import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { Award, ListTree, PenLine, Timer } from 'lucide-react'
import { useUiStore } from '@/store/uiStore'
import { useTimelineStore } from '@/store/timelineStore'
import { useReviewStore } from '@/store/reviewStore'
import type { View } from '@/lib/types'

const EASE = [0.32, 0.72, 0, 1] as const

const SLOGANS = [
  '把今天，排成你想要的样子。',
  '不必遵守日程，只需看清时间。',
  '让心流常驻。',
  '我们应该探索什么？',
  '先做完一件，再想第二件。',
  '时间是唯一补不回来的账。',
]

/** 打字机：逐字出现 → 停留 → 退格 → 下一句 */
function useTypewriter(lines: string[], hold = 5200, typeSpeed = 78): string {
  const [index, setIndex] = useState(0)
  const [text, setText] = useState('')
  const [phase, setPhase] = useState<'typing' | 'holding' | 'deleting'>('typing')

  useEffect(() => {
    const full = lines[index] ?? ''
    if (phase === 'typing') {
      if (text.length < full.length) {
        const t = setTimeout(() => setText(full.slice(0, text.length + 1)), typeSpeed)
        return () => clearTimeout(t)
      }
      const t = setTimeout(() => setPhase('holding'), hold)
      return () => clearTimeout(t)
    }
    if (phase === 'holding') {
      const t = setTimeout(() => setPhase('deleting'), 400)
      return () => clearTimeout(t)
    }
    if (text.length > 0) {
      const t = setTimeout(() => setText(full.slice(0, text.length - 1)), 26)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => {
      setIndex((i) => (i + 1) % lines.length)
      setPhase('typing')
    }, 260)
    return () => clearTimeout(t)
  }, [text, phase, index, lines, hold, typeSpeed])

  return text
}

export default function HomeView(): React.ReactElement {
  const openCreation = useUiStore((s) => s.openCreation)
  const setView = useUiStore((s) => s.setView)
  const createLine = useTimelineStore((s) => s.createLine)
  const due = useReviewStore((s) => s.due)
  const notify = useUiStore((s) => s.notify)
  const slogan = useTypewriter(SLOGANS)

  const go = (v: View): void => setView(v)

  return (
    <div className="flex h-full justify-center px-8">
      <div className="w-full max-w-[720px]" style={{ paddingTop: '18vh' }}>
        <motion.h1
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.38, ease: EASE }}
          className="whitespace-nowrap text-[clamp(22px,2.55vw,32px)] font-medium leading-[1.3] tracking-tight text-text-1"
        >
          {slogan}
          <span
            className="ml-[2px] inline-block align-baseline"
            style={{
              width: '2px',
              height: '0.92em',
              background: 'var(--text-1)',
              animation: 'aux-caret 1.05s step-end infinite',
              transform: 'translateY(2px)',
            }}
          />
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.38, ease: EASE, delay: 0.06 }}
          className="mt-3 text-[13px] text-text-2"
        >
          它不替你安排，只帮你看清。
        </motion.p>

        <div className="mt-10 flex flex-col gap-1" data-nav-container>
          <Entry
            icon={<Timer size={16} strokeWidth={1.5} />}
            label="新建任务"
            hint="⌘N"
            onClick={openCreation}
            delay={0.08}
          />
          <Entry
            icon={<ListTree size={16} strokeWidth={1.5} />}
            label="新建 TaskLine"
            hint="⌘T"
            delay={0.11}
            onClick={() => {
              void createLine().then(() => notify('已新建 TaskLine'))
            }}
          />
          <Entry
            icon={<Award size={16} strokeWidth={1.5} />}
            label="我的成就"
            hint=""
            delay={0.14}
            onClick={() => go('achievements')}
          />
          <Entry
            icon={<PenLine size={16} strokeWidth={1.5} />}
            label="任务复盘"
            hint=""
            delay={0.17}
            dot={due !== null}
            onClick={() => go('review')}
          />
        </div>
      </div>

      <style>{`
        @keyframes aux-caret { 0%, 49% { opacity: 1 } 50%, 100% { opacity: 0 } }
      `}</style>
    </div>
  )
}

function Entry({
  icon,
  label,
  hint,
  onClick,
  delay,
  dot = false,
}: {
  icon: React.ReactNode
  label: string
  hint: string
  onClick: () => void
  delay: number
  dot?: boolean
}): React.ReactElement {
  return (
    <motion.button
      type="button"
      data-nav-item
      onClick={onClick}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, ease: EASE, delay }}
      className="group flex h-14 items-center gap-5 rounded-md px-5 text-left transition-colors duration-fast hover:bg-surface-2"
    >
      <span className="text-text-2 transition-colors duration-fast group-hover:text-text-1">
        {icon}
      </span>
      <span className="flex-1 text-[15px] text-text-1">{label}</span>
      {dot && <span className="h-2 w-2 rounded-full" style={{ background: 'var(--danger)' }} />}
      <span className="text-[11px] text-text-dim transition-colors duration-fast group-hover:text-text-2">
        {hint}
      </span>
    </motion.button>
  )
}
