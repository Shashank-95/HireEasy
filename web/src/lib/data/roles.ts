import 'server-only'
import { db } from '../supabase/server'
import { RoleSpec, type ChangeNote } from '../templates/types'
import { productApm } from '../templates/product-apm'
import { notFound } from 'next/navigation'
import { canAccessRole, requireMe, type Me } from '../auth'

export interface RoleRow {
  id: string
  title: string
  template_id: string | null
  source_jd: string
  change_notes: ChangeNote[]
  status: 'draft' | 'active' | 'paused' | 'closed'
  autopilot: boolean
  current_version: number
  created_at: string
  updated_at: string
}

export interface RoleWithSpec extends RoleRow {
  spec: RoleSpec
  versionLocked: boolean
}

export interface TemplateRow {
  id: string
  slug: string | null
  name: string
  family: string
  description: string
  spec: RoleSpec
  change_notes: ChangeNote[]
  calibrated: boolean
  updated_at: string
}

const SEEDS = [productApm]

/** Make sure the built-in templates exist. Idempotent: matched on slug. */
export async function ensureTemplates() {
  const { data } = await db().from('templates').select('slug')
  const have = new Set((data ?? []).map(t => t.slug))
  const missing = SEEDS.filter(s => !have.has(s.id))
  if (missing.length) {
    await db().from('templates').insert(
      missing.map(s => ({ slug: s.id, name: s.name, family: s.family, description: s.description, spec: s.spec, change_notes: s.changeNotes })),
    )
  }
}

export async function listTemplates(): Promise<TemplateRow[]> {
  await ensureTemplates()
  const { data, error } = await db().from('templates').select('*').order('name')
  if (error) throw error
  return data as TemplateRow[]
}

export async function getTemplate(id: string): Promise<TemplateRow | null> {
  const { data } = await db().from('templates').select('*').eq('id', id).maybeSingle()
  return (data as TemplateRow) ?? null
}

export async function listRoles(me: Me): Promise<RoleRow[]> {
  let q = db().from('roles').select('*').order('created_at', { ascending: false })
  if (me.appRole === 'hm') {
    const { data: m } = await db().from('role_members').select('role_id').eq('user_id', me.id)
    const ids = (m ?? []).map(r => r.role_id)
    if (!ids.length) return []
    q = q.in('id', ids)
  }
  const { data, error } = await q
  if (error) throw error
  return data as RoleRow[]
}

export async function getRole(id: string): Promise<RoleWithSpec | null> {
  const { data: role } = await db().from('roles').select('*').eq('id', id).maybeSingle()
  if (!role) return null
  const { data: v } = await db().from('role_versions').select('spec, locked_at').eq('role_id', id).eq('version', role.current_version).single()
  return { ...(role as RoleRow), spec: RoleSpec.parse(v!.spec), versionLocked: !!v!.locked_at }
}

/**
 * For role pages: the role, only if the signed-in person may see it; otherwise
 * a 404. Every page checks this itself — layouts aren't re-run on every
 * navigation, so they can't be the only gate.
 */
export async function getRoleForPage(id: string): Promise<{ me: Me; role: RoleWithSpec }> {
  const me = await requireMe()
  if (!(await canAccessRole(me, id))) notFound()
  const role = await getRole(id)
  if (!role) notFound()
  return { me, role }
}

export async function audit(roleId: string | null, actorId: string | null, action: string, details: Record<string, unknown> = {}) {
  await db().from('audit_log').insert({ role_id: roleId, actor_id: actorId, action, details })
}

export async function createRole(me: Me, input: { templateId: string; title: string; sourceJd: string }): Promise<string> {
  const t = await getTemplate(input.templateId)
  if (!t) throw new Error('Template not found.')
  const spec = RoleSpec.parse(structuredClone(t.spec))
  spec.basics.title = input.title.trim() || spec.basics.title

  const { data: role, error } = await db()
    .from('roles')
    .insert({ title: spec.basics.title, template_id: t.id, source_jd: input.sourceJd, change_notes: t.change_notes, created_by: me.id })
    .select('id')
    .single()
  if (error) throw error
  await db().from('role_versions').insert({ role_id: role.id, version: 1, spec, created_by: me.id })
  await db().from('role_members').insert({ role_id: role.id, user_id: me.id, member_role: me.appRole === 'hm' ? 'hm' : 'hr' })
  await audit(role.id, me.id, 'role.created', { template: t.name })
  return role.id
}

/**
 * Save the role's configuration. Once answer keys are locked by calibration,
 * a save creates a new version (old scores keep pointing at the old one) and
 * pauses autopilot until the new answer keys are re-checked.
 */
/** Drop blank lines people leave behind while editing. */
export function tidySpec(spec: RoleSpec): RoleSpec {
  const s = structuredClone(spec)
  s.responsibilities = s.responsibilities.map(r => ({ theme: r.theme.trim(), bullets: r.bullets.map(b => b.trim()).filter(Boolean) })).filter(r => r.theme || r.bullets.length)
  s.preferredColleges = s.preferredColleges.map(c => c.trim()).filter(Boolean)
  s.eligibility.location.allowed = s.eligibility.location.allowed.map(c => c.trim()).filter(Boolean)
  s.interviewRounds = s.interviewRounds.map(r => (r.kind === 'human' ? { ...r, interviewerEmails: r.interviewerEmails.map(e => e.trim().toLowerCase()).filter(Boolean) } : r))
  return s
}

/** Everything that changes how candidates are scored. */
export function scoringKey(s: RoleSpec): string {
  return JSON.stringify({
    mustHaves: s.mustHaves,
    goodToHaves: s.goodToHaves,
    screeningQuestions: s.screeningQuestions,
    preferredColleges: s.preferredColleges,
    preferredCollegeBonus: s.preferredCollegeBonus,
    rounds: s.interviewRounds.map(r => (r.kind === 'ai' ? { id: r.id, questions: r.questions } : { id: r.id })),
  })
}

export async function saveSpec(me: Me, roleId: string, spec: RoleSpec): Promise<{ newVersion: boolean }> {
  const parsed = tidySpec(RoleSpec.parse(spec))
  const role = await getRole(roleId)
  if (!role) throw new Error('Role not found.')

  // Only changes to what is scored need a new version; a title or deadline fix doesn't
  if (role.versionLocked && scoringKey(parsed) !== scoringKey(role.spec)) {
    const version = role.current_version + 1
    await db().from('role_versions').insert({ role_id: roleId, version, spec: parsed, created_by: me.id })
    await db().from('roles').update({ current_version: version, title: parsed.basics.title, autopilot: false, updated_at: new Date().toISOString() }).eq('id', roleId)
    await audit(roleId, me.id, 'role.new_version', { version })
    return { newVersion: true }
  }
  await db().from('role_versions').update({ spec: parsed }).eq('role_id', roleId).eq('version', role.current_version)
  await db().from('roles').update({ title: parsed.basics.title, updated_at: new Date().toISOString() }).eq('id', roleId)
  await audit(roleId, me.id, 'role.saved')
  return { newVersion: false }
}
