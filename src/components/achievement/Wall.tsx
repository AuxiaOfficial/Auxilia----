import { useEffect, useState } from 'react'
import { achievementRepo, type UserBadgeWithMeta } from '@/lib/db'
import type { WallItem } from '@/lib/types'
import BadgeIcon from '@/lib/badgeIcons'

const TIER: Record<string, { ring: string; face: string; text: string }> = {
  // 只有黑白灰：靠明度差区分等级，而不是靠颜色
  bronze: { ring: 'rgba(255,255,255,0.16)', face: 'radial-gradient(circle at 30% 25%, #3a3a3a, #161616)', text: '#b9b9b9' },
  silver: { ring: 'rgba(255,255,255,0.28)', face: 'radial-gradient(circle at 30% 25%, #4a4a4a, #1b1b1b)', text: '#e2e2e2' },
  gold: { ring: 'rgba(255,255,255,0.55)', face: 'radial-gradient(circle at 30% 25%, #6a6a6a, #232323)', text: '#ffffff' },
}

/** 装饰墙：把徽章拖到墙上，位置存在 wall_items 表 */
export default function Wall({ badges }: { badges: UserBadgeWithMeta[] }): React.ReactElement {
  const [items, setItems] = useState<WallItem[]>([])
  const [drag, setDrag] = useState<string | null>(null)

  useEffect(() => {
    void achievementRepo.wall().then(setItems)
  }, [])

  const earned = badges.filter((b) => b.earnedAt !== null)
  const placed = new Set(items.map((i) => i.refId))

  const place = async (code: string): Promise<void> => {
    if (items.length >= 24) return
    const item = await achievementRepo.place({
      kind: 'badge',
      refId: code,
      x: 0.12 + Math.random() * 0.72,
      y: 0.2 + Math.random() * 0.55,
      scale: 1,
      z: items.length,
    })
    setItems((prev) => [...prev, item])
  }

  const onMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (!drag) return
    const box = e.currentTarget.getBoundingClientRect()
    const x = Math.min(0.96, Math.max(0.02, (e.clientX - box.left) / box.width))
    const y = Math.min(0.94, Math.max(0.04, (e.clientY - box.top) / box.height))
    setItems((prev) => prev.map((i) => (i.id === drag ? { ...i, x, y } : i)))
  }

  return (
    <div>
      <div
        onPointerMove={onMove}
        onPointerUp={() => {
          const item = items.find((i) => i.id === drag)
          if (item) void achievementRepo.move(item.id, item.x, item.y)
          setDrag(null)
        }}
        className="relative w-full overflow-hidden rounded-lg"
        style={{
          height: 260,
          background:
            'radial-gradient(120% 90% at 50% 0%, rgba(255,255,255,0.045), rgba(255,255,255,0.012) 55%, rgba(0,0,0,0) 100%)',
          border: '1px solid var(--border)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
        }}
      >
        {/* 极淡的水平层线，像陈列架 */}
        {[0.36, 0.68].map((p) => (
          <span
            key={p}
            className="pointer-events-none absolute inset-x-0 h-px"
            style={{ top: `${p * 100}%`, background: 'rgba(255,255,255,0.045)' }}
          />
        ))}

        {items.length === 0 && (
          <p className="absolute inset-0 flex items-center justify-center text-[12px] text-text-dim">
            点下面的徽章，把它放上墙
          </p>
        )}

        {items.map((item) => {
          const badge = badges.find((b) => b.code === item.refId)
          const tier = TIER[badge?.tier ?? 'bronze'] ?? TIER['bronze']!
          return (
            <div
              key={item.id}
              onPointerDown={(e) => {
                e.currentTarget.releasePointerCapture(e.pointerId)
                setDrag(item.id)
              }}
              className="group absolute flex h-12 w-12 cursor-grab select-none items-center justify-center transition-transform duration-200 active:cursor-grabbing"
              style={{
                left: `${item.x * 100}%`,
                top: `${item.y * 100}%`,
                transform: `translate(-50%, -50%) scale(${drag === item.id ? 1.12 : 1})`,
              }}
              title={badge?.name ?? item.refId}
            >
              {/* 不要圆形底框，就让图标自己挂在墙上 */}
              <span
                style={{
                  color: tier.text,
                  filter: `drop-shadow(0 3px 10px ${tier.ring})`,
                }}
              >
                <BadgeIcon name={badge?.icon ?? 'award'} size={26} strokeWidth={1.4} />
              </span>
              <span
                className="pointer-events-none absolute -bottom-5 whitespace-nowrap text-[10px] text-text-dim opacity-0 transition-opacity duration-fast group-hover:opacity-100"
              >
                {badge?.name ?? item.refId}
              </span>
            </div>
          )
        })}
      </div>

      {earned.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {earned.map((b) => (
            <button
              key={b.code}
              type="button"
              disabled={placed.has(b.code)}
              onClick={() => void place(b.code)}
              className="h-7 rounded-full px-3 text-[11px] text-text-2 transition-colors duration-fast hover:bg-surface-3 disabled:opacity-25"
              style={{ background: 'var(--surface-2)' }}
            >
              {placed.has(b.code) ? '已陈列' : `+ ${b.name}`}
            </button>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-[11px] text-text-dim">完成第一个任务，就能拿到第一枚徽章。</p>
      )}
    </div>
  )
}
