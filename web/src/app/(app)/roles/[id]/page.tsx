import type { Metadata } from 'next'
import Link from 'next/link'

import { CheckCircle2, Circle } from 'lucide-react'
import { canManageRoles } from '@/lib/auth'
import { getRoleForPage } from '@/lib/data/roles'
import { db } from '@/lib/supabase/server'
import { checkReadiness } from '@/lib/templates/readiness'
import { stagesFor } from '@/lib/pipeline/stages'
import { geminiChain, hasGemini, hasGroq, MODELS } from '@/lib/ai/providers'
import { quotaSnapshot } from '@/lib/ai/quota'
import { googleConnection } from '@/lib/google'
import { getSample } from '@/lib/data/calibration'
import { Badge, Card, CardHeader, cx } from '@/components/ui'
import { autopilotUnlocked } from './ops'
import { EngineCard } from './EngineCard'
import { AutopilotCard } from './AutopilotCard'
import { CloseRole } from './CloseRole'
import { allRows } from '@/lib/data/paging'

export const metadata: Metadata = { title: 'Overview' }

export default async function RoleOverview({ params }: PageProps<'/roles/[id]'>) {
  const { id } = await params
  const { me, role } = await getRoleForPage(id)

  const [{ data: cands }, { data: job }, { data: notes }, google, unlocked, sample, quota] = await Promise.all([
    allRows((a, b) => db().from('candidates').select('stage, status').eq('role_id', id).is('merged_into', null).order('id').range(a, b)).then(data => ({ data })),
    db().from('jobs').select('progress, updated_at, state').eq('role_id', id).eq('kind', 'engine').maybeSingle(),
    db().from('notifications').select('id, title, body, link, created_at').eq('role_id', id).is('read_at', null).order('created_at', { ascending: false }).limit(5),
    googleConnection(),
    autopilotUnlocked(id),
    getSample(id),
    // Every Gemini model in the scoring chain has its own free day; show each
    quotaSnapshot([...geminiChain(), MODELS.second, MODELS.fast, MODELS.stt]),
  ])
  const chain = geminiChain()

  const blocks = checkReadiness(role.spec).filter(i => i.severity === 'block').length
  const total = cands?.length ?? 0
  const stages = stagesFor(role.spec)
  const byStage = stages.map(s => {
    const here = (cands ?? []).filter(c => c.stage === s.key)
    return { ...s, active: here.filter(c => c.status === 'active' || c.status === 'hired').length, review: here.filter(c => c.status === 'review').length, out: here.filter(c => c.status === 'out').length }
  })

  const steps = [
    { done: blocks === 0, label: 'Finish setup', detail: blocks ? `${blocks} item(s) to fix` : 'Ready', href: `/roles/${id}/setup` },
    { done: hasGemini() || hasGroq(), label: 'AI keys added', detail: hasGemini() || hasGroq() ? 'Free AI connected' : 'Add a free Gemini or Groq key', href: '/settings' },
    { done: total > 0, label: 'Add applications', detail: total ? `${total} applicants` : 'Import the Google Sheet', href: `/roles/${id}/applicants` },
    { done: role.status === 'active' || role.status === 'closed', label: 'Go live', detail: role.status === 'active' ? 'Live' : 'Starts screening', href: `/roles/${id}` },
    { done: unlocked, label: 'Calibrate', detail: unlocked ? 'AI agrees with you' : sample ? 'Labelling in progress' : 'Label ~40 applicants once', href: `/roles/${id}/calibration` },
    { done: !!google, label: 'Connect Google', detail: google ? google.email : 'Needed to send emails and Meet invites', href: '/settings' },
    { done: role.autopilot, label: 'Turn on autopilot', detail: role.autopilot ? 'Running on its own' : 'After calibration', href: `/roles/${id}` },
  ]

  return (
    <div className="space-y-6">
      {role.status === 'closed' && <ClosedNote roleId={id} />}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader title="Pipeline" description="Where everyone is right now. Click a stage to see the people in it." />
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4">
              {byStage.map(s => (
                <Link key={s.key} href={`/roles/${id}/applicants?stage=${s.key}`} className="border-b border-r border-line px-4 py-3 hover:bg-surface-2">
                  <p className="truncate text-[12px] font-medium text-muted">{s.label}</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">{s.active}</p>
                  <p className="text-[12px] text-faint">
                    {s.review ? <span className="text-warn">{s.review} need a look</span> : null}
                    {s.review && s.out ? ' · ' : ''}
                    {s.out ? `${s.out} stopped` : null}
                    {!s.review && !s.out ? (s.key === 'done' ? 'hired' : 'in progress') : null}
                  </p>
                </Link>
              ))}
            </div>
          </Card>

          {(notes ?? []).length > 0 && (
            <Card>
              <CardHeader title="Needs your attention" />
              <ul className="divide-y divide-line">
                {notes!.map(n => (
                  <li key={n.id}>
                    <Link href={n.link || `/roles/${id}`} className="block px-5 py-3 hover:bg-surface-2">
                      <p className="text-sm font-medium">{n.title}</p>
                      <p className="mt-0.5 text-[13px] text-muted">{n.body}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {role.status !== 'closed' && <EngineCard
            roleId={id}
            live={role.status === 'active'}
            lastRun={job ? { at: job.updated_at, state: job.state, progress: job.progress as Record<string, unknown> } : null}
            quota={Object.entries(quota).map(([model, q]) => ({ model, ...q, chainIndex: chain.indexOf(model) }))}
          />}
        </div>

        <div className="space-y-6">
          {role.status !== 'closed' && <Card>
            <CardHeader title="Getting this role running" />
            <ol className="divide-y divide-line">
              {steps.map(s => (
                <li key={s.label}>
                  <Link href={s.href} className="flex items-start gap-3 px-5 py-3 hover:bg-surface-2">
                    {s.done ? <CheckCircle2 size={18} className="mt-px shrink-0 text-success" /> : <Circle size={18} className="mt-px shrink-0 text-faint" />}
                    <span className="min-w-0">
                      <span className={cx('block text-sm font-medium', s.done && 'text-muted')}>{s.label}</span>
                      <span className="block truncate text-[12px] text-faint">{s.detail}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </Card>}

          {role.status !== 'closed' && <AutopilotCard roleId={id} on={role.autopilot} unlocked={unlocked} canTurnOn={canManageRoles(me)} />}

          {canManageRoles(me) && role.status !== 'closed' && <CloseRole roleId={id} notHired={(cands ?? []).filter(c => c.status !== 'hired').length} />}

          <p className="px-1 text-[12px] text-faint">
            Version {role.current_version}{role.versionLocked ? ' · answer keys locked' : ''} · <Badge>{role.status}</Badge>
          </p>
        </div>
      </div>
    </div>
  )
}

/** What closing the role did — shown for as long as it stays closed. */
async function ClosedNote({ roleId }: { roleId: string }) {
  const { data } = await db().from('audit_log').select('details, created_at, profiles(full_name, email)').eq('role_id', roleId).eq('action', 'role.closed').order('created_at', { ascending: false }).limit(1).maybeSingle()
  const d = (data?.details ?? {}) as { rejectionsQueued?: number; unsentCancelled?: number; meetingsCancelled?: number }
  const who = (Array.isArray(data?.profiles) ? data?.profiles[0] : data?.profiles) as { full_name: string; email: string } | null | undefined
  const when = data ? new Date(data.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) : null
  const parts = [
    d.rejectionsQueued ? `${d.rejectionsQueued} “not moving forward” email${d.rejectionsQueued === 1 ? '' : 's'} queued` : null,
    d.unsentCancelled ? `${d.unsentCancelled} unsent invite${d.unsentCancelled === 1 ? '' : 's'} cancelled` : null,
    d.meetingsCancelled ? `${d.meetingsCancelled} interview${d.meetingsCancelled === 1 ? '' : 's'} with a person cancelled` : null,
  ].filter(Boolean)
  return (
    <Card className="p-4 text-sm">
      <p className="font-medium">This role is closed{when ? ` — ${when}` : ''}{who ? ` by ${who.full_name || who.email}` : ''}.</p>
      <p className="mt-1 text-muted">{parts.length ? `${parts.join(' · ')}. ` : ''}Its history stays here for reference. <Link href={`/roles/${roleId}/emails`} className="text-accent underline">See emails</Link></p>
    </Card>
  )
}
