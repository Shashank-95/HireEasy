'use client'
import { useState, useTransition } from 'react'
import { setRoleStatus } from '../actions'
import { Button, Notice } from '@/components/ui'

export function RoleStatusControl({ roleId, status, blocked }: { roleId: string; status: string; blocked: number }) {
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<{ tone: 'danger' | 'success'; text: string } | null>(null)
  const run = (s: 'active' | 'paused' | 'draft') =>
    start(async () => {
      const r = await setRoleStatus(roleId, s)
      setMsg(r.error ? { tone: 'danger', text: r.error } : r.ok ? { tone: 'success', text: r.ok } : null)
    })

  if (status === 'closed') return null
  return (
    <div className="flex flex-col items-end gap-2">
      {status === 'active' ? (
        <Button variant="secondary" disabled={pending} onClick={() => run('paused')}>Pause role</Button>
      ) : (
        <Button disabled={pending} onClick={() => run('active')} title={blocked ? 'Finish setup first' : undefined}>
          {status === 'paused' ? 'Resume role' : 'Go live'}
        </Button>
      )}
      {msg && <Notice tone={msg.tone} className="max-w-sm">{msg.text}</Notice>}
    </div>
  )
}
