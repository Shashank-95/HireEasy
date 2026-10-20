import type { Metadata } from 'next'
import Link from 'next/link'

import { getRoleForPage } from '@/lib/data/roles'
import { db } from '@/lib/supabase/server'
import { planCut } from '@/lib/pipeline/cut'
import type { RoleSpec } from '@/lib/templates/types'
import { googleConnection } from '@/lib/google'
import { Badge, Card, CardHeader, cx, EmptyState, HowItWorks, Notice } from '@/components/ui'
import { ApplyCutButton, PreviewButton, ScheduleForm, OutcomeButtons } from './controls'

export const metadata: Metadata = { title: 'Interviews' }

/** The same plan the real cut uses — the preview can never disagree with it. */
async function cutPreview(roleId: string, spec: RoleSpec, stage: string) {
  const plan = await planCut(roleId, spec, stage)
  const name = (id: string) => plan.cands.find(c => c.id === id)?.name ?? ''
  return { total: plan.cands.length, scored: plan.scores.size, cut: plan.cut, review: plan.review, name, scores: plan.scores }
}

export default async function InterviewsPage({ params }: PageProps<'/roles/[id]/interviews'>) {
  const { id } = await params
  const { role } = await getRoleForPage(id)
  const spec = role.spec
  const google = await googleConnection()

  const screening = await cutPreview(id, spec, 'resume')
  // What the last screening cut did, once nobody is left waiting
  const { data: cutLog } = await db().from('audit_log').select('details, created_at').eq('role_id', id).eq('action', 'stage.cut').order('created_at', { ascending: false }).limit(5)
  const sc = (cutLog ?? []).find(l => (l.details as { stage?: string }).stage === 'screening')
  const scd = (sc?.details ?? {}) as { advanced?: number; waitlisted?: number; out?: number; review?: number }
  const lastCut = sc ? { when: new Date(sc.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }), text: [`${scd.advanced ?? 0} moved on`, scd.waitlisted ? `${scd.waitlisted} waitlisted` : '', scd.out ? `${scd.out} below the bar` : '', scd.review ? `${scd.review} need a look` : ''].filter(Boolean).join(', ') } : null

  const rounds = await Promise.all(
    spec.interviewRounds.map(async r => {
      if (r.kind === 'human') {
        const { data } = await db().from('meetings').select('id, state, starts_at, meet_link, candidate_id, candidates!inner(id, name, email, stage, status, parsed, role_id)').eq('round_id', r.id).eq('candidates.role_id', id).order('created_at')
        const rows = (data ?? []).filter(m => {
          const c = (Array.isArray(m.candidates) ? m.candidates[0] : m.candidates) as { stage: string } | null
          return c && (c.stage === r.id || m.state !== 'to_schedule')
        })
        return { kind: 'human' as const, round: r, meetings: rows }
      }
      const { data: sessions } = await db().from('interview_sessions').select('id, state, candidate_id, expires_at, submitted_at, candidates(name, status)').eq('role_id', id).eq('round_id', r.id).eq('preview', false)
      const ids = (sessions ?? []).map(x => x.candidate_id).filter(Boolean) as string[]
      const { data: evs } = ids.length ? await db().from('evaluations').select('candidate_id, score, details, created_at').eq('stage', r.id).in('candidate_id', ids).order('created_at', { ascending: false }) : { data: [] }
      const evals = new Map<string, { score: number; summary: string }>()
      for (const e of evs ?? []) if (!evals.has(e.candidate_id)) evals.set(e.candidate_id, { score: Number(e.score), summary: String((e.details as { summary?: string }).summary ?? '') })
      const { data: previews } = await db().from('interview_sessions').select('id, state, invited_at, events').eq('role_id', id).eq('round_id', r.id).eq('preview', true).order('invited_at', { ascending: false }).limit(5)
      const preview = await cutPreview(id, spec, r.id)
      return { kind: 'ai' as const, round: r, sessions: sessions ?? [], evals, previews: previews ?? [], preview }
    }),
  )

  // Screening is only "done" when nobody is still being checked or scored —
  // cutting earlier would hand the places to whoever happened to go first
  const { count: stillScreening } = await db().from('candidates').select('id', { count: 'exact', head: true }).eq('role_id', id).in('stage', ['eligibility', 'screening']).eq('status', 'active').is('merged_into', null)
  const screeningDone = (stillScreening ?? 0) === 0 && screening.scored === screening.total
  const closed = role.status === 'closed'
  const pendingScreeningCut = !closed && !role.autopilot && screening.total > 0 && screeningDone

  return (
    <div className="space-y-6">
      <HowItWorks
        steps={[
          'Screening ranks applicants on their answers and resume. The best above the bar (up to your limit) move into the first round.',
          'AI rounds: each candidate gets an emailed link, answers spoken questions in their own time, and is scored against your answer keys.',
          'When a round with a person comes up, you pick a time that suits both sides — the Google Meet invite goes out automatically.',
          role.autopilot ? 'Autopilot is on: cuts happen as soon as everyone in a round is done.' : 'Autopilot is off: each cut waits for you to press “Apply cut”.',
        ]}
      />

      <Card>
        <CardHeader
          title={screeningDone ? 'Screening shortlist' : 'Screening shortlist (preview)'}
          description={`Answers + resume. Bar ${spec.screeningAdvance.minScore}, up to ${spec.screeningAdvance.maxAdvance} move on.`}
          action={pendingScreeningCut ? <ApplyCutButton roleId={id} stage="resume" label={`Apply cut — move ${screening.cut.advance.length} on`} /> : undefined}
        />
        {screening.total === 0 ? (
          <p className="px-5 py-6 text-sm text-muted">
            {lastCut ? `Last cut ${lastCut.when}: ${lastCut.text}. ` : ''}Nobody is waiting at this step right now.
          </p>
        ) : (
          <div className="px-5 py-4">
            {!screeningDone && (
              <Notice tone="info" className="mb-3">
                Still screening: {(stillScreening ?? 0) + (screening.total - screening.scored)} applicant{(stillScreening ?? 0) + (screening.total - screening.scored) === 1 ? '' : 's'} not scored yet. The shortlist below is a live preview — places are given out only once everyone is scored, so early applicants get no advantage.
              </Notice>
            )}
            <CutList preview={screening} roleId={id} />
          </div>
        )}
      </Card>

      {rounds.map(r =>
        r.kind === 'ai' && r.round.kind === 'ai' ? (
          <Card key={r.round.id}>
            <CardHeader
              title={r.round.name}
              description={`AI interview · ${r.round.questions.length} questions · ${r.round.deadlineHours}h to complete · bar ${r.round.advance.minScore}, up to ${r.round.advance.maxAdvance} move on`}
              action={
                <div className="flex flex-wrap gap-2">
                  {!closed && <PreviewButton roleId={id} roundId={r.round.id} />}
                  {!closed && !role.autopilot && r.preview.total > 0 && r.preview.scored === r.preview.total && (
                    <ApplyCutButton roleId={id} stage={r.round.id} label={`Apply cut — move ${r.preview.cut.advance.length} on`} />
                  )}
                </div>
              }
            />
            <div className="space-y-4 px-5 py-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(['invited', 'started', 'submitted', 'expired'] as const).map(s => (
                  <div key={s} className="rounded-lg bg-surface-2 px-3 py-2">
                    <p className="text-lg font-semibold tabular-nums">{r.sessions.filter(x => x.state === s).length}</p>
                    <p className="text-[12px] capitalize text-muted">{s === 'submitted' ? 'completed' : s === 'started' ? 'in progress' : s}</p>
                  </div>
                ))}
              </div>
              {r.preview.total > 0 && <CutList preview={r.preview} roleId={id} />}
              {r.sessions.length === 0 ? (
                <p className="text-sm text-muted">No one has been invited to this round yet.</p>
              ) : (
                <div className="overflow-hidden rounded-lg border border-line">
                  <p className="border-b border-line bg-surface-2/60 px-4 py-2 text-[12px] font-medium text-muted">Every candidate in this round — open one for the full transcript, recordings and per-question scores</p>
                  <ul className="divide-y divide-line">
                    {r.sessions
                      .map(x => ({ ...x, ev: x.candidate_id ? r.evals.get(x.candidate_id) : undefined }))
                      .sort((a, b) => (b.ev?.score ?? -1) - (a.ev?.score ?? -1))
                      .map(x => {
                        const c = (Array.isArray(x.candidates) ? x.candidates[0] : x.candidates) as { name: string } | null
                        return (
                          <li key={x.id}>
                            <Link href={`/roles/${id}/applicants/${x.candidate_id}#round-${r.round.id}`} className="flex flex-col gap-1 px-4 py-3 hover:bg-surface-2 sm:flex-row sm:items-start sm:gap-4">
                              <span className="w-44 shrink-0 text-[13px] font-medium">{c?.name}</span>
                              <span className="w-24 shrink-0"><Badge tone={x.state === 'submitted' ? 'success' : x.state === 'expired' ? 'danger' : 'accent'}>{x.state === 'submitted' ? 'Completed' : x.state === 'started' ? 'In progress' : x.state}</Badge></span>
                              <span className="w-12 shrink-0 text-[13px] font-semibold tabular-nums">{x.ev ? x.ev.score : '—'}</span>
                              <span className="line-clamp-2 text-[12px] text-muted">{x.ev?.summary || (x.state === 'submitted' ? 'Scoring…' : `Due ${new Date(x.expires_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}`)}</span>
                            </Link>
                          </li>
                        )
                      })}
                  </ul>
                </div>
              )}
              {r.previews.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[12px] font-medium text-muted">Your preview runs</p>
                  <ul className="flex flex-wrap gap-2">
                    {r.previews.map(p => {
                      const score = ((p.events as { type: string; score?: number }[]) ?? []).find(e => e.type === 'score')?.score
                      return (
                        <li key={p.id}>
                          <Link href={`/roles/${id}/interviews/preview/${p.id}`} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-[12px] hover:bg-surface-2">
                            {new Date(p.invited_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}
                            <Badge tone={p.state === 'submitted' ? 'success' : 'neutral'}>{p.state === 'submitted' ? `${score ?? '—'}/100` : p.state}</Badge>
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}
            </div>
          </Card>
        ) : r.kind === 'human' && r.round.kind === 'human' ? (
          <Card key={r.round.id}>
            <CardHeader title={r.round.name} description={`With ${r.round.interviewerEmails.join(', ') || 'no interviewer set — add one in Setup'} · ${r.round.durationMin} min on Google Meet`} />
            {!google && <div className="px-5 pt-4"><Notice tone="warn">Connect Google in Settings to create Meet invites.</Notice></div>}
            {r.meetings.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted">Nobody has reached this round yet. You’ll get a notification when they do.</p>
            ) : (
              <ul className="divide-y divide-line">
                {r.meetings.map(m => {
                  const c = (Array.isArray(m.candidates) ? m.candidates[0] : m.candidates) as { id: string; name: string; email: string; status: string; parsed: { scores?: Record<string, number> } }
                  return (
                    <li key={m.id} className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <Link href={`/roles/${id}/applicants/${c.id}`} className="font-medium hover:text-accent">{c.name}</Link>
                        <p className="text-[12px] text-muted">
                          {Object.entries(c.parsed.scores ?? {}).map(([k, v]) => `${k === 'screening' ? 'Screening' : spec.interviewRounds.find(x => x.id === k)?.name ?? k}: ${v}`).join(' · ')}
                        </p>
                        {m.state === 'scheduled' && (
                          <p className="mt-1 text-[13px]">
                            <Badge tone="accent">Scheduled</Badge> {new Date(m.starts_at!).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}
                            {m.meet_link && <> · <a href={m.meet_link} target="_blank" rel="noreferrer" className="text-accent underline">Meet link</a></>}
                          </p>
                        )}
                        {m.state === 'done' && <Badge tone={c.status === 'out' ? 'neutral' : 'success'}>{c.status === 'hired' ? 'Hired' : c.status === 'out' ? 'Not proceeding' : 'Moved on'}</Badge>}
                      </div>
                      {!closed && m.state === 'to_schedule' && <ScheduleForm roleId={id} meetingId={m.id} disabled={!google} />}
                      {!closed && m.state === 'scheduled' && <OutcomeButtons roleId={id} meetingId={m.id} />}
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
        ) : null,
      )}
      {spec.interviewRounds.length === 0 && <EmptyState title="No interview rounds" description="Add AI rounds and a round with the hiring manager in Setup → Interview plan." />}
    </div>
  )
}

function CutList({ preview, roleId }: { preview: Awaited<ReturnType<typeof cutPreview>>; roleId: string }) {
  const groups = [
    { label: 'Would move on', tone: 'success' as const, items: preview.cut.advance },
    { label: 'Waitlisted (above the bar, over the limit)', tone: 'warn' as const, items: preview.cut.waitlist },
    { label: 'Below the bar', tone: 'neutral' as const, items: preview.cut.out },
    ...(preview.review.length ? [{ label: 'Need a look — resume couldn’t be read', tone: 'warn' as const, items: preview.review }] : []),
  ]
  return (
    <div className={cx('grid gap-4', groups.length === 4 ? 'md:grid-cols-2 xl:grid-cols-4' : 'md:grid-cols-3')}>
      {groups.map(g => (
        <div key={g.label}>
          <p className="mb-2 flex items-center gap-1.5 text-[12px] font-medium text-muted"><Badge tone={g.tone}>{g.items.length}</Badge>{g.label}</p>
          <ul className="max-h-64 space-y-1 overflow-y-auto text-[13px]">
            {g.items.map(i => (
              <li key={i.id} className="flex justify-between gap-2">
                <Link href={`/roles/${roleId}/applicants/${i.id}`} className="truncate hover:text-accent">{preview.name(i.id)}</Link>
                <span className="tabular-nums text-muted">{preview.scores.get(i.id)}</span>
              </li>
            ))}
            {g.items.length === 0 && <li className="text-faint">—</li>}
          </ul>
        </div>
      ))}
    </div>
  )
}
