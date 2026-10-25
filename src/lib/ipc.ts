/* ============================================================
   IPC 封装 · 浏览器预览模式下自动降级
   组件里禁止直接 import @tauri-apps/api
   ============================================================ */

export const isDesktop: boolean =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

type UnlistenFn = () => void

async function tauri() {
  const [{ invoke }, { listen }] = await Promise.all([
    import('@tauri-apps/api/core'),
    import('@tauri-apps/api/event'),
  ])
  return { invoke, listen }
}

export class IpcError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'IpcError'
  }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/**
 * 调用 Rust 命令；浏览器模式下抛出可识别的错误。
 * WebView 会先于 Rust setup() 加载完，因此「state not managed」需要短暂重试，
 * 否则首屏的数据库读取会全部失败（这是实测踩到的坑）。
 */
export async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isDesktop) {
    throw new IpcError(`桌面端命令不可用（浏览器预览）：${cmd}`)
  }
  const { invoke } = await tauri()
  let last = ''
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      return await invoke<T>(cmd, args)
    } catch (err) {
      last = typeof err === 'string' ? err : `命令失败：${cmd}`
      if (last.includes('state not managed') && attempt < 19) {
        await sleep(120)
        continue
      }
      throw new IpcError(last)
    }
  }
  throw new IpcError(last || `命令失败：${cmd}`)
}

/** 订阅 Rust 事件；浏览器模式返回 noop */
export async function listen<T>(
  event: string,
  handler: (payload: T) => void,
): Promise<UnlistenFn> {
  if (!isDesktop) return () => {}
  const { listen: rawListen } = await tauri()
  return rawListen<T>(event, (e) => handler(e.payload))
}

export async function emit(event: string, payload?: unknown): Promise<void> {
  if (!isDesktop) return
  const { emit: rawEmit } = await import('@tauri-apps/api/event')
  await rawEmit(event, payload)
}

/* ---------- 窗口控制（主窗口自绘标题栏用） ---------- */

export async function windowMinimize(): Promise<void> {
  if (!isDesktop) return
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  await getCurrentWindow().minimize()
}

export async function windowToggleMaximize(): Promise<void> {
  if (!isDesktop) return
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  await getCurrentWindow().toggleMaximize()
}

/** 主窗口关闭 = 隐藏到托盘，不退出进程 */
export async function windowHide(): Promise<void> {
  if (!isDesktop) return
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  await getCurrentWindow().hide()
}

export async function windowShow(label: string): Promise<void> {
  if (!isDesktop) return
  const { Window } = await import('@tauri-apps/api/window')
  const w = await Window.getByLabel(label)
  if (!w) return
  await w.show()
  await w.setFocus()
}

export async function windowHideLabel(label: string): Promise<void> {
  if (!isDesktop) return
  const { Window } = await import('@tauri-apps/api/window')
  const w = await Window.getByLabel(label)
  if (w) await w.hide()
}
