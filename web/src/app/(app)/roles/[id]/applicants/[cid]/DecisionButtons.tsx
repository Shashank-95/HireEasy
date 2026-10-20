'use client'
import { useState, useTransition } from 'react'
import { decideAction } from '../actions'
import { Button, Card, Field, Notice, Textarea } from '@/components/ui'

type Action = 'restore' | 'stop' | 'advance'

/**
 * The human override. Every automated decision can be reversed here, and the
 * reason is recorded so the history shows who changed what and why.
 */
export function DecisionButtons({ roleId, candidateId, status, stage, guaranteed = false }: { roleId: string; candidateId: string; status: string; stage: string; guaranteed?: boolean }) {
  const [open, setOpen] = useState<Action | null>(null)
  const [reason, setReason] = useState('')
  const [msg, setMsg] = useState<{ tone: 'danger' | 'success'; text: string } | null>(null)
  const [pending, start] = useTransition()

  const options: { action: Action; label: string; variant: 'primary' | 'secondary' | 'danger'; hint: string }[] = []
  if (status === 'out') options.push({ action: 'restore', label: 'Restore', variant: 'primary', hint: 'Brings them back and moves them to the next step.' })
  if (status === 'review') options.push({ action: 'advance', label: 'Approve and move on', variant: 'primary', hint: 'Clears the hold and moves them to the next step.' })
  if (status === 'active' && stage !== 'eligibility' && !guaranteed)
    options.push({ action: 'advance', label: 'Guarantee a place', variant: 'secondary', hint: 'They will move forward at the next cut, whatever their score.' })
  if (status === 'active' || status === 'review') options.push({ action: 'stop', label: 'Stop', variant: 'danger', hint: 'Takes them out of the process. You can restore them later.' })

  if (!options.length && !guaranteed) return null
  const current = options.find(o => o.action === open)

  const submit = () =>
    start(async () => {
      if (!open) return
      const r = await decideAction(roleId, candidateId, open, reason)
      setMsg(r.error ? { tone: 'danger', text: r.error } : { tone: 'success', text: r.ok ?? 'Done.' })
      if (!r.error) {
        setOpen(null)
        setReason('')
      }
    })

  return (
    <div className="w-full space-y-2 lg:w-80">
      {guaranteed && <p className="rounded-lg bg-success-soft px-3 py-2 text-[13px] text-success">Place guaranteed — they move on when the cut is applied, whatever their score.</p>}
      {!open && (
        <div className="flex flex-wrap gap-2 lg:justify-end">
          {options.map(o => <Button key={o.action} variant={o.variant} onClick={() => { setOpen(o.action); setMsg(null) }}>{o.label}</Button>)}
        </div>
      )}
      {current && (
        <Card className="space-y-3 p-4">
          <p className="text-sm font-medium">{current.label}</p>
          <p className="text-[12px] text-muted">{current.hint}</p>
          <Field label="Reason (saved in the history)">
            <Textarea rows={2} value={reason} onChange={e => setReason(e.target.value)} placeholder={open === 'stop' ? 'e.g. Already hired elsewhere' : 'e.g. Strong portfolio despite salary ask'} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" disabled={pending} onClick={() => setOpen(null)}>Cancel</Button>
            <Button variant={current.variant === 'danger' ? 'danger' : 'primary'} onClick={submit} disabled={pending}>{pending ? 'Saving…' : `Confirm`}</Button>
          </div>
        </Card>
      )}
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
    </div>
  )
}
