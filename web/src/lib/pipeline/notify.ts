import 'server-only'
import { db } from '../supabase/server'

/** In-app notification for everyone on the role. Doesn't repeat an identical unread one. */
export async function notifyRole(roleId: string, kind: string, title: string, body: string, link: string) {
  const { data } = await db().from('notifications').select('id').eq('role_id', roleId).eq('kind', kind).eq('title', title).is('read_at', null).limit(1)
  if (data?.length) return
  await db().from('notifications').insert({ role_id: roleId, kind, title, body, link })
}
