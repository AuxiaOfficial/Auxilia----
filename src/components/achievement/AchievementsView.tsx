import { useEffect, useRef, useState } from 'react'
import { Coins, Sparkles } from 'lucide-react'
import { achievementRepo, deviceRepo, decorationRepo, statsRepo, walletRepo, type UserBadgeWithMeta } from '@/lib/db'
import type { AchievementSummary, DailyStat, DecorationDef, DeviceDef, TaskStat, Wallet } from '@/lib/types'
import { formatDuration } from '@/lib/time'
import Heatmap from './Heatmap'
import BarChart from './BarChart'
import DonutChart from './DonutChart'
import Wall from './Wall'
import ViewHeader from '@/components/ui/ViewHeader'
import BadgeIcon from '@/lib/badgeIcons'
import { useUiStore } from '@/store/uiStore'

/** 每页 10 个：2 列 × 5 排 */
const PER_PAGE = 10

type Tab = 'stats' | 'growth'

/** 数字攀升：从旧值滑到新值，缓出 */
function useCountUp(value: number, duration = 720): number {
  const [shown, setShown] = useState(value)
  const fromRef = useRef(value)

  useEffect(() => {
    const from = fromRef.current
    if (from === value) return
    const start = performance.now()
    let raf = 0
    const tick = (t: number): void => {
      const p = Math.min(1, (t - start) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      setShown(Math.round(from + (value - from) * eased))
      if (p < 1) raf = requestAnimationFrame(tick)
      else fromRef.current = value
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, duration])

  return shown
}

export default function AchievementsView(): React.ReactElement {
  const notify = useUiStore((s) => s.notify)
  const [tab, setTab] = useState<Tab>('stats')
  const [daily, setDaily] = useState<DailyStat[]>([])
  const [byTask, setByTask] = useState<TaskStat[]>([])
  const [summary, setSummary] = useState<AchievementSummary | null>(null)
  const [badges, setBadges] = useState<UserBadgeWithMeta[]>([])
  const [wallet, setWallet] = useState<Wallet>({ coin: 0, flowCoin: 0, era: 0 })
  const [devices, setDevices] = useState<DeviceDef[]>([])
  const [decorations, setDecorations] = useState<DecorationDef[]>([])
  const [page, setPage] = useState(0)
  const [shopPage, setShopPage] = useState(0)

  const load = async (): Promise<void> => {
    const [d, t, s, b, w, dev, deco] = await Promise.all([
      statsRepo.daily(200),
      statsRepo.byTask(30),
      statsRepo.summary(),
      achievementRepo.catalog(),
      walletRepo.get(),
      deviceRepo.catalog(),
      decorationRepo.catalog(),
    ])
    setDaily(d)
    setByTask(t)
    setSummary(s)
    setBadges(b)
    setWallet(w)
    setDevices(dev)
    setDecorations(deco)
  }

  useEffect(() => {
    void load()
  }, [])

  const claim = async (code: string): Promise<void> => {
    await achievementRepo.redeem(code)
    await load()
  }

  const buyDevice = async (kind: string): Promise<void> => {
    try {
      await deviceRepo.buy(kind)
      await load()
      notify('装置已就位')
    } catch (err) {
      notify(err instanceof Error ? err.message : '购买失败', 'danger')
    }
  }

  const buyDecoration = async (id: string): Promise<void> => {
    try {
      await decorationRepo.buy(id)
      await load()
      notify('装饰已入库')
    } catch (err) {
      notify(err instanceof Error ? err.message : '购买失败', 'danger')
    }
  }

  const sortedBadges = [...badges].sort((a, b) => {
    const ea = a.earnedAt ? 0 : 1
    const eb = b.earnedAt ? 0 : 1
    return ea - eb || a.rewardCoin - b.rewardCoin
  })
  const pageCount = Math.max(1, Math.ceil(sortedBadges.length / PER_PAGE))
  const safePage = Math.min(page, pageCount - 1)
  const pageBadges = sortedBadges.slice(safePage * PER_PAGE, safePage * PER_PAGE + PER_PAGE)

  // 商店分页：一页 8 件，避免一条长列表滚不到头
  const SHOP_PER_PAGE = 8
  const shopPageCount = Math.max(1, Math.ceil(decorations.length / SHOP_PER_PAGE))
  const safeShopPage = Math.min(shopPage, shopPageCount - 1)
  const pagedDecorations = decorations.slice(
    safeShopPage * SHOP_PER_PAGE,
    safeShopPage * SHOP_PER_PAGE + SHOP_PER_PAGE,
  )

  const coinShown = useCountUp(wallet.coin)
  const flowShown = useCountUp(wallet.flowCoin)

  return (
    <div className="h-full overflow-y-auto px-10 pb-16">
      <div className="mx-auto w-full max-w-[720px] pt-2">
        <ViewHeader />

        {/* 开屏大数字：两套币 */}
        <div className="mt-2 flex items-end justify-between">
          <div className="flex items-end gap-8">
            <div>
              <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-text-2">
                <Coins size={12} strokeWidth={1.8} />
                coin
              </p>
              <p className="mt-1 text-[40px] font-light leading-none text-text-1" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {coinShown}
              </p>
            </div>
            <div>
              <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-text-2">
                <Sparkles size={12} strokeWidth={1.8} />
                心流币
              </p>
              <p className="mt-1 text-[40px] font-light leading-none text-text-1" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {flowShown}
              </p>
            </div>
          </div>
          {wallet.era > 0 && <span className="text-[11px] text-text-dim">第 {wallet.era + 1} 纪元</span>}
        </div>

        {/* 装饰墙放最上面，和两套币连成一块 */}
        <div className="mt-6">
          <Wall badges={badges} owned={decorations} height={280} />
        </div>

        {/* 两个页面 */}
        <div className="mt-8 flex items-center gap-1">
          {(
            [
              ['stats', '数据统计'],
              ['growth', '持续成长'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className="h-8 rounded-full px-4 text-[12.5px] transition-colors duration-fast"
              style={{
                background: tab === key ? 'var(--surface-2)' : 'transparent',
                color: tab === key ? 'var(--text-1)' : 'var(--text-dim)',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'stats' && (
          <>
            <div className="mt-6 grid grid-cols-3 gap-6">
              <Stat label="累计专注" value={formatDuration(summary?.totalSeconds ?? 0)} />
              <Stat label="连续天数" value={`${summary?.streakDays ?? 0} 天`} />
              <Stat label="完成任务" value={`${summary?.completedRuns ?? 0} 次`} />
            </div>

            <Section title="近半年">
              <Heatmap data={daily} />
            </Section>

            <Section title="时间花在哪">
              <DonutChart data={byTask} />
            </Section>

            <Section title="近 14 天">
              <BarChart data={daily} />
            </Section>

            <Section title={`徽章 · ${badges.filter((b) => b.earnedAt).length}/${badges.length}`}>
              <div className="grid grid-cols-2 grid-rows-5 gap-x-6 gap-y-0.5">
                {badges.length === 0 && <p className="text-[12px] text-text-2">完成后会自动解锁。</p>}
                {pageBadges.map((b) => (
                  <div
                    key={b.code}
                    className="flex items-center gap-3 rounded-md px-2 py-2"
                    style={{ background: b.earnedAt ? 'var(--surface-1)' : 'transparent' }}
                  >
                    <div
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                      style={{
                        background: b.earnedAt ? 'var(--surface-2)' : 'transparent',
                        border: '1px solid var(--border)',
                        opacity: b.earnedAt ? 1 : 0.3,
                        color: b.earnedAt ? 'var(--text-1)' : 'var(--text-2)',
                      }}
                    >
                      <BadgeIcon name={b.icon} size={14} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px]" style={{ color: b.earnedAt ? 'var(--text-1)' : 'var(--text-2)' }}>
                        {b.name}
                      </p>
                      <p className="truncate text-[11px] text-text-dim" title={b.description}>
                        {b.description}
                      </p>
                    </div>
                    {b.earnedAt && !b.redeemed ? (
                      <button
                        type="button"
                        onClick={() => void claim(b.code)}
                        className="ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10.5px] text-text-1 transition-colors duration-fast hover:bg-surface-3"
                        style={{ background: 'var(--surface-2)' }}
                      >
                        领取 +{b.rewardCoin}
                      </button>
                    ) : (
                      <span className="ml-auto shrink-0 text-[10.5px] text-text-dim">+{b.rewardCoin}</span>
                    )}
                  </div>
                ))}
              </div>
              {pageCount > 1 && (
                <div className="mt-3 flex items-center justify-end gap-2 text-[11px] text-text-2">
                  <button
                    type="button"
                    disabled={safePage === 0}
                    onClick={() => setPage(safePage - 1)}
                    className="rounded-full px-2 py-1 transition-colors duration-fast hover:bg-surface-2 disabled:opacity-30"
                  >
                    上一页
                  </button>
                  <span className="text-text-dim">
                    {safePage + 1} / {pageCount}
                  </span>
                  <button
                    type="button"
                    disabled={safePage >= pageCount - 1}
                    onClick={() => setPage(safePage + 1)}
                    className="rounded-full px-2 py-1 transition-colors duration-fast hover:bg-surface-2 disabled:opacity-30"
                  >
                    下一页
                  </button>
                </div>
              )}
            </Section>
          </>
        )}

        {tab === 'growth' && (
          <>
            <Section title="装置 · 只在专注时产币">
              <div className="flex flex-col gap-1">
                {devices.map((d) => {
                  const locked = d.price < 0
                  const full = d.owned >= d.cap
                  return (
                    <div key={d.kind} className="flex items-center gap-4 rounded-md px-3 py-3" style={{ background: 'var(--surface-1)' }}>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] text-text-1">
                          {d.name}
                          <span className="ml-2 text-[11px] text-text-dim">
                            已拥有 {d.owned}/{d.cap}
                          </span>
                        </p>
                        <p className="mt-0.5 text-[11px] text-text-2">{d.hint}</p>
                      </div>
                      {locked ? (
                        <span className="text-[11px] text-text-dim">
                          累计专注 {Math.round(d.unlockSeconds / 3600)} 小时后解锁
                        </span>
                      ) : full ? (
                        <span className="text-[11px] text-text-dim">已满级</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void buyDevice(d.kind)}
                          className="h-8 shrink-0 rounded-full px-4 text-[11.5px] font-medium"
                          style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
                        >
                          买一件 {d.price} coin
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-text-dim">
                装置不会离线产币，也不会在暂停时产币 —— 它只放大你真正专注的那段时间。
              </p>
            </Section>

            <Section title={`商店 · 用心流币（${safeShopPage + 1}/${shopPageCount}）`}>
              <div className="flex flex-col">
                {pagedDecorations.map((d) => (
                  <div key={d.id} className="flex items-center gap-3 rounded-md px-2 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] text-text-1">{d.name}</p>
                      <p className="text-[10.5px] text-text-dim">{KIND_LABEL[d.kind]}</p>
                    </div>
                    {d.owned ? (
                      <span className="text-[11px] text-text-dim">已拥有</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void buyDecoration(d.id)}
                        className="h-7 shrink-0 rounded-full px-3 text-[11px] text-text-1 transition-colors duration-fast hover:bg-surface-3"
                        style={{ background: 'var(--surface-2)' }}
                      >
                        {d.price} 心流币
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {shopPageCount > 1 && (
                <div className="mt-3 flex items-center justify-end gap-2 text-[11px] text-text-2">
                  <button
                    type="button"
                    disabled={shopPage === 0}
                    onClick={() => setShopPage(shopPage - 1)}
                    className="rounded-full px-2 py-1 transition-colors duration-fast hover:bg-surface-2 disabled:opacity-30"
                  >
                    上一页
                  </button>
                  <span className="text-text-dim">
                    {shopPage + 1} / {shopPageCount}
                  </span>
                  <button
                    type="button"
                    disabled={shopPage >= shopPageCount - 1}
                    onClick={() => setShopPage(shopPage + 1)}
                    className="rounded-full px-2 py-1 transition-colors duration-fast hover:bg-surface-2 disabled:opacity-30"
                  >
                    下一页
                  </button>
                </div>
              )}
            </Section>
          </>
        )}
      </div>
    </div>
  )
}

const KIND_LABEL: Record<DecorationDef['kind'], string> = {
  sticker: '墙贴',
  bg: '墙面底纹',
  frame: '墙面边框',
  shelf: '陈列架',
  plaque: '铭牌',
  badge_style: '徽章质感',
}

function Stat({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.14em] text-text-2">{label}</p>
      <p className="mt-1.5 text-[18px] text-text-1">{value}</p>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }): React.ReactElement {
  return (
    <section className="mt-10">
      <p className="mb-4 text-[11px] uppercase tracking-[0.14em] text-text-2">{title}</p>
      {children}
    </section>
  )
}
