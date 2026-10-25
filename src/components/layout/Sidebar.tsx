import { useEffect, useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { Plus, Search, Trash2 } from 'lucide-react'
import { statsRepo } from '@/lib/db'
import { formatDuration } from '@/lib/time'
import { useTaskStore } from '@/store/taskStore'
import { useUiStore } from '@/store/uiStore'
import { useRunStore } from '@/store/runStore'
import TaskItem from '@/components/task/TaskItem'

export default function Sidebar({
  collapsed,
  dimmed,
}: {
  collapsed: boolean
  dimmed: boolean
}): React.ReactElement {
  const tasks = useTaskStore((s) => s.tasks)
  const keyword = useTaskStore((s) => s.keyword)
  const search = useTaskStore((s) => s.search)
  const loading = useTaskStore((s) => s.loading)
  const loaded = useTaskStore((s) => s.loaded)
  const selected = useTaskStore((s) => s.selected)
  const batchRemove = useTaskStore((s) => s.batchRemove)
  const clearSelect = useTaskStore((s) => s.clearSelect)
  const openCreation = useUiStore((s) => s.openCreation)
  const setView = useUiStore((s) => s.setView)
  const running = useRunStore((s) => s.runs)

  const [managing, setManaging] = useState(false)
  const [today, setToday] = useState(0)

  useEffect(() => {
    let alive = true
    void statsRepo.summary().then((s) => {
      if (alive) setToday(s.todaySeconds)
    })
    return () => {
      alive = false
    }
  }, [tasks.length, running.length])

  const runningIds = useMemo(() => new Set(running.map((r) => r.taskId)), [running])

  return (
    <motion.aside
      animate={{ width: collapsed ? 0 : 260, opacity: dimmed || collapsed ? 0 : 1 }}
      transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
      className="flex shrink-0 flex-col overflow-hidden"
      style={{ background: 'var(--panel-tint)' }}
    >
      <div className="flex items-center justify-between px-5 pt-2 pb-3">
        <button
          type="button"
          onClick={() => setView('settings')}
          title="设置"
          className="text-[15px] font-medium tracking-tight text-text-2 transition-colors duration-fast hover:text-text-1"
        >
          Auxilia
        </button>
        <div className="flex items-center gap-1">
          <button
            type="button"
            title="批量管理"
            onClick={() => {
              setManaging((v) => !v)
              if (managing) clearSelect()
            }}
            className={`flex h-6 w-6 items-center justify-center rounded-sm transition-colors duration-fast hover:bg-surface-3 ${
              managing ? 'text-text-1' : 'text-text-3 hover:text-text-1'
            }`}
          >
            <Trash2 size={13} strokeWidth={1.6} />
          </button>
          <button
            type="button"
            title="新建任务 ⌘N"
            onClick={openCreation}
            className="flex h-6 w-6 items-center justify-center rounded-sm text-text-3 transition-colors duration-fast hover:bg-surface-3 hover:text-text-1"
          >
            <Plus size={14} strokeWidth={1.6} />
          </button>
        </div>
      </div>

      <div className="px-5">
        <div className="flex h-[46px] items-center gap-2 border-b border-line transition-colors duration-base focus-within:border-line-strong">
          <Search size={13} strokeWidth={1.6} className="shrink-0 text-text-3" />
          <input
            value={keyword}
            onChange={(e) => search(e.target.value)}
            placeholder="搜索任务"
            className="min-w-0 flex-1 bg-transparent text-[13px] text-text-1 placeholder:text-text-3"
          />
        </div>
      </div>

      {managing && selected.length > 0 && (
        <div className="flex items-center justify-between px-5 pt-3 text-[12px] text-text-2">
          <span>已选 {selected.length} 项</span>
          <button
            type="button"
            onClick={() => void batchRemove(selected)}
            className="text-danger transition-opacity duration-fast hover:opacity-80"
          >
            删除
          </button>
        </div>
      )}

      <div className="mt-2 min-h-0 flex-1 overflow-y-auto px-2" data-nav-container>
        {tasks.map((task) => (
          <TaskItem
            key={task.id}
            task={task}
            running={runningIds.has(task.id)}
            managing={managing}
          />
        ))}
        {loaded && tasks.length === 0 && (
          <div className="px-3 py-6 text-[13px] text-text-3">
            {keyword ? '没有匹配的任务' : '还没有任务'}
            {!keyword && (
              <button
                type="button"
                onClick={openCreation}
                className="ml-2 text-text-2 transition-colors duration-fast hover:text-text-1"
              >
                新建
              </button>
            )}
          </div>
        )}
        {loading && !loaded && <div className="px-3 py-6 text-[13px] text-text-3">读取中…</div>}
      </div>

      <div className="flex items-center justify-between px-5 pb-3 pt-2 text-[11px] text-text-3">
        <span>今日 {formatDuration(today)}</span>
        <span>{tasks.length} 个任务</span>
      </div>
    </motion.aside>
  )
}
