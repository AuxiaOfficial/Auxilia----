import { useEffect, useRef, useState } from 'react'
import { WHEEL } from '@/lib/physics'

interface Props {
  value: number
  max: number
  format: (n: number) => string
  onChange: (n: number) => void
  jumpTo?: number | null
}

/**
 * 单列滚轮 —— 步进电机手感：
 * 每滚一格 → 目标 = 当前 ± 1 格，用一个「前段慢、末段最快」的位移曲线走过去，
 * 到点立刻停住。没有弹簧、没有回弹、没有过冲。
 */
export default function WheelColumn({ value, max, format, onChange, jumpTo = null }: Props): React.ReactElement {
  const offsetRef = useRef(value * WHEEL.ITEM_H)
  const [offset, setOffset] = useState(offsetRef.current)
  const raf = useRef<number | null>(null)
  const anim = useRef<{ from: number; to: number; start: number; dur: number } | null>(null)
  const report = useRef(onChange)
  report.current = onChange
  const drag = useRef<{ y: number; offset: number } | null>(null)
  const boxRef = useRef<HTMLDivElement | null>(null)
  const maxRef = useRef(max)
  maxRef.current = max

  const clampOffset = (v: number): number => Math.min(maxRef.current * WHEEL.ITEM_H, Math.max(0, v))

  const frame = (): void => {
    const a = anim.current
    if (!a) {
      raf.current = null
      return
    }
    const t = Math.min(1, (performance.now() - a.start) / a.dur)
    // 二次加速：起步轻、末段快，到 1 直接停 —— 步进电机的手感
    const p = t * t
    offsetRef.current = a.from + (a.to - a.from) * p
    setOffset(offsetRef.current)
    if (t >= 1) {
      offsetRef.current = a.to
      setOffset(a.to)
      anim.current = null
      raf.current = null
      report.current(Math.round(a.to / WHEEL.ITEM_H))
      return
    }
    raf.current = requestAnimationFrame(frame)
  }

  const animateTo = (target: number): void => {
    const to = clampOffset(target)
    const distance = Math.abs(to - offsetRef.current)
    if (distance < 0.5) return
    anim.current = {
      from: offsetRef.current,
      to,
      start: performance.now(),
      // 距离越远走得越久，但上限 190ms，避免"甩一下等半天"
      dur: Math.min(190, 70 + distance * 0.5),
    }
    if (raf.current === null) raf.current = requestAnimationFrame(frame)
  }

  useEffect(() => {
    return () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current)
      raf.current = null
    }
  }, [])

  useEffect(() => {
    if (jumpTo === null) return
    animateTo(Math.min(max, Math.max(0, jumpTo)) * WHEEL.ITEM_H)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpTo, max])

  // React 的 wheel 是被动监听，preventDefault 无效 → 自己挂非被动监听
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      if (e.deltaY === 0) return
      const dir = e.deltaY > 0 ? 1 : -1
      const steps = Math.min(WHEEL.MAX_STEPS, Math.max(1, Math.round(Math.abs(e.deltaY) / 100)))
      const base = Math.round((anim.current?.to ?? offsetRef.current) / WHEEL.ITEM_H)
      const next = Math.min(maxRef.current, Math.max(0, base + dir * steps))
      animateTo(next * WHEEL.ITEM_H)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onPointerDown = (e: React.PointerEvent): void => {
    drag.current = { y: e.clientY, offset: offsetRef.current }
    anim.current = null
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent): void => {
    const d = drag.current
    if (!d) return
    offsetRef.current = clampOffset(d.offset - (e.clientY - d.y))
    setOffset(offsetRef.current)
  }

  const onPointerUp = (): void => {
    if (!drag.current) return
    drag.current = null
    const snapped = Math.round(offsetRef.current / WHEEL.ITEM_H) * WHEEL.ITEM_H
    animateTo(snapped)
  }

  const rows: number[] = []
  for (let i = 0; i <= max; i += 1) rows.push(i)
  const visible = WHEEL.ITEM_H * 2
  const current = Math.round(offset / WHEEL.ITEM_H)

  return (
    <div
      ref={boxRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className="relative w-[104px] cursor-grab touch-none overflow-hidden active:cursor-grabbing"
      style={{
        height: 'var(--wheel-h, 220px)',
        maskImage: 'linear-gradient(transparent, #000 26%, #000 74%, transparent)',
        WebkitMaskImage: 'linear-gradient(transparent, #000 26%, #000 74%, transparent)',
      }}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-1/2 z-10 h-[44px] -translate-y-1/2 rounded-md"
        style={{ background: 'rgba(255,255,255,0.06)' }}
      />
      {rows.map((i) => {
        const distance = i * WHEEL.ITEM_H - offset
        if (Math.abs(distance) > visible + WHEEL.ITEM_H) return null
        const d = Math.abs(distance)
        const scale = 1 - Math.min(d / (WHEEL.ITEM_H * 3), 1) * 0.18
        const opacity = 1 - Math.min(d / (WHEEL.ITEM_H * 3.2), 1) * 0.75
        return (
          <div
            key={i}
            className="absolute inset-x-0 flex items-center justify-center text-[15px] text-text-1"
            style={{
              height: WHEEL.ITEM_H,
              top: '50%',
              transform: `translateY(calc(-50% + ${distance}px)) scale(${scale})`,
              opacity: i === current ? 1 : opacity,
              transformOrigin: 'center',
              fontWeight: i === current ? 500 : 400,
            }}
          >
            {format(i)}
          </div>
        )
      })}
    </div>
  )
}
