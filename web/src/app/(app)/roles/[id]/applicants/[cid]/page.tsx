import type { Metadata } from 'next'
import { profileLink } from '@/lib/links'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getRoleForPage } from '@/lib/data/roles'
import { db } from '@/lib/supabase/server'
import type { CandidateRow, DecisionRow } from '@/lib/data/candidates'
import { stageLabel } from '@/lib/pipeline/stages'
import { FIELD_LABELS, type Field } from '@/lib/import/mapping'
import { formatMoney, type MoneyParse } from '@/lib/parse/money'
import { Badge, Card, CardHeader, Notice } from '@/components/ui'
import { STATUS_LABEL, STATUS_TONE } from '@/lib/pipeline/status'
import { DecisionButtons } from './DecisionButtons'
import { BreakdownList, SummaryBlock, scoreTone } from '@/components/Breakdown'
import { interviewBreakdown, screeningBreakdown, type StoredAnswer } from '@/lib/data/breakdown'

export const metadata: Metadata = { title: 'Applicant' }

interface Evaluation {
  id: string
  stage: string
  actor_type: string
  model: string | null
  score: number | null
  band: string | null
  details: Record<string, unknown>
  created_at: string
}

/** Shown next to "scored by …" when a later model in the chain stood in for the calibrated one. */
const fallbackNote = (ev: Evaluation | undefined | null) => {
  const from = ev?.details?.fellBackFrom
  return typeof from === 'string' ? ` (fallback — ${from} was unavailable; autopilot won’t decide on this score alone)` : ''
}

const when = (s: string) => new Date(s).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })

export default async function CandidatePage({ params }: PageProps<'/roles/[id]/applicants/[cid]'>) {
  const { id, cid } = await params
  const { role } = await getRoleForPage(id)
  const { data: c } = await db().from('candidates').select('*').eq('id', cid).eq('role_id', id).maybeSingle()
  if (!c) notFound()
  const cand = c as CandidateRow
  const [{ data: evals }, { data: decs }, { data: sessions }, { data: docs }] = await Promise.all([
    db().from('evaluations').select('*').eq('candidate_id', cid).order('created_at', { ascending: false }),
    db().from('decisions').select('*, profiles(full_name, email)').eq('candidate_id', cid).order('created_at', { ascending: false }),
    db().from('interview_sessions').select('id, round_id, state, invited_at, expires_at, submitted_at, events, interview_answers(question_id, followup_index, prompt, transcript, audio_path, duration_ms)').eq('candidate_id', cid).order('invited_at'),
    db().from('documents').select('kind, source_url, status, error').eq('candidate_id', cid),
  ])

  const latestEval = (stage: string) => (evals as Evaluation[] | null)?.find(e => e.stage === stage)
  const eligibility = latestEval('eligibility')
  const screening = latestEval('screening')
  const resume = latestEval('resume')
  const qText = (qid: string) => role.spec.screeningQuestions.find(q => q.id === qid)?.text ?? qid
  // A person guaranteed them a place at this stage's cut (their newest decision)
  const latestDecision = (decs ?? [])[0] as { actor_type: string; outcome: string; stage: string; via?: string | null } | undefined
  const guaranteed = cand.status === 'active' && !!latestDecision && latestDecision.actor_type === 'human' && latestDecision.outcome === 'advance' && latestDecision.via !== 'cut' && (latestDecision.stage === cand.stage || (cand.stage === 'resume' && latestDecision.stage === 'screening'))
  const questionOrder = (k: string) => {
    const i = role.spec.screeningQuestions.findIndex(q => q.id === k)
    return i === -1 ? 1000 : i
  }
  const skillName = (sid: string) => [...role.spec.mustHaves, ...role.spec.goodToHaves].find(s => s.id === sid)?.name ?? sid

  const facts: [string, string | undefined, string | undefined][] = [
    ['Expected salary', cand.fields.expectedSalary, cand.parsed.salary ? formatMoney(cand.parsed.salary as MoneyParse) : undefined],
    ['Current salary', cand.fields.currentSalary, cand.parsed.standard?.currentSalary ? `₹${(Number(cand.parsed.standard.currentSalary) / 1e5).toLocaleString('en-IN', { maximumFractionDigits: 2 })} L` : undefined],
    ['Experience', cand.fields.experience, cand.parsed.standard?.experience ? `${cand.parsed.standard.experience} ${cand.parsed.standard.experience === '1' ? 'yr' : 'yrs'}` : undefined],
    ['Notice period', cand.fields.notice, cand.parsed.standard?.notice],
    ['Location', cand.fields.location, undefined],
    ['College', cand.fields.education, cand.parsed.standard?.degree ? [cand.parsed.standard.education, cand.parsed.standard.degree, cand.parsed.standard.graduationYear].filter(Boolean).join(' · ') : undefined],
    ['Current company', cand.fields.currentCompany, undefined],
  ]

  // The applicant's own LinkedIn / portfolio answer, cleaned up and named
  const profile = profileLink(cand.fields.profileLink)
  return (
    <div className="space-y-6">
      <Link href={`/roles/${id}/applicants`} className="text-[13px] text-muted hover:text-ink">← Applicants</Link>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-xl font-semibold">{cand.name}</h2>
          <p className="mt-1 text-sm text-muted">{[cand.email, cand.phone].filter(Boolean).join(' · ')}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge tone={STATUS_TONE[cand.status]}>{STATUS_LABEL[cand.status]}</Badge>
            <Badge>{stageLabel(role.spec, cand.stage)}</Badge>
            {(cand.parsed.preferredColleges ?? []).map(p => <Badge key={p} tone="info">Preferred: {p}</Badge>)}
            {cand.fields.resume && <a href={cand.fields.resume} target="_blank" rel="noreferrer" className="text-[12px] text-accent underline">Resume</a>}
            {profile && (
              <a href={profile.href} target="_blank" rel="noreferrer" title={profile.shortened ? `Short link — the real page is only shown once opened: ${profile.href}` : profile.href} className="text-[12px] text-accent underline">
                {profile.label}
              </a>
            )}
          </div>
        </div>
        {role.status !== 'closed' && <DecisionButtons roleId={id} candidateId={cid} status={cand.status} stage={cand.stage} guaranteed={guaranteed} />}
      </div>

      {(cand.parsed.flags ?? []).length > 0 && (
        <Notice tone="warn" title="Worth a glance">
          <ul className="list-inside list-disc">{cand.parsed.flags!.map(f => <li key={f}>{f}</li>)}</ul>
        </Notice>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-6">
          {screening && (
            <Card>
              <CardHeader
                title={`Answer screening · ${screening.score ?? '—'}/100`}
                description={`Scored ${when(screening.created_at)} by ${screening.model ?? 'AI'}${fallbackNote(screening)} against the answer keys in Setup. Each score cites the candidate's own words.`}
                action={screening.band && <Badge tone={screening.band === 'strong' ? 'success' : screening.band === 'possible' ? 'warn' : 'neutral'}>{screening.band === 'strong' ? 'Strong' : screening.band === 'possible' ? 'Possible' : 'Not a fit'}</Badge>}
              />
              <BreakdownList items={screeningBreakdown(role.spec, screening.details, cand.answers)} />
              {Array.isArray(screening.details.artifacts) && (screening.details.artifacts as string[]).length > 0 && (
                <div className="border-t border-line px-5 py-3"><Notice tone="warn" title="Copied from an AI tool?">{(screening.details.artifacts as string[]).join(' · ')}</Notice></div>
              )}
            </Card>
          )}

          {resume && !resume.details.failed && (
            <Card>
              <CardHeader title={`Resume check · ${resume.score ?? '—'}/100`} description="Read from the uploaded resume. Experience is calculated from the dates of each role, not taken from the form." />
              <div className="space-y-4 px-5 py-4 text-[13px]">
                {resume.details.summary ? <p className="leading-relaxed">{String(resume.details.summary)}</p> : null}
                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="rounded-lg bg-surface-2 px-3 py-2"><p className="text-lg font-semibold tabular-nums">{String(resume.details.years ?? '—')}</p><p className="text-[12px] text-muted">years full-time</p></div>
                  <div className="rounded-lg bg-surface-2 px-3 py-2"><p className="text-lg font-semibold tabular-nums">{String(resume.details.internshipYears ?? '—')}</p><p className="text-[12px] text-muted">years of internships</p></div>
                  <div className="rounded-lg bg-surface-2 px-3 py-2"><p className="text-lg font-semibold">{resume.details.datesComplete ? 'Complete' : 'Partly unclear'}</p><p className="text-[12px] text-muted">dates on the resume</p></div>
                </div>
                {((resume.details.roles as { title: string; company: string; start: string; end: string; type: string }[]) ?? []).length > 0 && (
                  <div>
                    <p className="mb-1.5 text-[12px] font-medium text-muted">Work history</p>
                    <ul className="space-y-1">
                      {(resume.details.roles as { title: string; company: string; start: string; end: string; type: string }[]).map((r, i) => (
                        <li key={i} className="flex flex-wrap justify-between gap-2"><span><span className="font-medium">{r.title}</span> · {r.company}</span><span className="text-muted">{r.start} – {r.end} · {r.type.replace('_', ' ')}</span></li>
                      ))}
                    </ul>
                  </div>
                )}
                {((resume.details.education as { institution: string; degree: string; year: string }[]) ?? []).length > 0 && (
                  <div>
                    <p className="mb-1.5 text-[12px] font-medium text-muted">Education</p>
                    <ul className="space-y-1">{(resume.details.education as { institution: string; degree: string; year: string }[]).map((e, i) => <li key={i}>{e.degree} · {e.institution}{e.year ? ` · ${e.year}` : ''}</li>)}</ul>
                  </div>
                )}
                <div>
                  <p className="mb-1.5 text-[12px] font-medium text-muted">Skills the resume was checked for</p>
                  <ul className="space-y-2">
                    {((resume.details.skills as { skillId: string; score: number; evidence: string; reasoning?: string }[]) ?? []).map(sk => (
                      <li key={sk.skillId} className="flex items-start justify-between gap-3">
                        <div><p className="font-medium">{skillName(sk.skillId)}</p><p className="text-muted">{sk.evidence ? `“${sk.evidence}”` : 'No evidence in the resume.'}</p>{sk.reasoning && <p className="text-[12px] text-faint">{sk.reasoning}</p>}</div>
                        <Badge tone={scoreTone(sk.score)}>{sk.score}/5</Badge>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </Card>
          )}

          {(sessions ?? []).map(s => {
            const round = role.spec.interviewRounds.find(r => r.id === s.round_id)
            const ev = (evals as Evaluation[] | null)?.find(e => e.stage === s.round_id)
            return (
              <Card key={s.id} id={`round-${s.round_id}`}>
                <CardHeader
                  title={`${round?.name ?? 'Interview'}${ev?.score != null ? ` · ${ev.score}/100` : ''}`}
                  description={s.state === 'submitted' ? `Completed ${when(s.submitted_at!)}${ev?.model ? ` · scored by ${ev.model}${fallbackNote(ev)}` : ''}` : s.state === 'expired' ? 'Not completed before the deadline' : s.state === 'cancelled' ? 'Cancelled' : `Invited ${when(s.invited_at)} · due ${when(s.expires_at)}`}
                  action={<Badge tone={s.state === 'submitted' ? 'success' : s.state === 'expired' ? 'danger' : 'accent'}>{s.state === 'submitted' ? 'Completed' : s.state === 'started' ? 'In progress' : s.state}</Badge>}
                />
                <SummaryBlock summary={ev?.details.summary as string | undefined} strengths={ev?.details.strengths as string[] | undefined} concerns={ev?.details.concerns as string[] | undefined} />
                {round && round.kind === 'ai' && (s.interview_answers ?? []).length > 0 ? (
                  <BreakdownList items={interviewBreakdown(round, ev?.details ?? null, s.interview_answers as StoredAnswer[])} />
                ) : (
                  <p className="px-5 py-4 text-[13px] text-muted">No answers recorded yet.</p>
                )}
              </Card>
            )
          })}

          {(!screening || Object.keys(cand.answers).some(k => k.startsWith('extra:'))) && (
          <Card>
            <CardHeader title={screening ? 'Other answers on the form' : 'Application answers'} />
            <ul className="divide-y divide-line">
              {/* In the role's question order, then any extra form questions */}
              {Object.entries(cand.answers).filter(([k]) => !screening || k.startsWith('extra:')).sort(([a], [b]) => questionOrder(a) - questionOrder(b)).map(([k, v]) => (
                <li key={k} className="px-5 py-3 text-[13px]">
                  <p className="font-medium">{k.startsWith('extra:') ? k.slice(6) : qText(k)}</p>
                  <p className="mt-1 whitespace-pre-wrap text-muted">{v}</p>
                </li>
              ))}
            </ul>
          </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Details" description="What they wrote, and how it was read." />
            <dl className="divide-y divide-line">
              {facts.filter(([, raw]) => raw).map(([label, raw, read]) => (
                <div key={label} className="px-5 py-2.5 text-[13px]">
                  <dt className="text-faint">{label}</dt>
                  <dd className="mt-0.5 text-ink">{raw}</dd>
                  {read && read !== raw && <dd className="text-[12px] text-accent">Read as {read}</dd>}
                </div>
              ))}
            </dl>
            {(cand.parsed.changes ?? []).length > 0 && (
              <details className="border-t border-line px-5 py-3 text-[12px]">
                <summary className="cursor-pointer font-medium">Every conversion ({cand.parsed.changes!.length})</summary>
                <ul className="mt-2 space-y-1 text-muted">
                  {cand.parsed.changes!.map((ch, i) => <li key={i}><span className="text-ink">{FIELD_LABELS[ch.field as Field] ?? ch.field}:</span> “{ch.from}” → {ch.to || '(blank)'} — {ch.note}</li>)}
                </ul>
              </details>
            )}
          </Card>

          {eligibility && (
            <Card>
              <CardHeader title="Eligibility" />
              <ul className="divide-y divide-line">
                {((eligibility.details.results as { criterion: string; verdict: string; reason: string }[]) ?? []).map(r => (
                  <li key={r.criterion} className="flex items-start gap-2 px-5 py-2.5 text-[13px]">
                    <Badge tone={r.verdict === 'pass' ? 'success' : r.verdict === 'review' ? 'warn' : 'danger'}>{r.verdict === 'pass' ? 'Pass' : r.verdict === 'review' ? 'Check' : 'Out'}</Badge>
                    <span className="text-muted">{r.reason}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {(docs ?? []).some(d => d.status === 'failed') && (
            <Notice tone="warn" title="Resume couldn't be read">{docs!.find(d => d.status === 'failed')?.error}</Notice>
          )}

          <Card>
            <CardHeader title="History" description="Every decision, newest first." />
            <ol className="divide-y divide-line">
              {((decs ?? []) as (DecisionRow & { profiles: { full_name: string; email: string } | null })[]).map(d => (
                <li key={d.id} className="px-5 py-3 text-[13px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{stageLabel(role.spec, d.stage)}</span>
                    <span className="text-[12px] text-faint">{when(d.created_at)}</span>
                  </div>
                  <p className="mt-0.5 text-muted">{d.reason}</p>
                  <p className="mt-0.5 text-[12px] text-faint">
                    {d.outcome} · {d.actor_type === 'human' ? d.profiles?.full_name || d.profiles?.email || 'A person' : d.actor_type === 'ai' ? 'AI' : 'Rules'}
                  </p>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </div>
  )
}
