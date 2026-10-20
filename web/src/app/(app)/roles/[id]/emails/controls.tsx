'use client'
import { useState, useTransition } from 'react'
import { retryEmailAction, sendNowAction } from '../ops'
import { Button, Notice } from '@/components/ui'

export function SendNow({ roleId }: { roleId: string }) {
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  return (
    <div className="flex flex-col items-end gap-2">
      <Button size="sm" disabled={pending} onClick={() => start(async () => { const r = await sendNowAction(roleId); setMsg(r.error ? { tone: 'danger', text: r.error } : { tone: 'success', text: r.ok! }) })}>{pending ? 'Sending…' : 'Send now'}</Button>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
    </div>
  )
}

export function Retry({ roleId, emailId }: { roleId: string; emailId: string }) {
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="secondary" disabled={pending} onClick={() => start(async () => { const r = await retryEmailAction(roleId, emailId); setMsg(r.error ?? r.ok ?? null) })}>Try again</Button>
      {msg && <span className="text-[12px] text-muted">{msg}</span>}
    </div>
  )
}
