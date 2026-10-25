import { useEffect } from 'react'
import { AnimatePresence } from 'motion/react'
import { listen } from '@tauri-apps/api/event'
import TitleBar from '@/components/layout/TitleBar'
import Sidebar from '@/components/layout/Sidebar'
import CenterStage from '@/components/layout/CenterStage'
import TimelinePanel from '@/components/taskline/TimelinePanel'
import CreationDrawer from '@/components/creation/CreationDrawer'
import Onboarding from '@/components/onboarding/Onboarding'
import StartSheet from '@/components/timer/StartSheet'
import TaskPropsSheet from '@/components/task/TaskPropsSheet'
import ContextMenu from '@/components/ui/ContextMenu'
import Toaster from '@/components/ui/Toaster'
import { call, isDesktop, windowHide } from '@/lib/ipc'
import { playChime, unlockAudio } from '@/lib/sound'
import { useUiStore } from '@/store/uiStore'
import { useTaskStore } from '@/store/taskStore'
import { useRunStore } from '@/store/runStore'
import { useTimelineStore } from '@/store/timelineStore'
import { useSettingsStore } from '@/store/settingsStore'
import { useMenuStore } from '@/store/menuStore'
import type { RunSnapshot } from '@/lib/types'

export default function App(): React.ReactElement {
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed)
  const rightbarCollapsed = useUiStore((s) => s.rightbarCollapsed)
  const view = useUiStore((s) => s.view)
  const openCreation = useUiStore((s) => s.openCreation)

  useEffect(() => {
    void (async () => {
      await useUiStore.getState().hydrate()
      await useSettingsStore.getState().hydrate()
      await useTaskStore.getState().fetch()
      await useTimelineStore.getState().init()
      await useRunStore.getState().init()

      if (import.meta.env.DEV) {
        const demo = new URLSearchParams(location.search).get('demo')
        const ui = useUiStore.getState()
        if (demo === 'create') ui.openCreation()
        if (demo === 'achievements') ui.setView('achievements')
        if (demo === 'review') ui.setView('review')
        if (demo === 'settings') ui.setView('settings')
      }
    })()
  }, [])

  // 首次交互解锁音频（否则完成时那一声永远不响）
  useEffect(() => {
    const unlock = (): void => unlockAudio()
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [])

  // 计时结束：闪屏 + 提示音（窗口置顶由 Rust 侧负责）
  useEffect(() => {
    if (!isDesktop) return
    let alive = true
    let stop: (() => void) | null = null
    void listen<{ taskId: string }>('timer:finished', () => {
      const settings = useSettingsStore.getState()
      const runs = useRunStore.getState().runs
      const run = runs[runs.length - 1] as RunSnapshot | undefined
      const wantsFlash = run?.alertFlash || settings.flashStyle !== 'off'
      if (wantsFlash && settings.flashStyle !== 'off') void call('ui_flash')
      if (settings.sound || run?.alertSound) playChime()
    }).then((un) => {
      if (alive) stop = un
      else un()
    })
    return () => {
      alive = false
      stop?.()
    }
  }, [])

  // 全局键盘：Esc 逐层退出，最后退回托盘
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const mod = e.metaKey || e.ctrlKey
      const ui = useUiStore.getState()

      if (mod && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        ui.openCreation()
        return
      }
      if (mod && e.key === ',') {
        e.preventDefault()
        ui.setView('settings')
        return
      }
      if (e.key === 'Escape') {
        // 右键菜单自己会拦住（capture），这里只管面板与视图
        if (ui.creationOpen) {
          ui.closeCreation()
          return
        }
        if (ui.startSheetTaskId) {
          ui.closeStart()
          return
        }
        if (ui.pendingStart) {
          ui.clearPendingStart()
          return
        }
        if (ui.propsTaskId) {
          ui.closeProps()
          return
        }
        if (useMenuStore.getState().open) return
        // 正在写复盘时不要被 Esc 打断（避免半途丢掉）
        if (ui.view === 'finish') return
        if (ui.view !== 'home') {
          ui.setView('home')
          return
        }
        if (isDesktop) void windowHide()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openCreation])

  // 专注界面全屏居中（侧栏会遮住，导致计时器看起来偏右）
  const focusMode = view === 'focus'

  return (
    <div
      className="flex h-full flex-col overflow-hidden bg-bg"
      onContextMenu={(e) => {
        // 输入框里保留原生菜单（复制/粘贴），其它位置一律用自绘菜单
        const el = e.target as HTMLElement
        if (el.closest('input, textarea, [data-native-menu]')) return
        e.preventDefault()
      }}
    >
      <TitleBar />
      <div className="relative flex min-h-0 flex-1">
        {!focusMode && <Sidebar collapsed={sidebarCollapsed} dimmed={false} />}
        <CenterStage />
        <AnimatePresence initial={false}>
          {!focusMode && !rightbarCollapsed && <TimelinePanel key="timeline" />}
        </AnimatePresence>
      </div>
      <Onboarding />
      <CreationDrawer />
      <StartSheet />
      <TaskPropsSheet />
      <ContextMenu />
      <Toaster />
    </div>
  )
}
