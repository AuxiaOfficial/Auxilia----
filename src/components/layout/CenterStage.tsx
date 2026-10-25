import { AnimatePresence, motion } from 'motion/react'
import { useUiStore } from '@/store/uiStore'
import HomeView from './HomeView'
import FocusView from '@/components/timer/FocusView'
import FinishFlow from '@/components/finish/FinishFlow'
import AchievementsView from '@/components/achievement/AchievementsView'
import ReviewView from '@/components/review/ReviewView'
import SettingsView from '@/components/settings/SettingsView'

const EASE = [0.32, 0.72, 0, 1] as const

export default function CenterStage(): React.ReactElement {
  const view = useUiStore((s) => s.view)

  return (
    <main className="relative min-w-0 flex-1 overflow-hidden">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={view}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.3, ease: EASE }}
          className="h-full"
        >
          {view === 'home' && <HomeView />}
          {view === 'focus' && <FocusView />}
          {view === 'finish' && <FinishFlow />}
          {view === 'achievements' && <AchievementsView />}
          {view === 'review' && <ReviewView />}
          {view === 'settings' && <SettingsView />}
        </motion.div>
      </AnimatePresence>
    </main>
  )
}
