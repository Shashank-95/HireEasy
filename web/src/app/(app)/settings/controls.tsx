'use client'
import { useActionState, useMemo, useState, useTransition } from 'react'
import { disconnectGoogleAction, saveOrgAction, saveTemplateAction, setUserRoleAction } from './actions'
import { render, unknownVariables, type EmailTemplate, type TemplateKey } from '@/lib/email/templates'
import { Badge, Button, Card, CardHeader, Field, Input, Notice, Select, Textarea } from '@/components/ui'
import { KeepForm } from '@/components/KeepForm'

export function OrgForm({ initial, disabled }: { initial: { company_name: string; about_company: string; sender_name: string; test_mode: boolean; test_email: string }; disabled: boolean }) {
  const [state, action, pending] = useActionState(saveOrgAction, {})
  const [testMode, setTestMode] = useState(initial.test_mode)
  return (
    <KeepForm action={action} className="space-y-4">
      <Field label="Company name"><Input name="company_name" defaultValue={initial.company_name} disabled={disabled} placeholder="Sportskeeda" /></Field>
      <Field label="About the company" hint="Shown at the top of every job description.">
        <Textarea name="about_company" rows={4} defaultValue={initial.about_company} disabled={disabled} />
      </Field>
      <Field label="Emails are signed by" hint="e.g. “Priya, Talent team” or “Hiring Team”.">
        <Input name="sender_name" defaultValue={initial.sender_name} disabled={disabled} />
      </Field>
      <div className="rounded-lg border border-line p-4">
        <label className="flex items-start gap-3">
          <input type="checkbox" name="test_mode" checked={testMode} onChange={e => setTestMode(e.target.checked)} disabled={disabled} className="mt-1 h-4 w-4 accent-[var(--accent)]" />
          <span>
            <span className="block text-sm font-medium">Test mode</span>
            <span className="block text-[13px] text-muted">Every email — invitations, reminders, rejections, calendar invites for candidates — goes to the address below instead of the real person. Keep it on until you’ve tried the whole flow.</span>
          </span>
        </label>
        <Field label="Test email address" className="mt-3">
          <Input name="test_email" type="email" defaultValue={initial.test_email} disabled={disabled} placeholder="you@company.com" />
        </Field>
        {!testMode && <Notice tone="warn" className="mt-3">With test mode off, candidates receive real emails.</Notice>}
      </div>
      {state.error && <Notice tone="danger">{state.error}</Notice>}
      {state.ok && <Notice tone="success">{state.ok}</Notice>}
      {!disabled && <Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save'}</Button>}
    </KeepForm>
  )
}

const SAMPLE_VARS: Record<string, string> = {
  candidate_name: 'Asha',
  role_title: 'Associate Product Manager',
  round_name: 'AI round 1',
  interview_link: 'https://hireeasy.app/i/abc123',
  deadline: 'Thu, 23 Oct, 6:00 pm IST',
  minutes: '15',
  meeting_time: 'Monday 27 October, 11:00 am IST',
  meet_link: 'https://meet.google.com/abc-defg-hij',
  interviewers: 'Rahul (Product Lead)',
}

export function TemplateEditor({ templateKey, info, initial, customised, disabled, company, sender }: { templateKey: TemplateKey; info: { label: string; when: string; variables: string[] }; initial: EmailTemplate; customised: boolean; disabled: boolean; company: string; sender: string }) {
  const [t, setT] = useState(initial)
  const [preview, setPreview] = useState(false)
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  const unknown = useMemo(() => unknownVariables(t, templateKey), [t, templateKey])
  const rendered = useMemo(() => render(t, { ...SAMPLE_VARS, company, sender_name: sender }), [t, company, sender])
  return (
    <Card>
      <CardHeader title={<span className="flex items-center gap-2">{info.label}{customised && <Badge tone="accent">Edited</Badge>}</span>} description={info.when} action={<Button size="sm" variant="ghost" onClick={() => setPreview(p => !p)}>{preview ? 'Edit' : 'Preview'}</Button>} />
      <div className="space-y-3 p-5">
        {preview ? (
          <div className="rounded-lg border border-line p-4 text-[13px]">
            <p className="font-medium">{rendered.subject}</p>
            <pre className="mt-3 whitespace-pre-wrap font-sans text-muted">{rendered.body}</pre>
          </div>
        ) : (
          <>
            <Field label="Subject"><Input value={t.subject} disabled={disabled} onChange={e => setT({ ...t, subject: e.target.value })} /></Field>
            <Field label="Message"><Textarea rows={10} value={t.body} disabled={disabled} onChange={e => setT({ ...t, body: e.target.value })} /></Field>
            <p className="text-[12px] text-muted">Available: {info.variables.map(v => `{{${v}}}`).join(' ')}</p>
            {unknown.length > 0 && <Notice tone="warn">Not recognised, will be left as typed: {unknown.map(v => `{{${v}}}`).join(' ')}</Notice>}
          </>
        )}
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
        {!disabled && (
          <div className="flex justify-end gap-2">
            {customised && <Button variant="ghost" size="sm" disabled={pending} onClick={() => start(async () => { const r = await saveTemplateAction(templateKey, '', '', true); setMsg(r.error ? { tone: 'danger', text: r.error } : { tone: 'success', text: r.ok! }) })}>Reset to default</Button>}
            <Button size="sm" disabled={pending} onClick={() => start(async () => { const r = await saveTemplateAction(templateKey, t.subject, t.body); setMsg(r.error ? { tone: 'danger', text: r.error } : { tone: 'success', text: r.ok! }) })}>Save</Button>
          </div>
        )}
      </div>
    </Card>
  )
}

export function TeamRow({ user, canEdit, isMe }: { user: { id: string; email: string; name: string; role: 'hr' | 'hm' | 'admin' }; canEdit: boolean; isMe: boolean }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [role, setRole] = useState(user.role)
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-[13px]">
      <div className="min-w-0">
        <p className="truncate font-medium">{user.name || user.email}{isMe && <span className="text-faint"> (you)</span>}</p>
        <p className="truncate text-muted">{user.email}</p>
        {error && <p className="text-danger">{error}</p>}
      </div>
      {canEdit ? (
        <Select
          className="w-44"
          value={role}
          disabled={pending}
          aria-label={`Role for ${user.email}`}
          onChange={e => {
            const before = role
            const next = e.target.value as 'hr' | 'hm' | 'admin'
            setRole(next)
            start(async () => {
              const r = await setUserRoleAction(user.id, next)
              setError(r.error ?? null)
              // Refused (e.g. the last admin): show the role they still have
              if (r.error) setRole(before)
            })
          }}
        >
          <option value="admin">Admin</option>
          <option value="hr">HR</option>
          <option value="hm">Hiring manager</option>
        </Select>
      ) : (
        <Badge>{user.role === 'hm' ? 'Hiring manager' : user.role.toUpperCase()}</Badge>
      )}
    </div>
  )
}

export function DisconnectGoogle() {
  const [pending, start] = useTransition()
  return <Button variant="ghost" size="sm" disabled={pending} onClick={() => start(async () => { await disconnectGoogleAction() })}>Disconnect</Button>
}
