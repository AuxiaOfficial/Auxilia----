import { useRef, useState } from 'react'
import { Play } from 'lucide-react'
import type { Task } from '@/lib/types'
import { formatDuration } from '@/lib/time'
import { useTaskStore } from '@/store/taskStore'
import { useUiStore } from '@/store/uiStore'
import { useRunSeconds, useRunStore } from '@/store/runStore'
import { useTimelineStore } from '@/store/timelineStore'
import { useMenuStore } from '@/store/menuStore'
import { useDragStore } from '@/store/dragStore'
import { listKeyDown } from '@/lib/nav'

/**
 * 拖拽幽灵：原生拖影是静态快照，既不能倾斜也不会跟随速度。
 * 这里隐藏原生拖影，自己画一个跟随光标的卡片，并用「水平速度 → 倾角」
 * 做一个带衰减的追踪，手感接近被拖着走的实体卡片。
 */
function attachGhost(title: string): () => void {
  const ghost = document.createElement('div')
  ghost.textContent = title
  Object.assign(ghost.style, {
    position: 'fixed',
    left: '0px',
    top: '0px',
    maxWidth: '220px',
    padding: '7px 14px',
    borderRadius: '8px',
    background: 'rgba(28,28,28,0.92)',
    border: '1px solid rgba(255,255,255,0.18)',
    color: '#f3f3f3',
    fontSize: '12.5px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    pointerEvents: 'none',
    zIndex: '9999',
    boxShadow: '0 14px 34px rgba(0,0,0,0.55)',
    transform: 'translate(-50%,-50%) rotate(0deg)',
    willChange: 'transform, left, top',
  } satisfies Partial<CSSStyleDeclaration>)
  document.body.appendChild(ghost)

  let vx = 0
  let tilt = 0
  let lastX: number | null = null
  let raf = 0

  const onDragOver = (e: DragEvent): void => {
    if (e.clientX === 0 && e.clientY === 0) return
    if (lastX !== null) vx = e.clientX - lastX
    lastX = e.clientX
    ghost.style.left = `${e.clientX}px`
    ghost.style.top = `${e.clientY}px`
  }

  const loop = (): void => {
    // 非线性：倾角追速度，速度自身快速衰减 → 停下就回正
    const target = Math.max(-13, Math.min(13, vx * 1.4))
    tilt += (target - tilt) * 0.18
    vx *= 0.8
    ghost.style.transform = `translate(-50%,-50%) rotate(${tilt.toFixed(2)}deg)`
    raf = requestAnimationFrame(loop)
  }

  document.addEventListener('dragover', onDragOver)
  raf = requestAnimationFrame(loop)

  return () => {
    cancelAnimationFrame(raf)
    document.removeEventListener('dragover', onDragOver)
    ghost.remove()
  }
}

/** 1×1 透明图，用来干掉浏览器自带的拖影 */
function blankDragImage(): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  return canvas
}

export default function TaskItem({
  task,
  running,
  managing,
}: {
  task: Task
  running: boolean
  managing: boolean
}): React.ReactElement {
  const openStart = useUiStore((s) => s.openStart)
  const setView = useUiStore((s) => s.setView)
  const notify = useUiStore((s) => s.notify)
  const openProps = useUiStore((s) => s.openProps)
  const abort = useRunStore((s) => s.abort)
  const selected = useTaskStore((s) => s.selected.includes(task.id))
  const toggleSelect = useTaskStore((s) => s.toggleSelect)
  const update = useTaskStore((s) => s.update)
  const remove = useTaskStore((s) => s.remove)
  const addToActive = useTimelineStore((s) => s.addToActive)
  const openMenu = useMenuStore((s) => s.openAt)
  const seconds = useRunSeconds(task.id)

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(task.title)
  const [confirming, setConfirming] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const cleanup = useRef<(() => void) | null>(null)

  const commitRename = (): void => {
    const title = draft.trim()
    setEditing(false)
    if (!title || title === task.title) {
      setDraft(task.title)
      return
    }
    void update(task.id, { title }).then(() => notify('已重命名'))
  }

  const menu = (x: number, y: number): void => {
    openMenu(x, y, [
      {
        label: running ? '查看计时' : '开始这个任务',
        hint: 'Enter',
        onSelect: () => (running ? setView('focus') : openStart(task.id)),
      },
      {
        label: '重命名',
        hint: '双击标题',
        onSelect: () => {
          setDraft(task.title)
          setEditing(true)
          requestAnimationFrame(() => inputRef.current?.select())
        },
      },
      {
        label: '加入当前 TaskLine',
        onSelect: () => {
          void addToActive(task.id)
            .then((minute) => {
              const h = String(Math.floor(minute / 60)).padStart(2, '0')
              const m = String(minute % 60).padStart(2, '0')
              notify(`已加入 TaskLine · ${h}:${m}`)
            })
            .catch((err) => notify(err instanceof Error ? err.message : '加入失败', 'danger'))
        },
      },
      {
        label: '修改属性（时长 / 提示 / 显示）',
        onSelect: () => openProps(task.id),
      },
      {
        label: running ? '中止并删除' : '删除',
        danger: true,
        onSelect: () => {
          // 正在跑的任务必须先中止，否则引擎里那轮会一直挂着
          void (async () => {
            if (running) await abort(task.id)
            await remove(task.id)
            if (running) notify('已中止并删除')
          })()
        },
      },
    ])
  }

  return (
    <div
      draggable={!managing && !editing}
      onDragStart={(e) => {
        // 自定义类型给应用内部用，text/plain 兜底（某些环境读不到自定义类型）
        e.dataTransfer.setData('application/x-auxilia-task', task.id)
        e.dataTransfer.setData('text/plain', `auxilia-task:${task.id}`)
        e.dataTransfer.effectAllowed = 'copy'
        e.dataTransfer.setDragImage(blankDragImage(), 0, 0)
        const minutes = Math.round((task.plannedSeconds ?? 0) / 60) || 30
        useDragStore.getState().begin({ taskId: task.id, title: task.title, minutes })
        cleanup.current = attachGhost(task.title)
      }}
      onDragEnd={() => {
        cleanup.current?.()
        cleanup.current = null
        useDragStore.getState().end()
      }}
      onClick={() => {
        if (managing) toggleSelect(task.id)
        else if (running) setView('focus')
        else openStart(task.id)
      }}
      onDoubleClick={(e) => {
        if (managing) return
        e.stopPropagation()
        setDraft(task.title)
        setEditing(true)
        requestAnimationFrame(() => inputRef.current?.select())
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        if (managing) return
        menu(e.clientX, e.clientY)
      }}
      data-nav-item
      tabIndex={0}
      onKeyDown={(e) => {
        if (editing) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          if (running) setView('focus')
          else openStart(task.id)
          return
        }
        if (e.key === 'F2') {
          e.preventDefault()
          setDraft(task.title)
          setEditing(true)
          requestAnimationFrame(() => inputRef.current?.select())
          return
        }
        listKeyDown(e)
      }}
      className="group flex h-11 cursor-default items-center gap-2 rounded-md px-3 outline-none transition-colors duration-fast hover:bg-surface-3 focus-visible:bg-surface-2"
    >
      {managing && (
        <span
          className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[4px] border"
          style={{
            borderColor: selected ? 'var(--accent)' : 'var(--border-strong)',
            background: selected ? 'var(--accent)' : 'transparent',
          }}
        >
          {selected && (
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
              <path d="M1 4.2 3 6.2 7 1.8" stroke="var(--bg)" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          )}
        </span>
      )}

      {running && (
        <span
          className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full"
          style={{ background: 'var(--accent)' }}
        />
      )}

      {editing ? (
        <input
          ref={inputRef}
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commitRename()
            }
            if (e.key === 'Escape') {
              e.preventDefault()
              e.stopPropagation()
              setDraft(task.title)
              setEditing(false)
            }
          }}
          className="min-w-0 flex-1 rounded-sm bg-transparent px-1 text-[13.5px] text-text-1"
          style={{ background: 'var(--surface-2)' }}
        />
      ) : (
        <span className="min-w-0 flex-1 truncate text-[13.5px] text-text-1">{task.title}</span>
      )}

      {running ? (
        <span className="shrink-0 text-[11px] text-text-2">{formatDuration(seconds)}</span>
      ) : (
        <span className="flex shrink-0 items-center gap-2">
          {task.level >= 5 && (
            <span
              className="h-1 w-1 rounded-full"
              style={{
                background: 'var(--accent)',
                opacity: Math.min(0.5, 0.12 + task.level * 0.05),
              }}
            />
          )}
          {confirming ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                void (async () => {
                  if (running) await abort(task.id)
                  await remove(task.id)
                })()
              }}
              className="text-[11px] text-danger"
            >
              确认删除？
            </button>
          ) : (
            <>
              <button
                type="button"
                title="开始"
                onClick={(e) => {
                  e.stopPropagation()
                  openStart(task.id)
                }}
                className="hidden text-text-3 transition-colors duration-fast hover:text-text-1 group-hover:block"
              >
                <Play size={12} strokeWidth={1.8} />
              </button>
              <button
                type="button"
                title="删除"
                onClick={(e) => {
                  e.stopPropagation()
                  setConfirming(true)
                  setTimeout(() => setConfirming(false), 3000)
                }}
                className="hidden text-text-3 transition-colors duration-fast hover:text-danger group-hover:block"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 3.5h8M4.5 3.5V2h3v1.5M3 3.5l.5 6.5h5l.5-6.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              </button>
            </>
          )}
        </span>
      )}
    </div>
  )
}
