import type { TaskStat } from '@/lib/types'
import { formatDuration } from '@/lib/time'

const SHADES = [
  'rgba(232,232,232,0.88)',
  'rgba(232,232,232,0.66)',
  'rgba(232,232,232,0.50)',
  'rgba(232,232,232,0.36)',
  'rgba(232,232,232,0.24)',
  'rgba(232,232,232,0.14)',
]

/** 环形图：占比最大的 6 个任务，其余合并为「其他」 */
export default function DonutChart({ data }: { data: TaskStat[] }): React.ReactElement {
  const top = data.slice(0, 6)
  const restSeconds = data.slice(6).reduce((s, d) => s + d.seconds, 0)
  const slices = restSeconds > 0 ? [...top, { taskId: 'rest', title: '其他', seconds: restSeconds }] : top
  const total = slices.reduce((s, d) => s + d.seconds, 0)

  if (total === 0) {
    return (
      <p className="py-8 text-center text-[12px] text-text-3">还没有专注记录，跑一个任务就有了。</p>
    )
  }

  const r = 38
  const c = 2 * Math.PI * r
  let offset = 0

  return (
    <div className="flex items-center gap-6">
      <svg width="104" height="104" viewBox="0 0 104 104" role="img" aria-label="任务时长占比">
        <circle cx="52" cy="52" r={r} fill="none" stroke="var(--heat-0)" strokeWidth="12" />
        {slices.map((s, i) => {
          const len = (s.seconds / total) * c
          const el = (
            <circle
              key={s.taskId}
              cx="52"
              cy="52"
              r={r}
              fill="none"
              stroke={SHADES[i] ?? SHADES[SHADES.length - 1]}
              strokeWidth="12"
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 52 52)"
              strokeLinecap="butt"
            />
          )
          offset += len
          return el
        })}
      </svg>
      <div className="min-w-0 flex-1">
        {slices.map((s, i) => (
          <div key={s.taskId} className="flex items-center gap-2 py-[3px]">
            <span
              className="h-[6px] w-[6px] shrink-0 rounded-full"
              style={{ background: SHADES[i] ?? SHADES[SHADES.length - 1] }}
            />
            <span className="min-w-0 flex-1 truncate text-[12px] text-text-2">{s.title}</span>
            <span className="shrink-0 text-[11px] text-text-3">{formatDuration(s.seconds)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
