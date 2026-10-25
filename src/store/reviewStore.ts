import { create } from 'zustand'
import { reviewRepo } from '@/lib/db'
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
    const d = new Date(today)
    if (d.getDate() >= s.monthlyDom && s.lastMonthlyAt < today - 30 * DAY) return 'monthly'
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
    set({ reviews: [review, ...get().reviews], due: null })
    return review
  },
}))
