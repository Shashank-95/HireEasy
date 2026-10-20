'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { labelAction, lockCalibrationAction, rescoreCalibrationAction, startCalibrationAction } from '../ops'
import type { Band } from '@/lib/data/calibration'
import { Button, cx, Notice, Textarea } from '@/components/ui'

function useRun() {
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  const run = (fn: () => Promise<{ error?: string; ok?: string }>, after?: () => void) =>
    start(async () => {
      const r = await fn()
      setMsg(r.error ? { tone: 'danger', text: r.error } : r.ok ? { tone: 'success', text: r.ok } : null)
      if (!r.error) after?.()
    })
  return { pending, msg, run }
}

export function StartCalibration({ roleId }: { roleId: string }) {
  const { pending, msg, run } = useRun()
  return (
    <div className="mt-4 space-y-3">
      <Button disabled={pending} onClick={() => run(() => startCalibrationAction(roleId))}>{pending ? 'Picking the sample…' : 'Start calibration'}</Button>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
    </div>
  )
}

const OPTIONS: { band: Band; label: string; hint: string }[] = [
  { band: 'strong', label: 'Strong', hint: 'I want to interview them' },
  { band: 'possible', label: 'Possible', hint: 'Borderline — could go either way' },
  { band: 'no', label: 'Not a fit', hint: 'I would not take them forward' },
]

export function LabelForm({ roleId, candidateId, initial, initialNote, nextHref }: { roleId: string; candidateId: string; initial: Band | null; initialNote: string; nextHref: string }) {
  const router = useRouter()
  const [band, setBand] = useState<Band | null>(initial)
  const [note, setNote] = useState(initialNote)
  const { pending, msg, run } = useRun()
  return (
    <div className="space-y-3">
      <p className="text-[13px] font-medium">Your call</p>
      <div className="grid gap-2 sm:grid-cols-3">
        {OPTIONS.map(o => (
          <button key={o.band} type="button" aria-pressed={band === o.band} onClick={() => setBand(o.band)} className={cx('rounded-lg border px-3 py-2 text-left', band === o.band ? 'border-accent bg-accent-soft' : 'border-line hover:bg-surface-2')}>
            <span className="block text-sm font-medium">{o.label}</span>
            <span className="block text-[12px] text-muted">{o.hint}</span>
          </button>
        ))}
      </div>
      <Textarea rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="Why? (optional — it becomes a worked example for the AI)" />
      <div className="flex justify-end">
        <Button disabled={!band || pending} onClick={() => run(() => labelAction(roleId, candidateId, band!, note), () => router.push(nextHref))}>{pending ? 'Saving…' : 'Save and next'}</Button>
      </div>
      {msg?.tone === 'danger' && <Notice tone="danger">{msg.text}</Notice>}
    </div>
  )
}

export function CalibrationActions({ roleId, canLock }: { roleId: string; canLock: boolean }) {
  const { pending, msg, run } = useRun()
  return (
    <div className="mt-4 space-y-2">
      {canLock && <Button className="w-full" disabled={pending} onClick={() => run(() => lockCalibrationAction(roleId))}>Lock answer keys and unlock autopilot</Button>}
      <Button className="w-full" variant="secondary" disabled={pending} onClick={() => run(() => rescoreCalibrationAction(roleId))}>{pending ? 'Working…' : 'Re-score with current answer keys'}</Button>
      <p className="text-[12px] text-faint">Re-scoring uses your labels as worked examples. It takes up to a minute.</p>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
    </div>
  )
}
