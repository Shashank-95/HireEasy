'use client'
import { useState, useTransition, useEffect } from 'react'
import { ExternalLink } from 'lucide-react'
import { applyCutAction, meetingOutcomeAction, previewInterviewAction, scheduleMeetingAction } from '../ops'
import { Button, Input, Notice, Textarea } from '@/components/ui'

function useAction() {
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  const run = (fn: () => Promise<{ error?: string; ok?: string }>) =>
    start(async () => {
      const r = await fn()
      setMsg(r.error ? { tone: 'danger', text: r.error } : r.ok ? { tone: 'success', text: r.ok } : null)
    })
  return { pending, msg, run }
}

export function ApplyCutButton({ roleId, stage, label }: { roleId: string; stage: string; label: string }) {
  const { pending, msg, run } = useAction()
  const [confirm, setConfirm] = useState(false)
  return (
    <div className="flex flex-col items-end gap-2">
      {confirm ? (
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" disabled={pending} onClick={() => setConfirm(false)}>Cancel</Button>
          <Button size="sm" disabled={pending} onClick={() => run(() => applyCutAction(roleId, stage))}>{pending ? 'Applying…' : 'Yes, apply and send invites'}</Button>
        </div>
      ) : (
        <Button size="sm" onClick={() => setConfirm(true)}>{label}</Button>
      )}
      {msg && <Notice tone={msg.tone} className="max-w-sm">{msg.text}</Notice>}
    </div>
  )
}

export function PreviewButton({ roleId, roundId }: { roleId: string; roundId: string }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [link, setLink] = useState<string | null>(null)
  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        size="sm"
        variant="secondary"
        disabled={pending}
        onClick={() => {
          // Open the tab during the click (Safari blocks it after an await), then point it at the link
          const tab = window.open('', '_blank')
          setError(null)
          start(async () => {
            const r = await previewInterviewAction(roleId, roundId)
            if (r.error || !r.link) {
              tab?.close()
              setError(r.error ?? 'Could not prepare the preview.')
              return
            }
            setLink(r.link)
            if (tab) {
              tab.opener = null
              tab.location.href = r.link
            }
          })
        }}
      >
        <ExternalLink size={14} /> {pending ? 'Preparing…' : 'Try this interview'}
      </Button>
      {link && <a href={link} target="_blank" rel="noreferrer" className="text-[12px] text-accent underline">Didn’t open? Open the interview</a>}
      {error && <Notice tone="danger" className="max-w-xs">{error}</Notice>}
    </div>
  )
}

/** Local date-time input value for "tomorrow at 11:00". */
function defaultSlot() {
  const d = new Date(Date.now() + 86_400_000)
  d.setHours(11, 0, 0, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function ScheduleForm({ roleId, meetingId, disabled }: { roleId: string; meetingId: string; disabled: boolean }) {
  const { pending, msg, run } = useAction()
  // "Tomorrow 11:00" in the person's own time zone — only knowable in the browser
  const [when, setWhen] = useState('')
  // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only default (local time zone)
  useEffect(() => setWhen(w => w || defaultSlot()), [])
  const [past, setPast] = useState(false)
  return (
    <div className="flex w-full flex-col gap-2 lg:w-auto lg:items-end">
      <div className="flex gap-2">
        <Input type="datetime-local" value={when} onChange={e => { setWhen(e.target.value); setPast(false) }} aria-label="Interview time" className="lg:w-56" />
        <Button disabled={pending || disabled || !when} onClick={() => { if (new Date(when).getTime() < Date.now()) return setPast(true); run(() => scheduleMeetingAction(roleId, meetingId, new Date(when).toISOString())) }}>{pending ? 'Booking…' : 'Schedule'}</Button>
      </div>
      {past ? <p className="text-[12px] text-danger">That time has already passed.</p> : <p className="text-[12px] text-faint">Agree a time with both sides first. Your local time zone.</p>}
      {msg && <Notice tone={msg.tone} className="max-w-sm">{msg.text}</Notice>}
    </div>
  )
}

export function OutcomeButtons({ roleId, meetingId }: { roleId: string; meetingId: string }) {
  const { pending, msg, run } = useAction()
  const [note, setNote] = useState('')
  const [open, setOpen] = useState(false)
  return (
    <div className="flex w-full flex-col gap-2 lg:w-80">
      {!open ? (
        <Button variant="secondary" onClick={() => setOpen(true)}>Record outcome</Button>
      ) : (
        <>
          <Textarea rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="Notes from the interview (saved in the history)" />
          <div className="flex justify-end gap-2">
            <Button variant="danger" disabled={pending} onClick={() => run(() => meetingOutcomeAction(roleId, meetingId, 'reject', note))}>Not proceeding</Button>
            <Button disabled={pending} onClick={() => run(() => meetingOutcomeAction(roleId, meetingId, 'advance', note))}>Move forward</Button>
          </div>
        </>
      )}
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
    </div>
  )
}
