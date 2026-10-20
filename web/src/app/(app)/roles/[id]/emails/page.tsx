import type { Metadata } from 'next'
import { db } from '@/lib/supabase/server'
import { getRoleForPage } from '@/lib/data/roles'
import { googleConnection } from '@/lib/google'
import { TEMPLATE_INFO, type TemplateKey } from '@/lib/email/templates'
import { Badge, Card, EmptyState, Notice } from '@/components/ui'
import { SendNow, Retry } from './controls'

export const metadata: Metadata = { title: 'Emails' }

const TONE = { queued: 'neutral', sending: 'accent', sent: 'success', failed: 'danger' } as const

export default async function EmailsPage({ params }: PageProps<'/roles/[id]/emails'>) {
  const { id } = await params
  await getRoleForPage(id)
  const [{ data: mail }, google, { data: org }] = await Promise.all([
    db().from('outbox').select('id, kind, intended_to, actual_to, test_mode, subject, text_body, status, error, created_at, sent_at').eq('role_id', id).order('created_at', { ascending: false }).limit(300),
    googleConnection(),
    db().from('org_settings').select('test_mode, test_email').single(),
  ])
  const queued = (mail ?? []).filter(m => m.status === 'queued').length

  return (
    <div className="space-y-4">
      {org?.test_mode && <Notice tone="warn" title="Test mode is on">Every email goes to {org.test_email || '(no test address set)'} instead of the candidate. The subject shows who it was meant for. Turn it off in Settings when you’re ready to go live.</Notice>}
      {!google && <Notice tone="warn" title="Google isn't connected">Emails are queued but can’t be sent until you connect Google in Settings.</Notice>}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">{mail?.length ?? 0} emails · {queued} waiting to send</p>
        {queued > 0 && google && <SendNow roleId={id} />}
      </div>
      {!mail?.length ? (
        <EmptyState title="No emails yet" description="Invitations, reminders and interview confirmations for this role will appear here, with exactly what each candidate received." />
      ) : (
        <Card className="divide-y divide-line">
          {mail.map(m => (
            <details key={m.id} className="group px-5 py-3">
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
                <Badge tone={TONE[m.status as keyof typeof TONE]}>{m.status}</Badge>
                <span className="font-medium">{TEMPLATE_INFO[m.kind as TemplateKey]?.label ?? m.kind}</span>
                <span className="text-muted">to {m.intended_to}</span>
                {m.test_mode && <span className="text-[12px] text-warn">→ {m.status === 'sent' ? 'sent to' : m.status === 'cancelled' ? 'was going to' : 'will go to'} {m.actual_to} (test mode)</span>}
                <span className="ml-auto text-[12px] text-faint">{new Date(m.sent_at ?? m.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}</span>
              </summary>
              <div className="mt-3 space-y-2 text-[13px]">
                <p><span className="text-faint">Subject:</span> {m.subject}</p>
                <pre className="whitespace-pre-wrap rounded-lg bg-surface-2 p-3 font-sans text-muted">{m.text_body}</pre>
                {m.error && <Notice tone="danger">{m.error}</Notice>}
                {m.status === 'failed' && <Retry roleId={id} emailId={m.id} />}
              </div>
            </details>
          ))}
        </Card>
      )}
    </div>
  )
}
