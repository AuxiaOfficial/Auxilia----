import { useEffect, useState } from 'react'
import { FolderOpen } from 'lucide-react'
import { call, isDesktop } from '@/lib/ipc'
import { reviewRepo, settingsRepo } from '@/lib/db'
import { playChime } from '@/lib/sound'
import { useSettingsStore, DEFAULT_REVIEW_QUESTIONS } from '@/store/settingsStore'
import { useUiStore } from '@/store/uiStore'
import ViewHeader from '@/components/ui/ViewHeader'
import Toggle from '@/components/ui/Toggle'

const FLASH_OPTIONS = [
  { key: 'ripple', label: '水波扩散', hint: '从屏幕上方中点轻轻荡开' },
  { key: 'plain', label: '整屏微亮', hint: '整块屏幕亮一下，很短' },
  { key: 'off', label: '不闪', hint: '只弹窗 / 只响铃' },
] as const

function toAccelerator(e: KeyboardEvent): string | null {
  const parts: string[] = []
  if (e.ctrlKey) parts.push('Ctrl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  if (e.metaKey) parts.push('Super')
  const ignored = [
    'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight',
    'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight',
  ]
  if (ignored.includes(e.code)) return null
  if (!/^(Key[A-Z]|Digit[0-9]|F\d{1,2}|Space|Enter|Tab|Backquote|Minus|Equal|BracketLeft|BracketRight|Backslash|Semicolon|Quote|Comma|Period|Slash|ArrowUp|ArrowDown|ArrowLeft|ArrowRight)$/.test(e.code)) {
    return null
  }
  if (parts.length === 0) return null
  parts.push(e.code)
  return parts.join('+')
}

const pretty = (a: string): string =>
  a.replace(/Key([A-Z])/g, '$1').replace(/Digit(\d)/g, '$1').replace(/\+/g, ' + ')

export default function SettingsView(): React.ReactElement {
  const notify = useUiStore((s) => s.notify)
  const settings = useSettingsStore()

  const [hotkey, setHotkey] = useState('Shift + Space')
  const [recording, setRecording] = useState(false)
  const [dir, setDir] = useState(settings.reviewDir)

  useEffect(() => {
    if (!isDesktop) return
    void call<string>('hotkey_get').then((v) => setHotkey(pretty(v))).catch(() => undefined)
    void reviewRepo.defaultDir().then((d) => setDir(settings.reviewDir || d)).catch(() => undefined)
  }, [settings.reviewDir])

  useEffect(() => {
    if (!recording) return
    const onKey = (e: KeyboardEvent): void => {
      e.preventDefault()
      if (e.key === 'Escape') {
        setRecording(false)
        return
      }
      const accel = toAccelerator(e)
      if (!accel) return
      void call('hotkey_set', { accelerator: accel })
        .then(() => {
          setHotkey(pretty(accel))
          setRecording(false)
          notify('快捷键已更新')
        })
        .catch((err) => notify(err instanceof Error ? err.message : '这个组合注册不上，换一个', 'danger'))
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [recording, notify])

  const pickDir = async (): Promise<void> => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const picked = await open({ directory: true, multiple: false, title: '选择复盘 markdown 保存目录' })
      if (typeof picked === 'string') {
        await settings.patch({ reviewDir: picked })
        setDir(picked)
        notify('目录已更新')
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : '打开目录选择器失败', 'danger')
    }
  }

  const setQuestionsCount = (n: number): void => {
    const current = settings.reviewQuestions
    const next =
      n <= current.length
        ? current.slice(0, n)
        : [...current, ...DEFAULT_REVIEW_QUESTIONS.slice(current.length, n)]
    void settings.patch({ reviewQuestions: next })
  }

  return (
    <div className="h-full overflow-y-auto px-10 pb-16">
      <div className="mx-auto w-full max-w-[720px] pt-2">
        <ViewHeader />
        <h1 className="mt-2 text-[24px] font-medium tracking-tight text-text-1">设置</h1>

        <Section title="复盘">
          <Toggle
            label="任务结束后做复盘"
            hint="关掉后，结束即结算，不再提问"
            value={settings.reviewEnabled}
            onChange={(v) => void settings.patch({ reviewEnabled: v })}
          />
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-[13.5px] text-text-1">问几个问题</p>
              <p className="mt-0.5 text-[11px] text-text-dim">越少越容易坚持</p>
            </div>
            <div className="flex items-center gap-1.5">
              {[0, 1, 2, 3].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setQuestionsCount(n)}
                  className="h-8 w-8 rounded-full text-[12px] transition-colors duration-fast"
                  style={{
                    background: settings.reviewQuestions.length === n ? 'var(--accent)' : 'var(--surface-2)',
                    color: settings.reviewQuestions.length === n ? 'var(--accent-fg)' : 'var(--text-2)',
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          {settings.reviewQuestions.map((q, i) => (
            <div key={i} className="px-4 pb-2">
              <input
                value={q}
                onChange={(e) => {
                  const next = [...settings.reviewQuestions]
                  next[i] = e.target.value
                  void settings.patch({ reviewQuestions: next })
                }}
                className="w-full resize-none rounded-sm px-3 py-2 text-[12.5px] text-text-1"
                style={{ background: 'var(--surface-1)' }}
                placeholder={`第 ${i + 1} 问`}
              />
            </div>
          ))}
        </Section>

        <Section title="提醒">
          <Toggle
            label="完成时响一声"
            hint="很轻的两声钟片音，可用音量键调小"
            value={settings.sound}
            onChange={(v) => {
              void settings.patch({ sound: v })
              if (v) playChime()
            }}
          />
          <div className="px-4 py-3">
            <p className="text-[13.5px] text-text-1">屏幕提示</p>
            <div className="mt-2 flex flex-col gap-1">
              {FLASH_OPTIONS.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => {
                    void settings.patch({ flashStyle: o.key })
                    if (o.key !== 'off' && isDesktop) void call('ui_flash')
                  }}
                  className="flex items-center justify-between rounded-sm px-3 py-2 text-left transition-colors duration-fast"
                  style={{ background: settings.flashStyle === o.key ? 'var(--surface-2)' : 'transparent' }}
                >
                  <span className="text-[12.5px] text-text-1">{o.label}</span>
                  <span className="text-[11px] text-text-dim">{o.hint}</span>
                </button>
              ))}
            </div>
          </div>
        </Section>

        <Section title="快捷键">
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-[13.5px] text-text-1">唤起 / 收起主窗口</p>
              <p className="mt-0.5 text-[11px] text-text-dim">在任何软件里都能按</p>
            </div>
            <div className="flex items-center gap-2">
              <span
                className="rounded-sm px-3 py-1.5 text-[12.5px] text-text-1"
                style={{ background: 'var(--surface-2)' }}
              >
                {recording ? '按下组合键…' : hotkey}
              </span>
              <button
                type="button"
                onClick={() => setRecording(true)}
                className="text-[12px] text-text-2 hover:text-text-1"
              >
                改
              </button>
            </div>
          </div>
        </Section>

        <Section title="数据">
          <button
            type="button"
            onClick={() => void pickDir()}
            className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors duration-fast hover:bg-surface-2"
          >
            <span className="flex items-center gap-2 text-[13.5px] text-text-1">
              <FolderOpen size={13} strokeWidth={1.6} />
              复盘 markdown 保存目录
            </span>
            <span className="ml-4 max-w-[320px] truncate text-[11px] text-text-dim">{dir || '默认'}</span>
          </button>
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-[13.5px] text-text-1">开机自启动</p>
              <p className="mt-0.5 text-[11px] text-text-dim">启动后直接待在托盘，不弹窗口</p>
            </div>
            <AutostartToggle />
          </div>
        </Section>

        <p className="mt-10 px-1 text-[11px] leading-relaxed text-text-dim">
          数据都存在 SQLite（%APPDATA%\com.auxilia.desktop\auxilia.db），卸载软件不会删。
        </p>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }): React.ReactElement {
  return (
    <section className="mt-8">
      <p className="mb-2 px-1 text-[11px] uppercase tracking-[0.14em] text-text-2">{title}</p>
      <div className="flex flex-col rounded-md" style={{ background: 'var(--panel-tint)' }}>
        {children}
      </div>
    </section>
  )
}

/** 开机自启由 Rust 侧插件接管，这里只读写 settings 里的开关 */
function AutostartToggle(): React.ReactElement {
  const [on, setOn] = useState(true)
  const notify = useUiStore((s) => s.notify)

  useEffect(() => {
    void settingsRepo.getBool('autostart', true).then(setOn)
  }, [])

  return (
    <Toggle
      label=""
      value={on}
      onChange={(v) => {
        setOn(v)
        void settingsRepo
          .set('autostart', v ? '1' : '0')
          .then(() => notify(v ? '下次开机自动启动' : '已关闭开机自启'))
      }}
    />
  )
}
