import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '@/styles/app.css'

/**
 * 完成提示：从屏幕上方中点扩散的一圈很轻的水波（480ms）。
 * 窗口是透明的全屏覆盖层，Rust 侧显示 480ms 后自动隐藏、
 * 且设置了 set_ignore_cursor_events，不会挡住任何点击。
 */
function Flash(): React.ReactElement {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    // Rust 在 show() 之后会 dispatch 'aux-flash' 显式触发重播。
    // visibilitychange 只是兜底（隐藏窗口的 CSS 动画早就跑完了，show 不会自动重来）。
    const restart = (): void => setTick((t) => t + 1)
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') restart()
    }
    window.addEventListener('aux-flash', restart)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('aux-flash', restart)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  return (
    <div className="relative h-full w-full overflow-hidden" style={{ background: 'transparent' }}>
      <div
        key={tick}
        style={{
          position: 'absolute',
          left: '50%',
          top: -40,
          width: '90vmax',
          height: '90vmax',
          marginLeft: '-45vmax',
          borderRadius: '50%',
          background:
            'radial-gradient(circle, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.05) 38%, rgba(255,255,255,0) 62%)',
          animation: 'aux-ripple 480ms cubic-bezier(0.32,0.72,0,1) forwards',
          willChange: 'transform, opacity',
        }}
      />
      <style>{`
        @keyframes aux-ripple {
          0%   { transform: scale(0.12); opacity: 0; }
          18%  { opacity: 1; }
          100% { transform: scale(1); opacity: 0; }
        }
      `}</style>
    </div>
  )
}

const el = document.getElementById('root')
if (!el) throw new Error('缺少 #root')
document.documentElement.style.background = 'transparent'
document.body.style.background = 'transparent'
createRoot(el).render(<Flash />)
