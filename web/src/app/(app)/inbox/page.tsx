import type { Metadata } from 'next'
import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { requireMe } from '@/lib/auth'
import { listRoles } from '@/lib/data/roles'
import { db } from '@/lib/supabase/server'
import { Button, Card, EmptyState, PageHeader } from '@/components/ui'

export const metadata: Metadata = { title: 'Inbox' }

export default async function InboxPage() {
  const me = await requireMe()
  const roles = await listRoles(me)
  const ids = roles.map(r => r.id)
  const { data } = ids.length
    ? await db().from('notifications').select('id, role_id, title, body, link, read_at, created_at').in('role_id', ids).or(`user_id.is.null,user_id.eq.${me.id}`).order('created_at', { ascending: false }).limit(100)
    : { data: [] as { id: string; role_id: string; title: string; body: string; link: string; read_at: string | null; created_at: string }[] }
  const title = (id: string) => roles.find(r => r.id === id)?.title ?? ''

  async function markAll() {
    'use server'
    const me = await requireMe()
    const roles = await listRoles(me)
    if (roles.length) await db().from('notifications').update({ read_at: new Date().toISOString() }).in('role_id', roles.map(r => r.id)).or(`user_id.is.null,user_id.eq.${me.id}`).is('read_at', null)
    revalidatePath('/inbox')
  }

  const unread = (data ?? []).filter(n => !n.read_at).length
  return (
    <>
      <PageHeader title="Inbox" description="When something needs a person — a round ready to schedule, a shortlist waiting — it shows up here." actions={unread > 0 && <form action={markAll}><Button variant="secondary" size="sm">Mark all read</Button></form>} />
      {!data?.length ? (
        <EmptyState title="All quiet" description="Autopilot handles the routine. You'll see things here when a decision needs you." />
      ) : (
        <Card className="divide-y divide-line">
          {data.map(n => (
            <Link key={n.id} href={n.link || `/roles/${n.role_id}`} className="block px-5 py-3 hover:bg-surface-2">
              <div className="flex items-start justify-between gap-3">
                <p className={`text-sm ${n.read_at ? 'text-muted' : 'font-semibold'}`}>{n.title}</p>
                <span className="shrink-0 text-[12px] text-faint">{new Date(n.created_at).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' })}</span>
              </div>
              <p className="mt-0.5 text-[13px] text-muted">{title(n.role_id)} · {n.body}</p>
            </Link>
          ))}
        </Card>
      )}
    </>
  )
}
