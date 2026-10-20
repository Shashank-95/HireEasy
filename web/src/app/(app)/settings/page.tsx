import type { Metadata } from 'next'
import { canManageRoles, requireMe } from '@/lib/auth'
import { db } from '@/lib/supabase/server'
import { googleConfigured, googleConnection } from '@/lib/google'
import { hasGemini, hasGroq } from '@/lib/ai/providers'
import { DEFAULT_TEMPLATES, TEMPLATE_INFO, TEMPLATE_KEYS, type EmailTemplate, type TemplateKey } from '@/lib/email/templates'
import { Badge, ButtonLink, Card, CardHeader, Notice, PageHeader } from '@/components/ui'
import { OrgForm, TemplateEditor, TeamRow, DisconnectGoogle } from './controls'

export const metadata: Metadata = { title: 'Settings' }

const GOOGLE_MSG: Record<string, { tone: 'success' | 'danger' | 'warn'; text: string }> = {
  connected: { tone: 'success', text: 'Google connected. Emails and Meet invites will be sent from this account.' },
  denied: { tone: 'warn', text: 'Google connection was cancelled.' },
  expired: { tone: 'warn', text: 'That took too long — please try connecting again.' },
  invalid: { tone: 'danger', text: 'The Google response was invalid. Please try again.' },
  forbidden: { tone: 'danger', text: 'Only HR can connect Google.' },
  not_configured: { tone: 'warn', text: 'Google sign-in isn\'t set up on the server yet — see the steps below.' },
}

export default async function SettingsPage({ searchParams }: PageProps<'/settings'>) {
  const me = await requireMe()
  const sp = await searchParams
  const manage = canManageRoles(me)
  const [{ data: org }, google, { data: team }] = await Promise.all([
    db().from('org_settings').select('*').single(),
    googleConnection(),
    db().from('profiles').select('id, email, full_name, app_role, created_at').order('created_at'),
  ])
  const flash = typeof sp.google === 'string' ? (sp.google === 'error' ? { tone: 'danger' as const, text: String(sp.msg ?? 'Google connection failed.') } : GOOGLE_MSG[sp.google]) : null
  const templates = (org?.email_templates ?? {}) as Partial<Record<TemplateKey, EmailTemplate>>
  const appUrl = process.env.NEXT_PUBLIC_APP_URL

  return (
    <>
      <PageHeader title="Settings" description="Company details, email sending, AI and your team." />
      {!manage && <Notice tone="info" className="mb-6">You can see these settings; only HR and admins can change them.</Notice>}
      {flash && <Notice tone={flash.tone} className="mb-6">{flash.text}</Notice>}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Company and test mode" description="Used in every email to candidates." />
          <div className="p-5">
            <OrgForm
              disabled={!manage}
              initial={{ company_name: org?.company_name ?? '', about_company: org?.about_company ?? '', sender_name: org?.sender_name ?? 'Hiring Team', test_mode: !!org?.test_mode, test_email: org?.test_email ?? '' }}
            />
          </div>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Google (email and Meet)" description="Emails go out from this account, and interviews with people get Google Meet links. Only “send email” and “calendar events” access is requested — HireEasy can't read your mail." />
            <div className="space-y-3 p-5 text-[13px]">
              {google ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p>Connected as <span className="font-medium">{google.email}</span></p>
                  {manage && <div className="flex gap-2"><ButtonLink href="/api/google/connect" variant="secondary" size="sm">Reconnect</ButtonLink><DisconnectGoogle /></div>}
                </div>
              ) : googleConfigured() ? (
                manage ? <ButtonLink href="/api/google/connect">Connect Google</ButtonLink> : <p className="text-muted">Ask HR to connect Google.</p>
              ) : (
                <Notice tone="warn" title="One-time setup on the server">
                  <ol className="mt-1 list-decimal space-y-1 pl-4">
                    <li>In Google Cloud Console create a project, enable the <b>Gmail API</b> and <b>Google Calendar API</b>.</li>
                    <li>OAuth consent screen (Google Auth Platform): External, add your email as a test user, add scopes gmail.send and calendar.events. In <b>Testing</b> the connection lasts 7 days, then you click Reconnect here; <b>Publish app</b> removes that limit but needs a public home page and privacy policy.</li>
                    <li>Credentials → Create OAuth client ID → Web application. Authorised redirect URI: <code className="break-all">{appUrl}/api/google/callback</code></li>
                    <li>Put the client ID and secret in the server’s GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, restart, and come back here.</li>
                  </ol>
                </Notice>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="AI" description="Free tiers only. Screening uses Gemini; Groq gives second opinions on close calls, follow-up questions and transcription." />
            <ul className="divide-y divide-line text-[13px]">
              {[
                { name: 'Gemini (screening, resumes, interview scoring)', ok: hasGemini(), where: 'aistudio.google.com/apikey → GEMINI_API_KEY' },
                { name: 'Groq (second opinions, follow-ups, transcription)', ok: hasGroq(), where: 'console.groq.com/keys → GROQ_API_KEY' },
              ].map(k => (
                <li key={k.name} className="flex items-start justify-between gap-3 px-5 py-3">
                  <div><p className="font-medium">{k.name}</p>{!k.ok && <p className="text-muted">Free key from {k.where}</p>}</div>
                  <Badge tone={k.ok ? 'success' : 'warn'}>{k.ok ? 'Connected' : 'Missing'}</Badge>
                </li>
              ))}
            </ul>
            {!hasGemini() && hasGroq() && <p className="px-5 pb-4 text-[12px] text-muted">Without Gemini, Groq does the screening too — within its smaller daily limit.</p>}
          </Card>
        </div>
      </div>

      <h2 className="mb-1 mt-10 text-lg font-semibold">Emails to candidates</h2>
      <p className="mb-4 max-w-2xl text-sm text-muted">Edit the wording here. Words in double curly braces are filled in for each candidate. Every email is logged on the role’s Emails tab.</p>
      <div className="grid gap-6 lg:grid-cols-2">
        {TEMPLATE_KEYS.map(k => (
          <TemplateEditor key={`${k}:${templates[k] ? 'custom' : 'default'}:${(templates[k] ?? DEFAULT_TEMPLATES[k]).subject}`} templateKey={k} info={TEMPLATE_INFO[k]} initial={templates[k] ?? DEFAULT_TEMPLATES[k]} customised={!!templates[k]} disabled={!manage} company={org?.company_name || 'Your company'} sender={org?.sender_name || 'Hiring Team'} />
        ))}
      </div>

      <h2 className="mb-1 mt-10 text-lg font-semibold">Team</h2>
      <p className="mb-4 max-w-2xl text-sm text-muted">Everyone signs up at this site. HR runs roles; hiring managers see the roles they’re added to; admins manage the team.</p>
      <Card className="divide-y divide-line">
        {(team ?? []).map(t => <TeamRow key={t.id} user={{ id: t.id, email: t.email, name: t.full_name, role: t.app_role }} canEdit={me.appRole === 'admin'} isMe={t.id === me.id} />)}
      </Card>
    </>
  )
}
