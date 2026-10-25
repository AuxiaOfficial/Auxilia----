import { useState } from 'react'
import WheelColumn from './WheelColumn'

const PRESETS: { label: string; seconds: number }[] = [
  { label: '15 分钟', seconds: 15 * 60 },
  { label: '25 分钟', seconds: 25 * 60 },
  { label: '45 分钟', seconds: 45 * 60 },
  { label: '1 小时', seconds: 3600 },
  { label: '90 分钟', seconds: 90 * 60 },
]

/**
 * 双轮（小时 + 分钟），每格 1 单位。
 * 快捷胶囊点一下直接弹到目标时长，不用慢慢滚。
 */
export default function DurationWheel({
  seconds,
  onChange,
}: {
  seconds: number
  onChange: (seconds: number) => void
}): React.ReactElement {
  const [total, setTotal] = useState(seconds)
  const [jumpH, setJumpH] = useState<number | null>(null)
  const [jumpM, setJumpM] = useState<number | null>(null)

  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)

  const setHours = (h: number): void => {
    const next = h * 3600 + minutes * 60
    setTotal(next)
    onChange(next)
  }
  const setMinutes = (m: number): void => {
    const next = hours * 3600 + m * 60
    setTotal(next)
    onChange(next)
  }

  const applyPreset = (value: number): void => {
    setTotal(value)
    onChange(value)
    setJumpH(Math.floor(value / 3600))
    setJumpM(Math.floor((value % 3600) / 60))
    // 允许连续点同一个胶囊也重新触发
    setTimeout(() => {
      setJumpH(null)
      setJumpM(null)
    }, 60)
  }

  return (
    <div className="flex flex-col items-center">
      <div className="flex items-start gap-1">
        <WheelColumn
          value={hours}
          max={12}
          format={(n) => `${n} 小时`}
          onChange={setHours}
          jumpTo={jumpH}
        />
        <div className="pt-[96px] text-[13px] text-text-3">:</div>
        <WheelColumn
          value={minutes}
          max={59}
          format={(n) => `${n} 分`}
          onChange={setMinutes}
          jumpTo={jumpM}
        />
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => applyPreset(p.seconds)}
            className="h-7 rounded-full px-3 text-[12px] text-text-2 transition-colors duration-fast hover:bg-surface-3 hover:text-text-1"
            style={{ background: 'var(--surface-2)' }}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  )
}
