import type { DailyStat } from '@/lib/types'

/** 近 N 天柱形图：纯 SVG，无动画库 */
export default function BarChart({
  data,
  days = 14,
}: {
  data: DailyStat[]
  days?: number
}): React.ReactElement {
  const map = new Map(data.map((d) => [d.date, d.seconds]))
  const today = new Date()
  const series: { date: string; seconds: number; label: string }[] = []
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    series.push({ date: key, seconds: map.get(key) ?? 0, label: `${d.getMonth() + 1}/${d.getDate()}` })
  }
  const max = Math.max(1, ...series.map((s) => s.seconds))
  const w = 100
  const h = 60
  const barW = w / days - 2

  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h + 12}`} preserveAspectRatio="none" role="img" aria-label="每日专注柱形图">
      {series.map((s, i) => {
        const bh = (s.seconds / max) * (h - 4)
        return (
          <g key={s.date}>
            <rect
              x={i * (barW + 2)}
              y={h - bh}
              width={barW}
              height={Math.max(bh, 1)}
              rx={1}
              fill={s.seconds === 0 ? 'var(--heat-0)' : 'var(--heat-3)'}
            >
              <title>{`${s.label} · ${Math.round(s.seconds / 60)} 分钟`}</title>
            </rect>
            {(i === 0 || i === days - 1 || i === Math.floor(days / 2)) && (
              <text x={i * (barW + 2)} y={h + 9} fontSize={4} fill="var(--text-3)">
                {s.label}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}
