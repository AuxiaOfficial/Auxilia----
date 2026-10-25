import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { FolderOpen } from 'lucide-react'
import { dayKey, formatClock, formatDuration, formatTime } from '@/lib/time'
import { runRepo, reviewRepo, statsRepo } from '@/lib/db'
import { isDesktop } from '@/lib/ipc'
import { useReviewStore } from '@/store/reviewStore'
import { useSettingsStore } from '@/store/settingsStore'
import { useUiStore } from '@/store/uiStore'
import ViewHeader from '@/components/ui/ViewHeader'
import type { Period, RunRecord } from '@/lib/types'

const LABEL: Record<Period, string> = { daily: '日复盘', weekly: '周复盘', monthly: '月复盘' }

const PROMPTS = [
  { key: 'did', q: '这段时间，实际发生了什么？', hint: '只写事实，不评价。' },
  { key: 'gap', q: '和你原本想做的，差在哪？', hint: '差量比结果更值得记。' },
  { key: 'next', q: '下一个周期，只改一件事，改什么？', hint: '一件，具体到动作。' },
] as const

export default function ReviewView(): React.ReactElement {
  const { reviews, due, refresh, save } = useReviewStore()
  const notify = useUiStore((s) => s.notify)
  const reviewDir = useSettingsStore((s) => s.reviewDir)
  const patchSettings = useSettingsStore((s) => s.patch)

  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [seconds, setSeconds] = useState(0)
  const [busy, setBusy] = useState(false)
  const [runs, setRuns] = useState<RunRecord[]>([])
  const [dirShown, setDirShown] = useState(reviewDir)
  const [range, setRange] = useState<'7' | '30' | 'all'>('30')
  const [sortBy, setSortBy] = useState<'time' | 'words'>('time')

  useEffect(() => {
    void refresh()
    void statsRepo.summary().then((s) => setSeconds(s.totalSeconds))
    void runRepo.history(50).then(setRuns)
  }, [refresh])

  useEffect(() => {
    setDirShown(reviewDir)
  }, [reviewDir])

  useEffect(() => {
    if (reviewDir || !isDesktop) return
    void reviewRepo.defaultDir().then(setDirShown).catch(() => setDirShown(''))
  }, [reviewDir])

  const period: Period = due ?? 'daily'
  const filled = PROMPTS.every((p) => (answers[p.key] ?? '').trim().length > 0)

  const markdown = [
    `# ${LABEL[period]} · ${dayKey(Date.now())}`,
    '',
    `> 累计专注 ${formatDuration(seconds)}`,
    '',
    ...PROMPTS.flatMap((p) => [`## ${p.q}`, '', (answers[p.key] ?? '').trim() || '（未填）', '']),
  ].join('\n')

  const pickDir = async (): Promise<void> => {
    if (!isDesktop) return
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const picked = await open({ directory: true, multiple: false, title: '选择复盘 markdown 保存目录' })
      if (typeof picked === 'string') {
        await patchSettings({ reviewDir: picked })
        setDirShown(picked)
        notify('复盘目录已更新')
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : '打开目录选择器失败', 'danger')
    }
  }

  const submit = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      const saved = await save(period, markdown)
      if (isDesktop) {
        try {
          const path = await reviewRepo.saveToFile(
            reviewDir,
            `${LABEL[period]}-${dayKey(Date.now())}`,
            markdown,
          )
          await reviewRepo.attachFile(saved.id, path)
          notify('复盘已归档，md 已保存')
        } catch (err) {
          notify(err instanceof Error ? `已存库，但写文件失败：${err.message}` : '已存库，但写文件失败', 'danger')
        }
      } else {
        notify('复盘已归档')
      }
      setAnswers({})
      await refresh()
    } catch (err) {
      notify(err instanceof Error ? err.message : '保存失败', 'danger')
    } finally {
      setBusy(false)
    }
  }

  const wordsOf = (r: RunRecord): number =>
    `${r.outcome}${r.reflectMoment}${r.reflectNext}`.replace(/\s/g, '').length
  const since = range === 'all' ? 0 : Date.now() - Number(range) * 86400000
  const shownRuns = runs
    .filter((r) => r.startedAt >= since)
    .sort((a, b) => (sortBy === 'words' ? wordsOf(b) - wordsOf(a) : b.startedAt - a.startedAt))

  return (
    <div className="h-full overflow-y-auto px-10 pb-16">
      <div className="mx-auto w-full max-w-[720px] pt-2">
        <ViewHeader
          extra={
            due ? (
              <span className="text-[11px] uppercase tracking-[0.14em]" style={{ color: 'var(--danger)' }}>
                {LABEL[due]} 待写
              </span>
            ) : null
          }
        />

        <h1 className="mt-2 text-[24px] font-medium tracking-tight text-text-1">复盘</h1>

        <div className="mt-6 flex flex-col gap-6">
          {PROMPTS.map((p) => (
            <div key={p.key}>
              <p className="text-[13px] text-text-1">{p.q}</p>
              <p className="mt-1 text-[11px] text-text-2">{p.hint}</p>
              <textarea
                rows={3}
                value={answers[p.key] ?? ''}
                onChange={(e) => setAnswers((a) => ({ ...a, [p.key]: e.target.value }))}
                className="mt-2 w-full resize-none rounded-md px-3 py-2.5 text-[13px] leading-relaxed text-text-1"
                style={{ background: 'var(--surface-1)' }}
              />
            </div>
          ))}
        </div>

        <div className="mt-6 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => void pickDir()}
            className="flex min-w-0 items-center gap-2 text-left text-[11px] text-text-2 transition-colors duration-fast hover:text-text-1"
          >
            <FolderOpen size={12} strokeWidth={1.6} className="shrink-0" />
            <span className="truncate">{dirShown || '选择 markdown 保存目录'}</span>
          </button>
          <button
            type="button"
            disabled={!filled || busy}
            onClick={() => void submit()}
            className="h-9 shrink-0 rounded-full px-6 text-[13px] font-medium transition-opacity duration-fast disabled:opacity-40"
            style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
          >
            {busy ? '归档中…' : '归档'}
          </button>
        </div>

        <section className="mt-14">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[11px] uppercase tracking-[0.14em] text-text-2">运行记录</p>
            <div className="flex items-center gap-1.5">
              {(['7', '30', 'all'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setRange(k)}
                  className="h-6 rounded-full px-2.5 text-[11px] transition-colors duration-fast"
                  style={{
                    background: range === k ? 'var(--surface-3)' : 'transparent',
                    color: range === k ? 'var(--text-1)' : 'var(--text-dim)',
                  }}
                >
                  {k === 'all' ? '全部' : `${k} 天`}
                </button>
              ))}
              <span className="mx-1 h-3 w-px" style={{ background: 'var(--border-strong)' }} />
              <button
                type="button"
                onClick={() => setSortBy('time')}
                className="h-6 rounded-full px-2.5 text-[11px] transition-colors duration-fast"
                style={{
                  background: sortBy === 'time' ? 'var(--surface-3)' : 'transparent',
                  color: sortBy === 'time' ? 'var(--text-1)' : 'var(--text-dim)',
                }}
              >
                按时间
              </button>
              <button
                type="button"
                onClick={() => setSortBy('words')}
                className="h-6 rounded-full px-2.5 text-[11px] transition-colors duration-fast"
                style={{
                  background: sortBy === 'words' ? 'var(--surface-3)' : 'transparent',
                  color: sortBy === 'words' ? 'var(--text-1)' : 'var(--text-dim)',
                }}
              >
                按字数
              </button>
            </div>
          </div>
          {shownRuns.length === 0 && <p className="text-[12px] text-text-2">这个区间还没有跑完过任务。</p>}
          <div className="flex flex-col">
            {shownRuns.map((r) => (
              <motion.details
                key={r.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="group rounded-md px-3 py-2.5 transition-colors duration-fast hover:bg-surface-1"
              >
                <summary className="flex cursor-default list-none items-center justify-between gap-3 text-[12.5px] text-text-2">
                  <span className="min-w-0 flex-1 truncate text-text-1">{r.title}</span>
                  <span className="shrink-0 text-[11px] text-text-dim">
                    {dayKey(r.startedAt)} {formatTime(r.startedAt)}
                  </span>
                  <span className="shrink-0 text-[11px] text-text-2">{formatClock(r.activeSeconds)}</span>
                  <span className="shrink-0 text-[11px] text-text-dim">
                    {r.result === 'completed' ? `+${r.coinEarned}` : '中止'}
                  </span>
                </summary>
                <div className="mt-2 flex flex-col gap-1.5">
                  {r.outcome && <p className="text-[12px] leading-relaxed text-text-2">差量：{r.outcome}</p>}
                  {r.reflectMoment && (
                    <p className="text-[12px] leading-relaxed text-text-2">可优化：{r.reflectMoment}</p>
                  )}
                  {r.reflectNext && (
                    <p className="text-[12px] leading-relaxed text-text-1">下次：{r.reflectNext}</p>
                  )}
                  {!r.outcome && !r.reflectMoment && !r.reflectNext && (
                    <p className="text-[12px] text-text-dim">这次跳过了复盘。</p>
                  )}
                </div>
              </motion.details>
            ))}
          </div>
        </section>

        <section className="mt-14">
          <p className="mb-3 text-[11px] uppercase tracking-[0.14em] text-text-2">历史复盘</p>
          {reviews.length === 0 && <p className="text-[12px] text-text-2">还没有写过复盘。</p>}
          <div className="flex flex-col">
            {reviews.map((r) => (
              <motion.details
                key={r.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="group rounded-md px-3 py-2.5 transition-colors duration-fast hover:bg-surface-1"
              >
                <summary className="flex cursor-default list-none items-center justify-between text-[12.5px] text-text-2">
                  <span>
                    {LABEL[r.period]} · {dayKey(r.periodEnd)}
                  </span>
                  <span className="text-[11px] text-text-dim">
                    {r.filePath ? '已写入本地' : `${r.contentMd.length} 字`}
                  </span>
                </summary>
                <pre className="mt-2 whitespace-pre-wrap text-[12px] leading-relaxed text-text-2">
                  {r.contentMd}
                </pre>
                {r.filePath && (
                  <p className="mt-2 break-all text-[10.5px] text-text-dim">{r.filePath}</p>
                )}
              </motion.details>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
