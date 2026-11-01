import { useEffect, useMemo, useState } from 'react'
import { achievementRepo, type UserBadgeWithMeta } from '@/lib/db'
import type { DecorationDef, WallItem } from '@/lib/types'
import BadgeIcon from '@/lib/badgeIcons'

/** 每张墙贴一个不同的图标，避免一排完全一样的小方块 */
const STICKER_ICON: Record<string, string> = {
  'sticker-star': 'star',
  'sticker-leaf': 'leaf',
  'sticker-moon': 'moon-star',
  'sticker-orbit': 'orbit',
  'sticker-atlas': 'map',
  'sticker-pencil': 'pencil',
}

const TIER: Record<string, { ring: string; text: string }> = {
  bronze: { ring: 'rgba(255,255,255,0.16)', text: '#b9b9b9' },
  silver: { ring: 'rgba(255,255,255,0.28)', text: '#e2e2e2' },
  gold: { ring: 'rgba(255,255,255,0.55)', text: '#ffffff' },
}

/** 底纹/边框全部用 CSS 生成，不再借用外部项目的图片 */
const BG: Record<string, string> = {
  'bg-grid':
    'linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px) 0 0 / 100% 22px, linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px) 0 0 / 22px 100%',
  'bg-paper': 'radial-gradient(120% 100% at 50% -10%, rgba(255,255,255,0.06), transparent 65%)',
  'bg-night': 'linear-gradient(180deg, rgba(255,255,255,0.07), transparent 55%)',
  'bg-aurora':
    'radial-gradient(80% 60% at 20% 0%, rgba(255,255,255,0.09), transparent 70%), radial-gradient(70% 60% at 90% 20%, rgba(255,255,255,0.05), transparent 70%)',
  'bg-galaxy':
    'radial-gradient(60% 50% at 70% 10%, rgba(255,255,255,0.10), transparent 70%), radial-gradient(50% 40% at 15% 80%, rgba(255,255,255,0.05), transparent 70%)',
}

const FRAME: Record<string, string> = {
  'frame-thin': '1px solid rgba(255,255,255,0.14)',
  'frame-arch': '1px solid rgba(255,255,255,0.22)',
  'frame-plaster': '6px double rgba(255,255,255,0.16)',
  'frame-obsidian': '1px solid rgba(255,255,255,0.32)',
}

export default function Wall({
  badges,
  owned,
  height = 240,
}: {
  badges: UserBadgeWithMeta[]
  owned: DecorationDef[]
  height?: number
}): React.ReactElement {
  const [items, setItems] = useState<WallItem[]>([])
  const [drag, setDrag] = useState<string | null>(null)

  useEffect(() => {
    void achievementRepo.wall().then(setItems)
  }, [])

  const earned = badges.filter((b) => b.earnedAt !== null)
  const placed = new Set(items.map((i) => i.refId))

  /** 同类装饰只挂最贵的那一件 */
  const pick = useMemo(() => {
    const best = (kind: DecorationDef['kind']): DecorationDef | null =>
      owned.filter((d) => d.kind === kind).sort((a, b) => b.price - a.price)[0] ?? null
    return {
      bg: best('bg'),
      frame: best('frame'),
      plaque: best('plaque'),
      shelf: best('shelf'),
      metal: best('badge_style'),
      stickers: owned.filter((d) => d.kind === 'sticker').sort((a, b) => b.price - a.price),
    }
  }, [owned])

  const bg = pick.bg ? BG[pick.bg.id] : undefined
  const frame = pick.frame ? FRAME[pick.frame.id] : undefined
  const metal = pick.metal?.id === 'badge-gold' ? 'gold' : pick.metal?.id === 'badge-silver' ? 'silver' : null

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
          height,
          background: bg
            ? `${bg}, radial-gradient(120% 90% at 50% 0%, rgba(255,255,255,0.035), rgba(0,0,0,0) 70%)`
            : 'radial-gradient(120% 90% at 50% 0%, rgba(255,255,255,0.035), rgba(0,0,0,0) 70%)',
          border: frame ?? '1px solid var(--border)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
        }}
      >
        {/* 层架：只在四角画角标，不做横贯整墙的分隔线 */}
        {pick.shelf && (
          <>
            {[
              { top: 8, left: 8, borderTop: '1px solid rgba(255,255,255,0.28)', borderLeft: '1px solid rgba(255,255,255,0.28)' },
              { top: 8, right: 8, borderTop: '1px solid rgba(255,255,255,0.28)', borderRight: '1px solid rgba(255,255,255,0.28)' },
              { bottom: 8, left: 8, borderBottom: '1px solid rgba(255,255,255,0.28)', borderLeft: '1px solid rgba(255,255,255,0.28)' },
              { bottom: 8, right: 8, borderBottom: '1px solid rgba(255,255,255,0.28)', borderRight: '1px solid rgba(255,255,255,0.28)' },
            ].map((s, i) => (
              <span key={i} className="pointer-events-none absolute h-4 w-4" style={s} />
            ))}
          </>
        )}

        {pick.plaque && (
          <div
            className="pointer-events-none absolute left-4 top-3 rounded-sm px-2.5 py-1 text-[10px] uppercase tracking-[0.16em]"
            style={{ background: 'rgba(10,10,10,0.72)', border: '1px solid var(--border-strong)', color: 'var(--text-2)' }}
          >
            收藏墙
          </div>
        )}

        {(items.length > 0 || pick.stickers.length > 0 || earned.length === 0) && null}

        {items.length === 0 && (
          <p className="absolute inset-0 flex items-center justify-center text-[12px] text-text-dim">
            {earned.length === 0 ? '完成第一个任务，第一枚徽章就会出现在这里' : '点下面的徽章，把它放上墙'}
          </p>
        )}

        {items.map((item) => {
          const badge = badges.find((b) => b.code === item.refId)
          const base = TIER[badge?.tier ?? 'bronze'] ?? TIER['bronze']!
          const tone = metal === 'gold' ? '#e8c866' : metal === 'silver' ? '#e6e6e6' : base.text
          return (
            <div
              key={item.id}
              onPointerDown={(e) => {
                e.currentTarget.releasePointerCapture(e.pointerId)
                setDrag(item.id)
              }}
              className="group absolute flex h-14 w-14 cursor-grab select-none items-center justify-center transition-transform duration-200 active:cursor-grabbing"
              style={{
                left: `${item.x * 100}%`,
                top: `${item.y * 100}%`,
                transform: `translate(-50%, -50%) scale(${drag === item.id ? 1.12 : 1})`,
              }}
              title={badge?.name ?? item.refId}
            >
              <span style={{ color: tone, filter: `drop-shadow(0 3px 12px ${base.ring})` }}>
                <BadgeIcon name={badge?.icon ?? 'award'} size={30} strokeWidth={1.3} />
              </span>
              <span className="pointer-events-none absolute -bottom-5 whitespace-nowrap text-[10px] text-text-dim opacity-0 transition-opacity duration-fast group-hover:opacity-100">
                {badge?.name ?? item.refId}
              </span>
            </div>
          )
        })}

        {/* 墙贴：用图标，不用外部素材 */}
        {pick.stickers.length > 0 && (
          <div className="pointer-events-none absolute bottom-4 left-4 flex items-end gap-2">
            {pick.stickers.slice(0, 6).map((s, i) => (
              <span
                key={s.id}
                className="flex h-9 w-9 items-center justify-center rounded-[3px]"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.10)',
                  color: '#d8d8d8',
                  transform: `rotate(${(i % 3) - 1}deg)`,
                }}
                title={s.name}
              >
                <BadgeIcon name={STICKER_ICON[s.id] ?? 'sparkles'} size={16} strokeWidth={1.3} />
              </span>
            ))}
          </div>
        )}
      </div>

      {earned.length > 0 && (
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
      )}
    </div>
  )
}
