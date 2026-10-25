import { useEffect, useState } from 'react'

/**
 * 只负责触发重绘，不做任何时间累加。
 * 真实秒数永远由 Date.now() 与时间戳相减得出。
 */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null
    const start = (): void => {
      if (timer) return
      timer = setInterval(() => setNow(Date.now()), intervalMs)
    }
    const stop = (): void => {
      if (!timer) return
      clearInterval(timer)
      timer = null
    }
    const onVisibility = (): void => {
      if (document.hidden) stop()
      else {
        setNow(Date.now())
        start()
      }
    }
    if (!document.hidden) start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [intervalMs])

  return now
}
