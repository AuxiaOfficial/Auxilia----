import { motion } from 'motion/react'

/**
 * 开关。之前那版滑块没写 left-0，absolute 元素会落到静态位置（靠右），
 * 再叠加 x 位移就跑到轨道外面去了 —— 这就是「滑动按钮 UI 错位」。
 */
export default function Toggle({
  label,
  hint,
  value,
  onChange,
}: {
  label: string
  hint?: string
  value: boolean
  onChange: (v: boolean) => void
}): React.ReactElement {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      className="flex h-12 w-full items-center justify-between rounded-md px-4 text-left transition-colors duration-fast hover:bg-surface-2"
    >
      <span className="flex min-w-0 flex-col">
        <span className="text-[13.5px] text-text-1">{label}</span>
        {hint && <span className="mt-0.5 text-[11px] text-text-dim">{hint}</span>}
      </span>
      <span
        className="relative ml-4 flex h-[22px] w-[38px] shrink-0 items-center rounded-full transition-colors duration-base"
        style={{ background: value ? 'var(--accent)' : 'var(--surface-3)' }}
      >
        <motion.span
          initial={false}
          animate={{ x: value ? 18 : 2 }}
          transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
          className="absolute left-0 top-[2px] h-[18px] w-[18px] rounded-full"
          style={{ background: value ? 'var(--bg)' : 'var(--text-2)' }}
        />
      </span>
    </button>
  )
}
