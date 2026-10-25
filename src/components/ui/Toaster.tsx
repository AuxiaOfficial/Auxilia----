import { useEffect } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useUiStore } from '@/store/uiStore'

/** 单条轻提示：不加图标、不加边框，只在底部浮一行字 */
export default function Toaster(): React.ReactElement {
  const toast = useUiStore((s) => s.toast)
  const dismiss = useUiStore((s) => s.dismissToast)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(dismiss, 2600)
    return () => clearTimeout(t)
  }, [toast, dismiss])

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center">
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
            className="pointer-events-auto rounded-full px-4 py-2 text-[13px]"
            style={{
              background: 'var(--surface-2)',
              color: toast.tone === 'danger' ? 'var(--danger)' : 'var(--text-1)',
            }}
          >
            {toast.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
