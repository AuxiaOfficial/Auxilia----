import { useMemo } from 'react'
import type { DailyStat } from '@/lib/types'
import { addDays, dayKey, startOfDay } from '@/lib/time'

const CELL = 10
const GAP = 3
const WEEKS = 26
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

/** 手写 SVG 热力图：26 周 × 7 天，只用 accent 的透明度阶梯 */
export default function Heatmap({ data }: { data: DailyStat[] }): React.ReactElement {
  const { cells, months } = useMemo(() => {
    const map = new Map(data.map((d) => [d.date, d.seconds]))
    const today = startOfDay()
    const dayOfWeek = new Date(today).getDay()
    const start = addDays(today, -(dayOfWeek + (WEEKS - 1) * 7))
    const max = Math.max(1, ...data.map((d) => d.seconds))

    const list: { x: number; y: number; date: string; level: number }[] = []
    const monthMarks: { x: number; label: string }[] = []
    let lastMonth = -1

    for (let i = 0; i < WEEKS * 7; i += 1) {
      const ts = addDays(start, i)
      if (ts > today) break
      const key = dayKey(ts)
      const seconds = map.get(key) ?? 0
      const ratio = seconds / max
      const level = seconds === 0 ? 0 : ratio > 0.75 ? 4 : ratio > 0.45 ? 3 : ratio > 0.2 ? 2 : 1
      const week = Math.floor(i / 7)
      const day = i % 7
      list.push({ x: week * (CELL + GAP), y: day * (CELL + GAP), date: key, level })

      const m = new Date(ts).getMonth()
      if (day === 0 && m !== lastMonth) {
        lastMonth = m
        monthMarks.push({ x: week * (CELL + GAP), label: `${m + 1}月` })
      }
    }
    return { cells: list, months: monthMarks }
  }, [data])

  const width = WEEKS * (CELL + GAP)
  const height = 7 * (CELL + GAP)

  return (
    <svg width="100%" viewBox={`0 -14 ${width} ${height + 14}`} role="img" aria-label="专注热力图">
      {months.map((m) => (
        <text key={`${m.x}-${m.label}`} x={m.x} y={-4} fontSize={9} fill="var(--text-3)">
          {m.label}
        </text>
      ))}
      {cells.map((c) => (
        <rect
          key={c.date}
          x={c.x}
          y={c.y}
          width={CELL}
          height={CELL}
          rx={2}
          fill={`var(--heat-${c.level})`}
        >
          <title>{`${c.date}${c.level === 0 ? ' · 无记录' : ''}`}</title>
        </rect>
      ))}
      <g transform={`translate(${width + 6}, ${height - 8})`}>
        {[0, 1, 2, 3, 4].map((l) => (
          <rect
            key={l}
            x={l * (CELL + 2)}
            y={0}
            width={CELL - 2}
            height={CELL - 2}
            rx={2}
            fill={`var(--heat-${l})`}
          />
        ))}
      </g>
    </svg>
  )
}

export function weekdayLabels(): string[] {
  return WEEKDAYS
}
