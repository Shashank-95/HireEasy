import 'server-only'
import { db } from '../supabase/server'
import { DEFAULT_TEMPLATES, render, toHtml, type EmailTemplate, type TemplateKey } from './templates'
import { googleConnection, GoogleNotConnected, sendGmail } from '../google'

export interface OrgSettings {
  company_name: string
  about_company: string
  test_mode: boolean
  test_email: string
  sender_name: string
  email_templates: Partial<Record<TemplateKey, EmailTemplate>>
}

export async function orgSettings(): Promise<OrgSettings> {
  const { data } = await db().from('org_settings').select('*').single()
  return data as OrgSettings
}

export const templateFor = (org: OrgSettings, key: TemplateKey): EmailTemplate => org.email_templates?.[key] ?? DEFAULT_TEMPLATES[key]

/**
 * Queue an email. In test mode the real recipient is swapped for the test
 * address here — the one place every email passes through — and both are
 * recorded. A dedupe key makes sure the same email is never queued twice.
 */
export async function queueEmail(args: {
  roleId: string | null
  candidateId: string | null
  kind: TemplateKey | 'digest' | 'hr_notice'
  to: string
  vars: Record<string, string>
  dedupeKey: string
  template?: EmailTemplate
}): Promise<'queued' | 'duplicate' | 'no_address'> {
  const org = await orgSettings()
  const to = args.to.trim()
  if (!/\S+@\S+\.\S+/.test(to)) return 'no_address'
  const t = args.template ?? templateFor(org, args.kind as TemplateKey)
  const rendered = render(t, { company: org.company_name || 'our company', sender_name: org.sender_name || 'Hiring Team', ...args.vars })
  const actual = org.test_mode ? org.test_email : to
  if (!actual) return 'no_address'
  const subject = org.test_mode ? `[TEST → ${to}] ${rendered.subject}` : rendered.subject
  const { error } = await db().from('outbox').insert({
    role_id: args.roleId,
    candidate_id: args.candidateId,
    kind: args.kind,
    intended_to: to,
    actual_to: actual,
    test_mode: org.test_mode,
    subject,
    html: toHtml(rendered.body),
    text_body: rendered.body,
    dedupe_key: args.dedupeKey,
  })
  if (error) {
    if (error.code === '23505') return 'duplicate'
    throw error
  }
  return 'queued'
}

/**
 * Send what's waiting, oldest first, one at a time (personal Gmail allows
 * about 500 a day). Claims each row before sending so two runners never send
 * the same email.
 */
export async function sendQueued(limit = 20, budgetMs = 20_000, roleId?: string): Promise<{ sent: number; failed: number; blocked?: string }> {
  const started = Date.now()
  let countQ = db().from('outbox').select('id', { count: 'exact', head: true }).eq('status', 'queued')
  if (roleId) countQ = countQ.eq('role_id', roleId)
  const { count } = await countQ
  if (!count) return { sent: 0, failed: 0 }
  if (!(await googleConnection())) return { sent: 0, failed: 0, blocked: `${count} email${count === 1 ? ' is' : 's are'} waiting. ${new GoogleNotConnected().message}` }
  const org = await orgSettings()
  // A send interrupted by a timeout leaves a row in "sending". After 15 minutes
  // it is marked failed (not re-queued: it may have gone out) so HR can retry.
  await db().from('outbox').update({ status: 'failed', error: 'Interrupted while sending. Check Gmail’s Sent folder before retrying.' }).eq('status', 'sending').lt('claimed_at', new Date(Date.now() - 15 * 60_000).toISOString())
  let listQ = db().from('outbox').select('id').eq('status', 'queued')
  if (roleId) listQ = listQ.eq('role_id', roleId)
  const { data } = await listQ.order('created_at').limit(limit)
  let sent = 0
  let failed = 0
  for (const { id } of data ?? []) {
    if (Date.now() - started > budgetMs) break
    const { data: claimed } = await db().from('outbox').update({ status: 'sending', claimed_at: new Date().toISOString() }).eq('id', id).eq('status', 'queued').select('*').maybeSingle()
    if (!claimed) continue
    // Test mode is checked again at send time: switching it on after emails
    // were queued must still keep them away from real candidates
    if (org.test_mode && !claimed.test_mode) {
      if (!org.test_email) {
        await db().from('outbox').update({ status: 'failed', error: 'Test mode is on but no test address is set in Settings.' }).eq('id', id)
        failed++
        continue
      }
      claimed.actual_to = org.test_email
      claimed.subject = `[TEST → ${claimed.intended_to}] ${claimed.subject}`
      claimed.test_mode = true
      await db().from('outbox').update({ actual_to: claimed.actual_to, subject: claimed.subject, test_mode: true }).eq('id', id)
    }
    try {
      const gid = await sendGmail({ to: claimed.actual_to, subject: claimed.subject, html: claimed.html, text: claimed.text_body, fromName: org.sender_name || 'Hiring Team' })
      await db().from('outbox').update({ status: 'sent', provider_id: gid, sent_at: new Date().toISOString(), error: null }).eq('id', id)
      sent++
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Send failed'
      await db().from('outbox').update({ status: 'failed', error: msg }).eq('id', id)
      failed++
      if (/Reconnect Google|not connected/.test(msg)) return { sent, failed, blocked: msg }
    }
  }
  return { sent, failed }
}
