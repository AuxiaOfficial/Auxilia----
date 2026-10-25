import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { ChevronDown, Plus, Trash2 } from 'lucide-react'
import { formatMinuteOfDay } from '@/lib/time'
import { transferRepo } from '@/lib/db'
import { useTaskStore } from '@/store/taskStore'
import { useTimelineStore } from '@/store/timelineStore'
import { useUiStore } from '@/store/uiStore'
import { useMenuStore } from '@/store/menuStore'
import { useDragStore } from '@/store/dragStore'
import { listKeyDown } from '@/lib/nav'

const HOUR_H = 72
/** 一像素代表多少分钟 */
const PX_PER_MIN = HOUR_H / 60

export default function TimelinePanel(): React.ReactElement {
  const lines = useTimelineStore((s) => s.lines)
  const activeId = useTimelineStore((s) => s.activeId)
  const entries = useTimelineStore((s) => s.entries)
  const select = useTimelineStore((s) => s.select)
  const createLine = useTimelineStore((s) => s.createLine)
  const removeLine = useTimelineStore((s) => s.removeLine)
  const addEntry = useTimelineStore((s) => s.addEntry)
  const moveEntry = useTimelineStore((s) => s.moveEntry)
  const removeEntry = useTimelineStore((s) => s.removeEntry)
  const tasks = useTaskStore((s) => s.tasks)
  const openStart = useUiStore((s) => s.openStart)
  const notify = useUiStore((s) => s.notify)

  const [openSwitcher, setOpenSwitcher] = useState(false)
  const [dragOver, setDragOver] = useState<number | null>(null)
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const [importText, setImportText] = useState('')
  const [resizing, setResizing] = useState<{ id: string; startY: number; startDuration: number } | null>(null)
  const [resizePreview, setResizePreview] = useState<number | null>(null)
  const dropMinutes = useDragStore((s) => s.minutes)
  const draggingTitle = useDragStore((s) => s.title)
  const openMenu = useMenuStore((s) => s.openAt)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [draggingEntry, setDraggingEntry] = useState<string | null>(null)

  const active = lines.find((l) => l.id === activeId) ?? lines[0] ?? null
  const startHour = active?.startHour ?? 6
  const endHour = active?.endHour ?? 24
  const hours = useMemo(() => {
    const out: number[] = []
    for (let h = startHour; h <= endHour; h += 1) out.push(h)
    return out
  }, [startHour, endHour])

  const taskMap = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks])
  const blocks = useMemo(
    () =>
      entries
        .flatMap((entry) => {
          const task = taskMap.get(entry.taskId)
          return task ? [{ entry, task }] : []
        })
        .sort((a, b) => a.entry.minuteOfDay - b.entry.minuteOfDay),
    [entries, taskMap],
  )

  /** 已被占用的时间段（分钟） */
  const occupied = (excludeId?: string): { s: number; e: number }[] =>
    entries
      .filter((e) => e.id !== excludeId)
      .map((e) => ({ s: e.minuteOfDay, e: e.minuteOfDay + e.durationMinutes }))
      .sort((a, b) => a.s - b.s)

  /** 把落点压到不与任何已有块重叠的位置（优先贴到冲突块后面） */
  const clampStart = (start: number, duration: number, excludeId?: string): number => {
    const dur = Math.max(5, duration)
    let s = Math.max(0, Math.min(1440 - dur, Math.round(start / 5) * 5))
    for (let guard = 0; guard < 40; guard += 1) {
      const hit = occupied(excludeId).find((o) => s < o.e && s + dur > o.s)
      if (!hit) return s
      const after = hit.e
      const before = hit.s - dur
      s = after + dur <= 1440 ? after : Math.max(0, before)
    }
    return s
  }

  /** 拉伸时最多能长到下一块的开头 */
  const maxDurationFor = (entryId: string): number => {
    const self = entries.find((e) => e.id === entryId)
    if (!self) return 600
    const next = entries
      .filter((e) => e.id !== entryId && e.minuteOfDay >= self.minuteOfDay)
      .sort((a, b) => a.minuteOfDay - b.minuteOfDay)[0]
    return Math.min(600, (next ? next.minuteOfDay : 1440) - self.minuteOfDay)
  }

  const minuteFromY = (clientY: number): number => {
    const el = scrollRef.current
    if (!el) return startHour * 60
    const rect = el.getBoundingClientRect()
    const y = clientY - rect.top + el.scrollTop
    const raw = startHour * 60 + (y / HOUR_H) * 60
    return Math.round(raw / 5) * 5
  }

  const exportLine = async (): Promise<void> => {
    try {
      const ids = [...new Set(entries.map((e) => e.taskId))]
      if (ids.length === 0) {
        notify('这条 TaskLine 还是空的')
        return
      }
      const code = await transferRepo.exportTasks(ids)
      await navigator.clipboard.writeText(code)
      notify('导出码已复制到剪贴板')
    } catch (err) {
      notify(err instanceof Error ? err.message : '导出失败', 'danger')
    }
  }

  // 块下边缘拖拽 = 调整这个任务在时间轴上占多长（不动任务本身）
  useEffect(() => {
    if (!resizing) return
    let last = resizing.startDuration
    const onMove = (e: PointerEvent): void => {
      const limit = maxDurationFor(resizing.id)
      const next = Math.max(
        5,
        Math.min(
          limit,
          resizing.startDuration + Math.round((e.clientY - resizing.startY) / PX_PER_MIN / 5) * 5,
        ),
      )
      setResizePreview(next)
      if (next !== last) {
        last = next
        void useTimelineStore.getState().setEntryDuration(resizing.id, next)
      }
    }
    const onUp = (): void => {
      setResizing(null)
      setResizePreview(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [resizing])

  const lineMenu = (e: React.MouseEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    openMenu(e.clientX, e.clientY, [
      {
        label: '重命名这条 TaskLine',
        hint: '双击名字',
        onSelect: () => {
          if (!active) return
          setNameDraft(active.name)
          setEditingName(true)
        },
      },
      { label: '新建 TaskLine', onSelect: () => void createLine() },
      { label: '复制导出码', onSelect: () => void exportLine() },
      {
        label: '导入任务码…',
        onSelect: () => {
          setImportText('')
          setImportOpen(true)
        },
      },
      {
        label: '删除这条 TaskLine',
        danger: true,
        onSelect: () => {
          if (active && lines.length > 1) void removeLine(active.id)
          else notify('至少保留一条 TaskLine')
        },
      },
    ])
  }

  const doImport = async (): Promise<void> => {
    const code = importText.trim()
    if (!code) return
    try {
      // 默认 copy：同一个导出码反复导回自己库里时不会被"重复"判定吞掉
      const n = await transferRepo.importCode(code, 'copy')
      await useTaskStore.getState().fetch()
      await useTimelineStore.getState().reload()
      setImportOpen(false)
      notify(n > 0 ? `已导入 ${n} 个任务` : '没有可导入的任务（可能导出码为空）')
    } catch (err) {
      notify(err instanceof Error ? err.message : '导入失败', 'danger')
    }
  }

  return (
    <motion.aside
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 380, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
      className="relative flex shrink-0 flex-col overflow-hidden"
      style={{ background: 'var(--panel-tint)' }}
    >
      <div className="relative flex items-center justify-between px-5 pb-3 pt-2">
        {editingName && active ? (
          <input
            autoFocus
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={() => {
              if (nameDraft.trim()) void useTimelineStore.getState().renameLine(active.id, nameDraft)
              setEditingName(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
            }}
            className="w-full bg-transparent text-[13px] text-text-1"
          />
        ) : (
          <button
            type="button"
            onClick={() => setOpenSwitcher((v) => !v)}
            onDoubleClick={() => {
              if (active) {
                setNameDraft(active.name)
                setEditingName(true)
              }
            }}
            onContextMenu={lineMenu}
            className="flex min-w-0 items-center gap-1.5 text-[13px] text-text-2 transition-colors duration-fast hover:text-text-1"
          >
            <span className="truncate">{active?.name ?? 'TaskLine'}</span>
            <ChevronDown size={12} strokeWidth={1.8} />
          </button>
        )}

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            title="新建 TaskLine"
            onClick={() => void createLine()}
            className="flex h-6 w-6 items-center justify-center rounded-sm text-text-3 transition-colors duration-fast hover:bg-surface-3 hover:text-text-1"
          >
            <Plus size={13} strokeWidth={1.8} />
          </button>
          <button
            type="button"
            title="导出这条 TaskLine"
            onClick={() => void exportLine()}
            className="flex h-6 w-6 items-center justify-center rounded-sm text-text-3 transition-colors duration-fast hover:bg-surface-3 hover:text-text-1"
          >
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <path d="M7 1.5v7m0 0L4.5 6M7 8.5 9.5 6M2.5 11.5h9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </button>
          <button
            type="button"
            title="删除这条 TaskLine"
            onClick={() => {
              if (active && lines.length > 1) void removeLine(active.id)
              else notify('至少保留一条 TaskLine')
            }}
            className="flex h-6 w-6 items-center justify-center rounded-sm text-text-3 transition-colors duration-fast hover:bg-surface-3 hover:text-danger"
          >
            <Trash2 size={12} strokeWidth={1.8} />
          </button>
        </div>

        {openSwitcher && (
          <div
            className="absolute left-5 top-9 z-20 w-[210px] rounded-md p-1"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
          >
            {lines.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => {
                  void select(l.id)
                  setOpenSwitcher(false)
                }}
                className="flex h-8 w-full items-center justify-between rounded-sm px-2.5 text-[12.5px] text-text-2 transition-colors duration-fast hover:bg-surface-3 hover:text-text-1"
              >
                <span className="truncate">{l.name}</span>
                {l.id === activeId && <span className="h-1 w-1 rounded-full" style={{ background: 'var(--accent)' }} />}
              </button>
            ))}
          </div>
        )}
      </div>

      <div
        ref={scrollRef}
        className="relative min-h-0 flex-1 overflow-y-auto px-2 pb-8"
        onDragOver={(e) => {
          e.preventDefault()
          // 不显式设置 dropEffect，Chromium 会判定为 none，drop 事件根本不会触发
          e.dataTransfer.dropEffect = 'copy'
          setDragOver(minuteFromY(e.clientY))
        }}
        onDragLeave={() => setDragOver(null)}
        onDrop={(e) => {
          e.preventDefault()
          const minute = minuteFromY(e.clientY)
          setDragOver(null)
          const entryId = e.dataTransfer.getData('application/x-auxilia-entry')
          if (entryId) {
            const self = useTimelineStore.getState().entries.find((x) => x.id === entryId)
            const placed = clampStart(minute, self?.durationMinutes ?? 30, entryId)
            void moveEntry(entryId, placed)
            return
          }
          const raw =
            e.dataTransfer.getData('application/x-auxilia-task') ||
            e.dataTransfer.getData('text/plain')
          const taskId = raw.startsWith('auxilia-task:') ? raw.slice('auxilia-task:'.length) : raw
          if (taskId) {
            const placed = clampStart(minute, dropMinutes)
            void addEntry(taskId, placed, dropMinutes)
              .then(() => notify('已加入 TaskLine'))
              .catch((err) => notify(err instanceof Error ? err.message : '加入失败', 'danger'))
          }
          useDragStore.getState().end()
        }}
      >
        <div
          className="relative"
          style={{ height: (endHour - startHour) * HOUR_H, marginTop: 10 }}
          data-nav-container
        >
          {/* 刻度线在底层，时间数字在顶层：任务块不能压住时间 */}
          {hours.map((h, i) => (
            <div key={h} className="absolute inset-x-0 flex items-center" style={{ top: i * HOUR_H }}>
              <span className="h-px flex-1" style={{ background: 'rgba(255,255,255,0.04)' }} />
            </div>
          ))}

          {hours.map((h, i) => (
            <div
              key={`label-${h}`}
              className="pointer-events-none absolute left-0 z-30 w-11"
              style={{ top: i * HOUR_H - 7 }}
            >
              <span className="block pr-2 text-right text-[11px] text-text-2">
                {formatMinuteOfDay(h * 60)}
              </span>
            </div>
          ))}

          {dragOver !== null && (
            <>
              {/* 落点线 + 幽灵块：松手就是这个位置、这个长度 */}
              <div
                className="pointer-events-none absolute right-2 z-20 h-[2px]"
                style={{
                  left: 46,
                  top: ((dragOver - startHour * 60) / 60) * HOUR_H,
                  background: 'var(--accent)',
                  opacity: 0.9,
                }}
              />
              <div
                className="pointer-events-none absolute right-2 z-[9] flex flex-col justify-center overflow-hidden rounded-sm px-3"
                style={{
                  left: 46,
                  top: ((dragOver - startHour * 60) / 60) * HOUR_H,
                  height: Math.max(dropMinutes * PX_PER_MIN, 12),
                  background: 'rgba(232,232,232,0.10)',
                  border: '1px dashed rgba(232,232,232,0.35)',
                }}
              >
                <span className="truncate text-[11.5px] text-text-2">{draggingTitle}</span>
                <span className="text-[10px] text-text-dim">
                  {formatMinuteOfDay(dragOver)} · {dropMinutes}m
                </span>
              </div>
            </>
          )}

          {blocks.map(({ entry, task }) => {
            const liveDuration =
              resizing?.id === entry.id && resizePreview ? resizePreview : entry.durationMinutes
            const blockH = Math.max(liveDuration * PX_PER_MIN, 18)
            const compact = blockH < 44
            return (
            <div
              key={entry.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('application/x-auxilia-entry', entry.id)
                setDraggingEntry(entry.id)
              }}
              onDragEnd={() => setDraggingEntry(null)}
              onClick={() => openStart(task.id)}
              data-nav-item
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  openStart(task.id)
                  return
                }
                listKeyDown(e)
              }}
              onContextMenu={(e) => {
                e.preventDefault()
                e.stopPropagation()
                openMenu(e.clientX, e.clientY, [
                  { label: '现在开始这个任务', onSelect: () => openStart(task.id) },
                  {
                    label: '从这条 TaskLine 移除',
                    danger: true,
                    onSelect: () => void removeEntry(entry.id),
                  },
                ])
              }}
              className={`group absolute z-[5] flex cursor-default overflow-hidden rounded-sm pl-4 pr-2 transition-colors duration-fast hover:bg-surface-3 ${
                compact ? 'items-center gap-2' : 'flex-col'
              }`}
              style={{
                top: ((entry.minuteOfDay - startHour * 60) / 60) * HOUR_H,
                height: blockH,
                // 让开左侧 44px 的时间刻度，块永远不压住时间
                left: 46,
                right: 4,
                background: draggingEntry === entry.id ? 'var(--surface-3)' : 'var(--surface-1)',
                border: resizing?.id === entry.id ? '1px solid var(--border-strong)' : 'none',
              }}
            >
              <span
                className="absolute inset-y-1.5 left-1.5 w-[2px] rounded-full"
                style={{ background: 'var(--accent)', opacity: 0.35 }}
              />
              <span
                className={`min-w-0 flex-1 truncate text-text-1 ${compact ? 'text-[11.5px]' : 'mt-1 text-[12.5px]'}`}
              >
                {task.title}
              </span>
              <span
                className={`shrink-0 text-[10px] text-text-dim ${compact ? '' : 'mb-1'}`}
              >
                {formatMinuteOfDay(entry.minuteOfDay)}
                {compact ? '' : ` · ${entry.durationMinutes}m`}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  void removeEntry(entry.id)
                }}
                className="absolute right-1.5 top-1 hidden text-text-dim hover:text-danger group-hover:block"
                aria-label="移除"
              >
                ×
              </button>
              {/* 下边缘拖拽改时长 */}
              <span
                onPointerDown={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setResizing({ id: entry.id, startY: e.clientY, startDuration: entry.durationMinutes })
                }}
                onClick={(e) => e.stopPropagation()}
                className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize"
                style={{ background: 'transparent' }}
              />
            </div>
            )
          })}

          {blocks.length === 0 && <span />}
        </div>
      </div>

      {importOpen && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center px-5"
          style={{ background: 'rgba(0,0,0,0.72)' }}
          onClick={() => setImportOpen(false)}
        >
          <div
            className="w-full rounded-md p-4"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[13px] text-text-1">粘贴导出码</p>
            <textarea
              autoFocus
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setImportOpen(false)
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void doImport()
              }}
              placeholder="aux1:..."
              rows={4}
              className="mt-3 w-full resize-none rounded-sm p-2 text-[12px] text-text-1"
              style={{ background: 'var(--surface-1)' }}
            />
            <div className="mt-3 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setImportOpen(false)}
                className="text-[12px] text-text-2 hover:text-text-1"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void doImport()}
                className="flex h-8 items-center rounded-full px-4 text-[12px] font-medium"
                style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
              >
                导入
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.aside>
  )
}
