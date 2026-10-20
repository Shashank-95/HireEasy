'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Play } from 'lucide-react'
import { runNowAction } from './ops'
import type { TickResult } from '@/lib/pipeline/engine'
import { Button, Card, CardHeader, Notice } from '@/components/ui'

const MODEL_LABEL: Record<string, string> = {
  'openai/gpt-oss-120b': 'Groq 120B (second opinion)',
  'openai/gpt-oss-20b': 'Groq 20B (follow-ups)',
  'whisper-large-v3-turbo': 'Whisper (transcription)',
}

/** "gemini-3.5-flash-lite" → "Gemini 3.5 Flash-Lite" */
const geminiName = (model: string) => model.replace(/^gemini-/, 'Gemini ').replace(/-it$/, '').replace(/flash-lite/, 'Flash-Lite').replace(/flash/, 'Flash').replace(/pro/, 'Pro').replace(/-/g, ' ')
function modelLabel(model: string, chainIndex: number) {
  if (chainIndex < 0) return MODEL_LABEL[model] ?? model
  return `${geminiName(model)} (${chainIndex === 0 ? 'screening' : `fallback ${chainIndex}`})`
}

const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

function describe(r: TickResult): string {
  if (!r.ran) return r.reason ?? 'Nothing to do.'
  const parts = [
    r.screened && `${r.screened} screened`,
    r.resumes && `${n(r.resumes, 'resume', 'resumes')} read`,
    r.invited && `${r.invited} invited`,
    r.scored && `${n(r.scored, 'interview', 'interviews')} scored`,
    r.emails.sent && `${n(r.emails.sent, 'email', 'emails')} sent`,
    ...r.cuts,
  ].filter(Boolean)
  if (parts.length) return parts.join(' · ') + (r.waiting ? ' — then paused (see below).' : '')
  if (r.waiting) return 'Nothing processed — paused until the free AI is available again.'
  if (r.errors.length) return 'Nothing processed — see the problem below.'
  if (r.pendingCuts.length) return 'Everyone at this stage is scored — the shortlist is ready on the Interviews tab.'
  return 'Up to date — nothing new to process.'
}

export function EngineCard({ roleId, live, lastRun, quota }: { roleId: string; live: boolean; lastRun: { at: string; state: string; progress: Record<string, unknown> } | null; quota: { model: string; used: number; limit: number; chainIndex: number }[] }) {
  const router = useRouter()
  const [running, setRunning] = useState(false)
  const [auto, setAuto] = useState(false)
  const [last, setLast] = useState<TickResult | null>((lastRun?.progress as unknown as TickResult) ?? null)
  const [error, setError] = useState<string | null>(null)
  const busy = useRef(false)

  const run = useCallback(async () => {
    if (busy.current) return
    busy.current = true
    setRunning(true)
    setError(null)
    try {
      const r = await runNowAction(roleId)
      if (r.error) setError(r.error)
      if (r.result) setLast(r.result)
      return r.result
    } catch {
      setError('Could not reach the server. It will try again on its own.')
      return undefined
    } finally {
      setRunning(false)
      busy.current = false
      router.refresh()
    }
  }, [roleId, router])

  // While this page is open, keep the role moving (the server cron does this when it's closed)
  useEffect(() => {
    if (!auto || !live) return
    let stop = false
    const loop = async () => {
      while (!stop) {
        const r = await run()
        const idle = r && r.ran && !r.screened && !r.resumes && !r.invited && !r.scored && !r.emails.sent && !r.cuts.length
        await new Promise(res => setTimeout(res, r?.waiting ? 60_000 : idle ? 30_000 : 3_000))
      }
    }
    loop()
    return () => {
      stop = true
    }
  }, [auto, live, run])

  return (
    <Card>
      <CardHeader
        title="Processing"
        description="HireEasy works through applicants in small batches to stay inside the free AI limits. Once deployed it runs every minute on its own."
        action={
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-[12px] text-muted">
              <input type="checkbox" checked={auto} onChange={e => setAuto(e.target.checked)} disabled={!live} className="accent-[var(--accent)]" />
              Keep running
            </label>
            <Button size="sm" onClick={run} disabled={running || !live}><Play size={14} /> {running ? 'Working…' : 'Run now'}</Button>
          </div>
        }
      />
      <div className="space-y-3 px-5 py-4">
        {!live && <Notice tone="info">Go live to start screening. Until then nothing is scored or sent.</Notice>}
        {last && (
          <p className="text-[13px]">
            <span className="text-muted">Last run{lastRun ? ` · ${new Date(lastRun.at).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' })}` : ''}:</span> {describe(last)}
          </p>
        )}
        {last?.waiting && <Notice tone="warn" title="Paused — waiting for the free AI">{last.waiting}</Notice>}
        {last?.emails?.blocked && <Notice tone="warn" title="Emails are waiting">{last.emails.blocked}</Notice>}
        {last?.errors?.length ? <Notice tone="danger" title="Some items failed and will be retried">{last.errors.slice(0, 3).join(' · ')}</Notice> : null}
        {error && <Notice tone="danger">{error}</Notice>}
        <div>
          <p className="mb-2 text-[12px] font-medium text-muted">Free AI used today</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {quota.map(q => (
              <div key={q.model}>
                <div className="flex justify-between text-[12px]"><span title={q.model}>{modelLabel(q.model, q.chainIndex)}</span><span className="tabular-nums text-faint">{q.used}/{q.limit}</span></div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line"><div className="h-full bg-accent" style={{ width: `${Math.min(100, (q.used / q.limit) * 100)}%` }} /></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  )
}
