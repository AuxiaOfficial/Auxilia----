import { Minus, PanelLeft, Plus, Square, X } from 'lucide-react'
import { windowHide, windowMinimize, windowToggleMaximize } from '@/lib/ipc'
import { useUiStore } from '@/store/uiStore'

/** 自绘标题栏：无系统边框，靠 drag-region 拖动 */
export default function TitleBar(): React.ReactElement {
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)
  const openCreation = useUiStore((s) => s.openCreation)
  const collapsed = useUiStore((s) => s.sidebarCollapsed)

  return (
    <div
      data-tauri-drag-region
      className="relative flex shrink-0 items-center justify-between px-3"
      style={{ height: 'var(--titlebar-h)' }}
    >
      <div className="flex items-center gap-1">
        <IconButton label={collapsed ? '展开任务池' : '收起任务池'} onClick={toggleSidebar}>
          <PanelLeft size={14} strokeWidth={1.6} />
        </IconButton>
        <IconButton label="新建任务 ⌘N" onClick={openCreation}>
          <Plus size={14} strokeWidth={1.6} />
        </IconButton>
      </div>

      <div className="flex items-center gap-2 pr-1">
        <IconButton label="最小化" onClick={() => void windowMinimize()}>
          <Minus size={13} strokeWidth={1.6} />
        </IconButton>
        <IconButton label="最大化" onClick={() => void windowToggleMaximize()}>
          <Square size={11} strokeWidth={1.6} />
        </IconButton>
        <IconButton label="隐藏到托盘" onClick={() => void windowHide()}>
          <X size={13} strokeWidth={1.6} />
        </IconButton>
      </div>
    </div>
  )
}

function IconButton({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode
  label: string
  onClick: () => void
}): React.ReactElement {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      onMouseDown={(e) => e.stopPropagation()}
      className="flex h-7 w-7 items-center justify-center rounded-sm text-text-3 transition-colors duration-fast hover:bg-surface-3 hover:text-text-1"
    >
      {children}
    </button>
  )
}
