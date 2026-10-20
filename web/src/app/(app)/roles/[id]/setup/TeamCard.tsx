'use client'
import { useActionState, useTransition } from 'react'
import { addMemberAction, removeMemberAction } from '../../actions'
import { Badge, Button, Card, CardHeader, Input, Notice } from '@/components/ui'
import { KeepForm } from '@/components/KeepForm'

interface Member {
  userId: string
  role: string
  name: string
  email: string
}

export function TeamCard({ roleId, members, canEdit }: { roleId: string; members: Member[]; canEdit: boolean }) {
  const [state, action, pending] = useActionState(addMemberAction.bind(null, roleId), {})
  const [removing, start] = useTransition()
  return (
    <Card>
      <CardHeader title="Hiring team" description="Hiring managers on this role see its candidates, recordings and shortlists." />
      <ul className="divide-y divide-line">
        {members.map(m => (
          <li key={m.userId} className="flex items-center justify-between gap-3 px-5 py-2.5 text-[13px]">
            <div className="min-w-0">
              <p className="truncate font-medium">{m.name}</p>
              <p className="truncate text-muted">{m.email}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone={m.role === 'hr' ? 'accent' : 'info'}>{m.role === 'hr' ? 'HR' : 'Hiring manager'}</Badge>
              {canEdit && m.role !== 'hr' && (
                <Button variant="ghost" size="sm" disabled={removing} onClick={() => start(() => removeMemberAction(roleId, m.userId))}>Remove</Button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {canEdit && (
        <KeepForm action={action} clearAfter={state.ok} className="space-y-2 border-t border-line px-5 py-4">
          <div className="flex gap-2">
            <Input name="email" type="email" placeholder="manager@company.com" required aria-label="Hiring manager email" />
            <Button type="submit" variant="secondary" disabled={pending}>Add</Button>
          </div>
          <p className="text-[12px] text-muted">They need to have created an account here first.</p>
          {state.error && <Notice tone="danger">{state.error}</Notice>}
          {state.ok && <Notice tone="success">{state.ok}</Notice>}
        </KeepForm>
      )}
    </Card>
  )
}
