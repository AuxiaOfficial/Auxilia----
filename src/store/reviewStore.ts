import { create } from 'zustand'
import { flowCoinsFor, reviewRepo, walletRepo } from '@/lib/db'
import { DAY, HOUR, startOfDay } from '@/lib/time'
import type { Period, Review, ReviewSettings } from '@/lib/types'

/** 判断当前是否有到期未写的复盘 */
function computeDue(s: ReviewSettings): Period | null {
  const now = Date.now()
  const today = startOfDay(now)
  if (s.dailyOn && now >= today + s.dailyHour * HOUR && s.lastDailyAt < today) return 'daily'
  if (s.weeklyOn) {
    const d = new Date(today)
    const diff = (d.getDay() - s.weeklyDow + 7) % 7
    const dueDay = today - diff * DAY + s.weeklyHour * HOUR
    if (now >= dueDay && s.lastWeeklyAt < dueDay) return 'weekly'
  }
  if (s.monthlyOn) {
    // 本月应写时间点：dom 号 monthlyHour 点
    const d = new Date(today)
    d.setDate(Math.min(s.monthlyDom, 28))
    d.setHours(s.monthlyHour, 0, 0, 0)
    const dueAt = d.getTime()
    if (now >= dueAt && s.lastMonthlyAt < dueAt) return 'monthly'
  }
  return null
}

interface ReviewStore {
  reviews: Review[]
  settings: ReviewSettings | null
  due: Period | null
  loading: boolean
  refresh(): Promise<void>
  save(period: Period, markdown: string): Promise<Review>
}

export const useReviewStore = create<ReviewStore>((set, get) => ({
  reviews: [],
  settings: null,
  due: null,
  loading: false,

  async refresh() {
    set({ loading: true })
    try {
      const [reviews, settings] = await Promise.all([
        reviewRepo.list(30),
        reviewRepo.settings(),
      ])
      set({ reviews, settings, due: computeDue(settings), loading: false })
    } catch {
      set({ loading: false })
    }
  },

  async save(period, markdown) {
    const now = Date.now()
    const span = period === 'daily' ? DAY : period === 'weekly' ? 7 * DAY : 30 * DAY
    const review = await reviewRepo.save({
      period,
      periodStart: now - span,
      periodEnd: now,
      contentMd: markdown,
    })
    // 标记这类复盘已写：不标记的话红点永远不会消失
    await reviewRepo.markDone(period)
    // 复盘也发心流币（按正文字数，30 字起算，每 20 字 1 枚）
    const coins = flowCoinsFor(markdown)
    if (coins > 0) await walletRepo.grantFlow(`review:${review.id}`, coins)
    const settings = await reviewRepo.settings()
    set({ reviews: [review, ...get().reviews], settings, due: computeDue(settings) })
    return review
  },
}))
