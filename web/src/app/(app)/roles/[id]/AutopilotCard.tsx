'use client'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Lock, Zap } from 'lucide-react'
import { setAutopilotAction } from './ops'
import { Button, Card, Notice } from '@/components/ui'

export function AutopilotCard({ roleId, on, unlocked, canTurnOn }: { roleId: string; on: boolean; unlocked: boolean; canTurnOn: boolean }) {
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  const toggle = () =>
    start(async () => {
      const r = await setAutopilotAction(roleId, !on)
      setMsg(r.error ? { tone: 'danger', text: r.error } : { tone: 'success', text: r.ok! })
    })
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        {unlocked ? <Zap size={16} className={on ? 'text-accent' : 'text-muted'} /> : <Lock size={16} className="text-faint" />}
        <p className="text-sm font-semibold">Autopilot {on ? 'is on' : 'is off'}</p>
      </div>
      <p className="mt-1 text-[13px] text-muted">
        {on
          ? 'Shortlists, invitations, reminders and scoring happen on their own. You hear from it when a round with a person is ready to schedule.'
          : unlocked
            ? 'Turn it on and HireEasy shortlists and sends invitations without waiting for you. Until then, each cut waits for you to apply it.'
            : 'Unlocks once the AI agrees with your own judgement on a sample of applicants. Check again whenever the answer keys change.'}
      </p>
      <div className="mt-3">
        {unlocked && !on && !canTurnOn ? (
          <p className="text-[13px] text-faint">HR can turn it on.</p>
        ) : unlocked ? (
          <Button variant={on ? 'secondary' : 'primary'} onClick={toggle} disabled={pending}>{on ? 'Turn off' : 'Turn on autopilot'}</Button>
        ) : (
          <Link href={`/roles/${roleId}/calibration`} className="text-[13px] font-medium text-accent">Go to calibration →</Link>
        )}
      </div>
      {msg && <Notice tone={msg.tone} className="mt-3">{msg.text}</Notice>}
    </Card>
  )
}
