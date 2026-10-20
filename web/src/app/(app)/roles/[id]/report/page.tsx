import type { Metadata } from 'next'
import Link from 'next/link'

import { getRoleForPage } from '@/lib/data/roles'
import { db } from '@/lib/supabase/server'
import type { CandidateRow } from '@/lib/data/candidates'
import { stageLabel } from '@/lib/pipeline/stages'
import { formatMoney, type MoneyParse } from '@/lib/parse/money'
import { SummaryBlock } from '@/components/Breakdown'
import { Badge, ButtonLink, Card, EmptyState, HowItWorks } from '@/components/ui'

export const metadata: Metadata = { title: 'Shortlist report' }

/**
 * Everything a hiring manager needs before their own round, on one page:
 * every finalist, each stage's score, what the AI interviews found, and the
 * facts that matter — without opening each candidate.
 */
export default async function ReportPage({ params }: PageProps<'/roles/[id]/report'>) {
  const { id } = await params
  const { role } = await getRoleForPage(id)
  const spec = role.spec
  const humanRounds = spec.interviewRounds.filter(r => r.kind === 'human').map(r => r.id)
  const aiRounds = spec.interviewRounds.filter(r => r.kind === 'ai')

  const { data } = await db().from('candidates').select('*').eq('role_id', id).is('merged_into', null).or(`stage.in.(${[...humanRounds, 'done'].join(',')}),status.eq.hired`)
  const finalists = ((data ?? []) as CandidateRow[]).filter(c => c.status !== 'out' || humanRounds.includes(c.stage))
  const ids = finalists.map(c => c.id)
  const [{ data: evs }, { data: meets }] = await Promise.all([
    ids.length ? db().from('evaluations').select('candidate_id, stage, score, details, created_at').in('candidate_id', ids).order('created_at', { ascending: false }) : Promise.resolve({ data: [] as { candidate_id: string; stage: string; score: number; details: Record<string, unknown> }[] }),
    ids.length ? db().from('meetings').select('candidate_id, state, starts_at, meet_link').in('candidate_id', ids) : Promise.resolve({ data: [] as { candidate_id: string; state: string; starts_at: string | null; meet_link: string | null }[] }),
  ])
  const ev = (cid: string, stage: string) => evs?.find(e => e.candidate_id === cid && e.stage === stage)
  const score = (c: CandidateRow) => aiRounds.length ? Number(ev(c.id, aiRounds[aiRounds.length - 1].id)?.score ?? -1) : Number(c.parsed.scores?.screening ?? -1)

  return (
    <div className="space-y-6">
      <HowItWorks
        title="About this report"
        steps={[
          'Everyone who reached a round with a person (or was hired), strongest last-round score first.',
          'Scores are 0–100 per stage. Each comes from the answer keys in Setup — open a candidate to see every question, quote and recording behind it.',
          'Download the full record of every applicant and every decision as a spreadsheet below.',
        ]}
      />
      <div className="flex flex-wrap justify-end gap-2">
        <ButtonLink href={`/api/export/${id}?type=candidates`} variant="secondary" size="sm" prefetch={false}>Download all applicants (CSV)</ButtonLink>
        <ButtonLink href={`/api/export/${id}?type=decisions`} variant="secondary" size="sm" prefetch={false}>Download every decision (CSV)</ButtonLink>
      </div>
      {finalists.length === 0 ? (
        <EmptyState title="No finalists yet" description="When candidates clear the AI rounds and reach a round with a person, they appear here side by side." />
      ) : (
        finalists.sort((a, b) => score(b) - score(a)).map((c, i) => {
          const last = aiRounds.map(r => ev(c.id, r.id)).filter(Boolean)[aiRounds.length - 1] ?? aiRounds.map(r => ev(c.id, r.id)).filter(Boolean).at(-1)
          const resume = ev(c.id, 'resume')
          const m = meets?.find(x => x.candidate_id === c.id)
          return (
            <Card key={c.id}>
              <div className="flex flex-col gap-3 border-b border-line px-5 py-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-[12px] text-faint">#{i + 1}</p>
                  <Link href={`/roles/${id}/applicants/${c.id}`} className="text-lg font-semibold hover:text-accent">{c.name}</Link>
                  <p className="text-[13px] text-muted">{[c.fields.education, c.fields.currentCompany].filter(Boolean).join(' · ')}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge tone={c.status === 'hired' ? 'success' : 'accent'}>{c.status === 'hired' ? 'Hired' : stageLabel(spec, c.stage)}</Badge>
                    {(c.parsed.preferredColleges ?? []).length > 0 && <Badge tone="info">Preferred college</Badge>}
                    {m?.state === 'scheduled' && m.starts_at && <Badge>Meeting {new Date(m.starts_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}</Badge>}
                    {m?.state === 'to_schedule' && <Badge tone="warn">To schedule</Badge>}
                  </div>
                </div>
                <dl className="grid grid-cols-3 gap-2 text-center sm:grid-cols-4">
                  {[['Screening', c.parsed.scores?.screening], ['Resume', resume?.score], ...aiRounds.map(r => [r.name.replace(/ —.*/, ''), ev(c.id, r.id)?.score])].map(([label, v]) => (
                    <div key={String(label)} className="rounded-lg bg-surface-2 px-3 py-2">
                      <dd className="text-lg font-semibold tabular-nums">{v ?? '—'}</dd>
                      <dt className="text-[11px] text-muted">{label}</dt>
                    </div>
                  ))}
                </dl>
              </div>
              <SummaryBlock summary={last?.details.summary as string | undefined} strengths={last?.details.strengths as string[] | undefined} concerns={last?.details.concerns as string[] | undefined} />
              <dl className="grid gap-x-6 gap-y-2 px-5 py-4 text-[13px] sm:grid-cols-4">
                <div><dt className="text-faint">Expects</dt><dd>{c.parsed.salary ? formatMoney(c.parsed.salary as MoneyParse) : '—'} <span className="text-faint">(“{c.fields.expectedSalary ?? '—'}”)</span></dd></div>
                <div><dt className="text-faint">Experience</dt><dd>{resume?.details.years !== undefined ? `${resume.details.years} yrs (resume)` : c.fields.experience ?? '—'}</dd></div>
                <div><dt className="text-faint">Notice</dt><dd>{c.fields.notice ?? '—'}</dd></div>
                <div><dt className="text-faint">Location</dt><dd>{c.fields.location ?? '—'}</dd></div>
              </dl>
            </Card>
          )
        })
      )}
    </div>
  )
}
