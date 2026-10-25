import { create } from 'zustand'
import { settingsRepo } from '@/lib/db'

export const DEFAULT_REVIEW_QUESTIONS = [
  '任务和你的预期，差量在哪里？',
  '哪个瞬间，你觉得自己可以做得不一样？',
  '下次你会做一个什么具体的动作？',
]

export type FlashStyle = 'ripple' | 'plain' | 'off'

interface SettingsStore {
  loaded: boolean
  /** 任务结束后是否走复盘问答 */
  reviewEnabled: boolean
  /** 1~3 问，用户可删可改 */
  reviewQuestions: string[]
  /** 结束时是否播放提示音 */
  sound: boolean
  /** 闪屏样式 */
  flashStyle: FlashStyle
  /** 复盘 markdown 保存目录（空 = 文档/Auxilia/复盘） */
  reviewDir: string

  hydrate(): Promise<void>
  patch(partial: Partial<Omit<SettingsStore, 'loaded' | 'hydrate' | 'patch'>>): Promise<void>
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  loaded: false,
  reviewEnabled: true,
  reviewQuestions: DEFAULT_REVIEW_QUESTIONS,
  sound: true,
  flashStyle: 'ripple',
  reviewDir: '',

  async hydrate() {
    const [enabled, rawQuestions, sound, style, dir] = await Promise.all([
      settingsRepo.getBool('review.enabled', true),
      settingsRepo.get('review.questions'),
      settingsRepo.getBool('alert.sound', true),
      settingsRepo.get('alert.flash'),
      settingsRepo.get('review.dir'),
    ])
    let questions = DEFAULT_REVIEW_QUESTIONS
    if (rawQuestions) {
      try {
        const parsed = JSON.parse(rawQuestions) as unknown
        if (Array.isArray(parsed)) {
          questions = parsed.filter((q): q is string => typeof q === 'string' && q.trim().length > 0)
        }
      } catch {
        /* 坏数据就退回默认 */
      }
    }
    set({
      loaded: true,
      reviewEnabled: enabled,
      reviewQuestions: questions,
      sound,
      flashStyle: (style === 'plain' || style === 'off' ? style : 'ripple') as FlashStyle,
      reviewDir: dir ?? '',
    })
  },

  async patch(partial) {
    set(partial)
    const s = get()
    await Promise.all([
      settingsRepo.set('review.enabled', s.reviewEnabled ? '1' : '0'),
      settingsRepo.set('review.questions', JSON.stringify(s.reviewQuestions)),
      settingsRepo.set('alert.sound', s.sound ? '1' : '0'),
      settingsRepo.set('alert.flash', s.flashStyle),
      settingsRepo.set('review.dir', s.reviewDir),
    ])
  },
}))
