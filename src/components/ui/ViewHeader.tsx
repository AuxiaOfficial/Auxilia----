import { ArrowLeft } from 'lucide-react'
import { useUiStore } from '@/store/uiStore'

/** 子界面统一顶栏：返回主界面（Esc 同样可用） */
export default function ViewHeader({ extra }: { extra?: React.ReactNode }): React.ReactElement {
  const setView = useUiStore((s) => s.setView)

  return (
    <div className="flex h-11 shrink-0 items-center justify-between">
      <button
        type="button"
        onClick={() => setView('home')}
        className="group flex items-center gap-1.5 text-[12.5px] text-text-2 transition-colors duration-fast hover:text-text-1"
      >
        <ArrowLeft size={13} strokeWidth={1.8} />
        返回
        <span className="ml-0.5 text-[10px] text-text-dim">Esc</span>
      </button>
      {extra}
    </div>
  )
}
