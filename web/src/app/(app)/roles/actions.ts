'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { canManageRoles, requireMe, requireOpenRole, requireRoleAccess } from '@/lib/auth'
import { audit, createRole, getRole, saveSpec } from '@/lib/data/roles'
import { RoleSpec } from '@/lib/templates/types'
import { checkReadiness } from '@/lib/templates/readiness'
import { db } from '@/lib/supabase/server'

export interface FormState {
  error?: string
  ok?: string
}

export async function createRoleAction(_: FormState, form: FormData): Promise<FormState> {
  const me = await requireMe()
  if (!canManageRoles(me)) return { error: 'Only HR can create roles.' }
  const templateId = String(form.get('templateId') || '')
  const title = String(form.get('title') || '').trim()
  if (!templateId) return { error: 'Pick a template.' }
  if (!title) return { error: 'Give the role a title.' }
  const id = await createRole(me, { templateId, title, sourceJd: String(form.get('sourceJd') || '') })
  redirect(`/roles/${id}/setup`)
}

export async function saveSpecAction(roleId: string, spec: unknown): Promise<FormState & { newVersion?: boolean }> {
  try {
    const me = await requireOpenRole(roleId)
    const parsed = RoleSpec.safeParse(spec)
    if (!parsed.success) {
      const first = parsed.error.issues[0]
      return { error: `Can't save: ${first.path.join(' › ')} — ${first.message}` }
    }
    const res = await saveSpec(me, roleId, parsed.data)
    revalidatePath(`/roles/${roleId}`, 'layout')
    return {
      ok: res.newVersion ? 'Saved as a new version. Answer keys changed, so autopilot is paused until you re-check calibration.' : 'Saved.',
      newVersion: res.newVersion,
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not save.' }
  }
}

/** Activate / pause / reopen. Activation requires a ready role. */
export async function setRoleStatus(roleId: string, status: 'active' | 'paused' | 'draft'): Promise<FormState> {
  const me = await requireRoleAccess(roleId)
  if (!canManageRoles(me)) return { error: 'Only HR can take a role live, pause it or move it back to draft.' }
  if (!['active', 'paused', 'draft'].includes(status)) return { error: 'Unknown status.' }
  const role = await getRole(roleId)
  if (!role) return { error: 'Role not found.' }
  if (role.status === 'closed') return { error: 'This role is closed.' }
  if (status === 'active') {
    const blocks = checkReadiness(role.spec).filter(i => i.severity === 'block')
    if (blocks.length) return { error: `Fix ${blocks.length} item(s) in Setup first: ${blocks[0].message}` }
  }
  await db().from('roles').update({ status, updated_at: new Date().toISOString() }).eq('id', roleId)
  await audit(roleId, me.id, `role.${status}`)
  revalidatePath(`/roles/${roleId}`, 'layout')
  return { ok: status === 'active' ? 'Role is live.' : status === 'paused' ? 'Paused. Nothing will be sent or scored until you resume.' : 'Moved back to draft.' }
}

export async function addMemberAction(roleId: string, _: FormState, form: FormData): Promise<FormState> {
  const me = await requireMe()
  if (!canManageRoles(me)) return { error: 'Only HR can change who is on a role.' }
  const email = String(form.get('email') || '').trim().toLowerCase()
  const { data: p } = await db().from('profiles').select('id, full_name').eq('email', email).maybeSingle()
  if (!p) return { error: `${email} hasn't signed up yet. Ask them to create an account at this site first, then add them.` }
  await db().from('role_members').upsert({ role_id: roleId, user_id: p.id, member_role: 'hm' })
  await audit(roleId, me.id, 'role.member_added', { email })
  revalidatePath(`/roles/${roleId}`, 'layout')
  return { ok: `${p.full_name || email} can now see this role.` }
}

export async function removeMemberAction(roleId: string, userId: string): Promise<void> {
  const me = await requireMe()
  if (!canManageRoles(me)) return
  await db().from('role_members').delete().eq('role_id', roleId).eq('user_id', userId)
  await audit(roleId, me.id, 'role.member_removed', { userId })
  revalidatePath(`/roles/${roleId}`, 'layout')
}
