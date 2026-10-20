'use server'
import { revalidatePath } from 'next/cache'
import { canManageRoles, requireMe } from '@/lib/auth'
import { db } from '@/lib/supabase/server'
import { audit } from '@/lib/data/roles'
import { TEMPLATE_KEYS, type TemplateKey } from '@/lib/email/templates'

type Res = { error?: string; ok?: string }

export async function saveOrgAction(_: Res, form: FormData): Promise<Res> {
  const me = await requireMe()
  if (!canManageRoles(me)) return { error: 'Only HR can change these settings.' }
  const testMode = form.get('test_mode') === 'on'
  const testEmail = String(form.get('test_email') ?? '').trim()
  if (testMode && !/\S+@\S+\.\S+/.test(testEmail)) return { error: 'Test mode needs a valid test email address — that\'s where every email goes while it\'s on.' }
  const { error } = await db()
    .from('org_settings')
    .update({
      company_name: String(form.get('company_name') ?? '').trim(),
      about_company: String(form.get('about_company') ?? '').trim(),
      sender_name: String(form.get('sender_name') ?? '').trim() || 'Hiring Team',
      test_mode: testMode,
      test_email: testEmail,
      updated_at: new Date().toISOString(),
    })
    .eq('id', true)
  if (error) return { error: error.message }
  await audit(null, me.id, 'org.saved', { testMode })
  revalidatePath('/', 'layout')
  return { ok: testMode ? `Saved. Test mode is on — every email goes to ${testEmail}.` : 'Saved. Test mode is OFF — emails now go to real candidates.' }
}

export async function saveTemplateAction(key: TemplateKey, subject: string, body: string, reset = false): Promise<Res> {
  const me = await requireMe()
  if (!canManageRoles(me)) return { error: 'Only HR can edit email templates.' }
  if (!TEMPLATE_KEYS.includes(key)) return { error: 'Unknown template.' }
  if (!reset && (!subject.trim() || !body.trim())) return { error: 'Subject and message can\'t be empty.' }
  const { data } = await db().from('org_settings').select('email_templates').single()
  const templates = { ...((data?.email_templates as Record<string, unknown>) ?? {}) }
  if (reset) delete templates[key]
  else templates[key] = { subject: subject.trim(), body: body.trim() }
  await db().from('org_settings').update({ email_templates: templates, updated_at: new Date().toISOString() }).eq('id', true)
  revalidatePath('/settings')
  return { ok: reset ? 'Back to the default wording.' : 'Template saved.' }
}

export async function setUserRoleAction(userId: string, role: 'hr' | 'hm' | 'admin'): Promise<Res> {
  const me = await requireMe()
  if (me.appRole !== 'admin') return { error: 'Only an admin can change team roles.' }
  if (userId === me.id && role !== 'admin') return { error: 'You can\'t remove your own admin access.' }
  await db().from('profiles').update({ app_role: role }).eq('id', userId)
  await audit(null, me.id, 'team.role_changed', { userId, role })
  revalidatePath('/settings')
  return { ok: 'Updated.' }
}

export async function disconnectGoogleAction(): Promise<Res> {
  const me = await requireMe()
  if (!canManageRoles(me)) return { error: 'Only HR can change this.' }
  await db().from('google_connections').delete().neq('user_id', '00000000-0000-0000-0000-000000000000')
  await audit(null, me.id, 'google.disconnected')
  revalidatePath('/settings')
  return { ok: 'Disconnected. Emails will wait in the outbox until Google is connected again.' }
}
