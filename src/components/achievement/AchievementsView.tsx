import { useEffect, useState } from 'react'
import { achievementRepo, statsRepo, type UserBadgeWithMeta } from '@/lib/db'
import type { AchievementSummary, DailyStat, TaskStat } from '@/lib/types'
import { formatDuration } from '@/lib/time'
import Heatmap from './Heatmap'
import BarChart from './BarChart'
import DonutChart from './DonutChart'
import Wall from './Wall'
import ViewHeader from '@/components/ui/ViewHeader'
import BadgeIcon from '@/lib/badgeIcons'

/** 每页 10 个：2 列 × 5 排 */
const PER_PAGE = 10

export default function AchievementsView(): React.ReactElement {
  const [daily, setDaily] = useState<DailyStat[]>([])
  const [byTask, setByTask] = useState<TaskStat[]>([])
  const [summary, setSummary] = useState<AchievementSummary | null>(null)
  const [badges, setBadges] = useState<UserBadgeWithMeta[]>([])

  const load = async (): Promise<void> => {
    const [d, t, s, b] = await Promise.all([
      statsRepo.daily(200),
      statsRepo.byTask(30),
      statsRepo.summary(),
      achievementRepo.catalog(),
    ])
    setDaily(d)
    setByTask(t)
    setSummary(s)
    setBadges(b)
  }

  useEffect(() => {
    void load()
  }, [])

  const claim = async (code: string): Promise<void> => {
    await achievementRepo.redeem(code)
    await load()
  }

  // 两列五排一页 10 个：徽章多了也不会把界面撑长
  const [page, setPage] = useState(0)
  const sortedBadges = [...badges].sort((a, b) => {
    const ea = a.earnedAt ? 0 : 1
    const eb = b.earnedAt ? 0 : 1
    return ea - eb || a.rewardCoin - b.rewardCoin
  })
  const pageCount = Math.max(1, Math.ceil(sortedBadges.length / PER_PAGE))
  const safePage = Math.min(page, pageCount - 1)
  const pageBadges = sortedBadges.slice(safePage * PER_PAGE, safePage * PER_PAGE + PER_PAGE)

  return (
    <div className="h-full overflow-y-auto px-10 pb-16">
      <div className="mx-auto w-full max-w-[720px] pt-2">
        <ViewHeader />
        <div className="flex items-baseline justify-between">
          <h1 className="text-[24px] font-medium tracking-tight text-text-1">成就</h1>
          <span className="text-[12px] text-text-3">{summary?.coin ?? 0} coin</span>
        </div>

        <div className="mt-8 grid grid-cols-3 gap-6">
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
          <div className={PER_PAGE === 10 ? 'grid grid-cols-2 grid-rows-5 gap-x-6 gap-y-0.5' : 'grid grid-cols-2 gap-x-6 gap-y-0.5'}>
            {badges.length === 0 && <p className="text-[12px] text-text-2">完成后会自动解锁。</p>}
            {pageBadges.map((b) => (
              <div
                key={b.code}
                className="flex items-center gap-3 rounded-md px-2 py-2"
                style={{
                  background: b.earnedAt ? 'var(--surface-1)' : 'transparent',
                }}
              >
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                  style={{
                    background: b.earnedAt ? 'var(--surface-2)' : 'transparent',
                    border: b.earnedAt ? '1px solid var(--border)' : '1px solid var(--border)',
                    opacity: b.earnedAt ? 1 : 0.3,
                    color: b.earnedAt ? 'var(--text-1)' : 'var(--text-2)',
                  }}
                >
                  <BadgeIcon name={b.icon} size={14} />
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className="truncate text-[12.5px]"
                    style={{ color: b.earnedAt ? 'var(--text-1)' : 'var(--text-2)' }}
                  >
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
                  <span className="ml-auto shrink-0 text-[10.5px] text-text-3">+{b.rewardCoin}</span>
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

        <Section title="装饰墙">
          <Wall badges={badges} />
        </Section>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.14em] text-text-3">{label}</p>
      <p className="mt-1.5 text-[18px] text-text-1">{value}</p>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }): React.ReactElement {
  return (
    <section className="mt-12">
      <p className="mb-4 text-[11px] uppercase tracking-[0.14em] text-text-3">{title}</p>
      {children}
    </section>
  )
}
