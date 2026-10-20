import 'server-only'
import { db } from '../supabase/server'

/**
 * A per-role lock row in `jobs` (unique on role + kind). Whoever flips it to
 * "running" first holds it; a lock older than `staleSeconds` is assumed dead.
 * Used by the engine and by cuts, so two tabs, cron and a double-click can
 * never run the same work twice.
 */
export async function claimLock(roleId: string, kind: string, staleSeconds = 55): Promise<string | null> {
  const stale = new Date(Date.now() - staleSeconds * 1000).toISOString()
  const { data: existing } = await db().from('jobs').select('id').eq('role_id', roleId).eq('kind', kind).maybeSingle()
  if (!existing) {
    // The unique index makes a simultaneous second insert fail → no lock
    const { data } = await db().from('jobs').insert({ role_id: roleId, kind, state: 'running' }).select('id').maybeSingle()
    return data?.id ?? null
  }
  const { data } = await db().from('jobs').update({ state: 'running', updated_at: new Date().toISOString() }).eq('id', existing.id).or(`state.neq.running,updated_at.lt.${stale}`).select('id').maybeSingle()
  return data?.id ?? null
}

export async function releaseLock(id: string, state: 'done' | 'waiting_quota' | 'failed' = 'done', progress?: unknown) {
  await db().from('jobs').update({ state, ...(progress === undefined ? {} : { progress }), updated_at: new Date().toISOString() }).eq('id', id)
}
