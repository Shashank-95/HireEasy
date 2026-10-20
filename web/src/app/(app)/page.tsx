import type { Metadata } from 'next'
import Link from 'next/link'
import { requireMe, canManageRoles } from '@/lib/auth'
import { listRoles } from '@/lib/data/roles'
import { db } from '@/lib/supabase/server'
import { Badge, ButtonLink, Card, EmptyState, PageHeader } from '@/components/ui'

export const metadata: Metadata = { title: 'Roles' }

const STATUS_TONE = { draft: 'neutral', active: 'success', paused: 'warn', closed: 'neutral' } as const

export default async function RolesPage() {
  const me = await requireMe()
  const roles = await listRoles(me)
  const ids = roles.map(r => r.id)
  const { data: cands } = ids.length
    ? await db().from('candidates').select('role_id, stage, status').in('role_id', ids).is('merged_into', null)
    : { data: [] as { role_id: string; stage: string; status: string }[] }

  const counts = new Map<string, { total: number; active: number; review: number; interviewing: number; reached: number; hired: number }>()
  for (const c of cands ?? []) {
    const k = counts.get(c.role_id) ?? { total: 0, active: 0, review: 0, interviewing: 0, reached: 0, hired: 0 }
    k.total++
    if (c.status === 'hired') k.hired++
    if (c.status === 'hired' || !['eligibility', 'screening', 'resume'].includes(c.stage)) k.reached++
    if (c.status === 'active') k.active++
    if (c.status === 'review') k.review++
    if (c.status === 'active' && !['eligibility', 'screening', 'resume'].includes(c.stage)) k.interviewing++
    counts.set(c.role_id, k)
  }

  return (
    <>
      <PageHeader
        title="Roles"
        description="Each role runs on its own: screening, AI interview rounds and shortlists, until the round you take yourself."
        actions={canManageRoles(me) && <ButtonLink href="/roles/new">New role</ButtonLink>}
      />
      {roles.length === 0 ? (
        <EmptyState
          title={canManageRoles(me) ? 'Create your first role' : 'No roles yet'}
          description={
            canManageRoles(me)
              ? 'Start from a template, set the budget and experience, add the applications sheet — HireEasy does the rest.'
              : 'When HR adds you to a role as hiring manager, it shows up here.'
          }
          action={canManageRoles(me) && <ButtonLink href="/roles/new">New role</ButtonLink>}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {roles.map(r => {
            const c = counts.get(r.id) ?? { total: 0, active: 0, review: 0, interviewing: 0, reached: 0, hired: 0 }
            return (
              <Link key={r.id} href={`/roles/${r.id}`} className="group">
                <Card className="h-full p-5 transition-colors group-hover:border-accent/40">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="font-semibold text-ink">{r.title}</h2>
                    <div className="flex shrink-0 gap-1.5">
                      {r.autopilot && <Badge tone="accent">Autopilot</Badge>}
                      <Badge tone={STATUS_TONE[r.status]}>{r.status[0].toUpperCase() + r.status.slice(1)}</Badge>
                    </div>
                  </div>
                  <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                    {/* A closed role shows how it ended, not who is still "in progress" */}
                    {(r.status === 'closed'
                      ? [
                          ['Applicants', c.total],
                          ['Reached interviews', c.reached],
                          ['Hired', c.hired],
                        ]
                      : [
                          ['Applicants', c.total],
                          ['In interviews', c.interviewing],
                          ['Need a look', c.review],
                        ]
                    ).map(([label, n]) => (
                      <div key={label as string} className="rounded-lg bg-surface-2 px-2 py-2">
                        <dd className="text-lg font-semibold tabular-nums">{n}</dd>
                        <dt className="text-[11px] text-muted">{label}</dt>
                      </div>
                    ))}
                  </dl>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </>
  )
}
