'use client'
import { useState, useTransition } from 'react'
import { closeRoleAction } from './ops'
import { Button, Card, Notice } from '@/components/ui'

export function CloseRole({ roleId, notHired }: { roleId: string; notHired: number }) {
  const [open, setOpen] = useState(false)
  const [send, setSend] = useState(true)
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  return (
    <Card className="p-5">
      <p className="text-sm font-semibold">Close the role</p>
      <p className="mt-1 text-[13px] text-muted">When the position is filled. Open interview links stop working.</p>
      {!open ? (
        <Button variant="secondary" className="mt-3" onClick={() => setOpen(true)}>Close role…</Button>
      ) : (
        <div className="mt-3 space-y-3">
          <label className="flex items-start gap-2 text-[13px]">
            <input type="checkbox" checked={send} onChange={e => setSend(e.target.checked)} className="mt-0.5 accent-[var(--accent)]" />
            <span>Send the “not moving forward” email to the {notHired} applicant{notHired === 1 ? ' who wasn’t' : 's who weren’t'} hired. You can edit it in Settings → Emails first.</span>
          </label>
          <div className="flex gap-2">
            <Button variant="ghost" disabled={pending} onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              variant="danger"
              disabled={pending}
              onClick={() => start(async () => {
                const r = await closeRoleAction(roleId, send)
                setMsg(r.error ? { tone: 'danger', text: r.error } : { tone: 'success', text: r.ok! })
              })}
            >
              {pending ? 'Closing…' : 'Close role'}
            </Button>
          </div>
        </div>
      )}
      {msg && <Notice tone={msg.tone} className="mt-3">{msg.text}</Notice>}
    </Card>
  )
}
