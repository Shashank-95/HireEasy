import 'server-only'
import { redirect } from 'next/navigation'
import { cache } from 'react'
import { createClient, db } from './supabase/server'

export type AppRole = 'hr' | 'hm' | 'admin'

export interface Me {
  id: string
  email: string
  fullName: string
  appRole: AppRole
}

/** The signed-in person, or null. Cached for the duration of one request. */
export const getMe = cache(async (): Promise<Me | null> => {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) return null
  const { data: p } = await db().from('profiles').select('id, email, full_name, app_role').eq('id', data.user.id).maybeSingle()
  if (!p) return null
  return { id: p.id, email: p.email, fullName: p.full_name, appRole: p.app_role }
})

export async function requireMe(): Promise<Me> {
  const me = await getMe()
  if (!me) redirect('/login')
  return me
}

export const canManageRoles = (me: Me) => me.appRole === 'hr' || me.appRole === 'admin'

/** HR and admins see every role; hiring managers only the ones they're on. */
export async function canAccessRole(me: Me, roleId: string): Promise<boolean> {
  if (canManageRoles(me)) return true
  const { data } = await db().from('role_members').select('user_id').eq('role_id', roleId).eq('user_id', me.id).maybeSingle()
  return !!data
}

export class Forbidden extends Error {
  constructor(message = 'You do not have access to this role.') {
    super(message)
  }
}

/** For server actions: throws instead of redirecting, so the form can show why. */
export async function requireRoleAccess(roleId: string): Promise<Me> {
  const me = await requireMe()
  if (!(await canAccessRole(me, roleId))) throw new Forbidden()
  return me
}

/** For anything that changes a role: a closed role is a read-only record. */
export async function requireOpenRole(roleId: string): Promise<Me> {
  const me = await requireRoleAccess(roleId)
  const { data } = await db().from('roles').select('status').eq('id', roleId).maybeSingle()
  if (data?.status === 'closed') throw new Forbidden('This role is closed. Its history stays here for reference, but nothing can be changed.')
  return me
}
