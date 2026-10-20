import type { Metadata } from 'next'
import Link from 'next/link'

import { getRoleForPage } from '@/lib/data/roles'
import { canManageRoles } from '@/lib/auth'
import { db } from '@/lib/supabase/server'
import { agreement, getSample, MIN_VALIDATE_LABELS, PASS_AGREEMENT, type Band, latestPerCandidate } from '@/lib/data/calibration'
import { Badge, Card, CardHeader, HowItWorks, Notice } from '@/components/ui'
import { StartCalibration, LabelForm, CalibrationActions } from './controls'

export const metadata: Metadata = { title: 'Calibration' }

const BAND_LABEL: Record<Band, string> = { strong: 'Strong', possible: 'Possible', no: 'Not a fit' }

export default async function CalibrationPage({ params, searchParams }: PageProps<'/roles/[id]/calibration'>) {
  const { id } = await params
  const sp = await searchParams
  const { me, role } = await getRoleForPage(id)
  const sample = await getSample(id)

  const intro = (
    <HowItWorks
      title="Why calibrate?"
      steps={[
        'Before HireEasy shortlists on its own, it should agree with you. You label about 40 applicants — Strong, Possible or Not a fit — from their answers alone.',
        'You never see the AI\'s score, the name or the college while labelling, so your judgement stays independent.',
        'About a third of the sample is held back. Agreement is measured only on those, so the check can\'t be gamed by tuning.',
        `At ${PASS_AGREEMENT * 100}% agreement or more, the answer keys are locked and autopilot unlocks — for this role and future roles from the same template.`,
      ]}
    />
  )

  if (role.versionLocked) {
    return (
      <>
        {intro}
        <Notice tone="success" title="Calibrated">Version {role.current_version}’s answer keys are locked. Changing them in Setup creates a new version and pauses autopilot until you re-check.</Notice>
      </>
    )
  }

  if (!sample) {
    return (
      <>
        {intro}
        <Card className="p-6">
          <p className="text-sm font-medium">Ready when screening has scored at least 10 applicants.</p>
          <p className="mt-1 text-[13px] text-muted">The sample covers the best, the weakest and the ones nearest the bar — the hardest calls.</p>
          {role.status === 'closed' ? <p className="text-sm text-muted">This role is closed.</p> : <StartCalibration roleId={id} />}
        </Card>
      </>
    )
  }

  const ids = sample.map(s => s.candidateId)
  const [{ data: cands }, { data: labels }, { data: evs }] = await Promise.all([
    db().from('candidates').select('id, answers').in('id', ids),
    db().from('calibration_labels').select('candidate_id, band, note, user_id, created_at').eq('role_id', id).in('candidate_id', ids),
    db().from('evaluations').select('candidate_id, band, score, details, created_at').eq('stage', 'screening').in('candidate_id', ids).order('created_at', { ascending: false }),
  ])
  const mine = new Map((labels ?? []).filter(l => l.user_id === me.id).map(l => [l.candidate_id, l]))
  const anyLabel = latestPerCandidate(labels ?? [])
  const ai = new Map<string, { band: Band; score: number; details: Record<string, unknown> }>()
  for (const e of evs ?? []) if (!ai.has(e.candidate_id)) ai.set(e.candidate_id, { band: e.band as Band, score: Number(e.score), details: e.details })

  const order = sample.map((s, i) => ({ ...s, n: i + 1 }))
  const current = typeof sp.c === 'string' ? order.find(o => o.candidateId === sp.c) : order.find(o => !mine.has(o.candidateId))
  const cand = current && cands?.find(c => c.id === current.candidateId)

  const validate = order.filter(o => o.split === 'validate')
  const pairs = validate.filter(v => anyLabel.has(v.candidateId) && ai.has(v.candidateId)).map(v => ({ id: v.candidateId, human: anyLabel.get(v.candidateId)!.band as Band, ai: ai.get(v.candidateId)!.band }))
  const a = agreement(pairs)
  const enough = a.labelled >= Math.min(MIN_VALIDATE_LABELS, validate.length)
  const labelledCount = order.filter(o => anyLabel.has(o.candidateId)).length

  return (
    <div className="space-y-6">
      {intro}
      <div className="flex flex-wrap items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-line"><div className="h-full bg-accent" style={{ width: `${(labelledCount / order.length) * 100}%` }} /></div>
        <span className="text-[13px] tabular-nums text-muted">{labelledCount} of {order.length} labelled</span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          {cand && current ? (
            <Card>
              <CardHeader title={`Applicant ${current.n} of ${order.length}`} description="Judge only what's written. Name, college and the AI's score are hidden on purpose." />
              <ul className="divide-y divide-line">
                {role.spec.screeningQuestions.map((q, i) => (
                  <li key={q.id} className="px-5 py-4">
                    <p className="text-[13px] font-medium text-ink">Q{i + 1}. {q.text}</p>
                    <p className="mt-2 whitespace-pre-wrap rounded-lg bg-surface-2 px-3 py-2 text-[13px] leading-relaxed">{(cand.answers as Record<string, string>)[q.id] || <span className="text-faint">(no answer)</span>}</p>
                    <details className="mt-2 text-[12px] text-muted">
                      <summary className="cursor-pointer">Answer key</summary>
                      <p className="mt-1"><b>Strong:</b> {q.rubric[5]}</p>
                      <p><b>Average:</b> {q.rubric[3]}</p>
                      <p><b>Weak:</b> {q.rubric[1]}</p>
                    </details>
                  </li>
                ))}
              </ul>
              <div className="border-t border-line px-5 py-4">
                {role.status !== 'closed' && <LabelForm key={cand.id} roleId={id} candidateId={cand.id} initial={(mine.get(cand.id)?.band as Band) ?? null} initialNote={mine.get(cand.id)?.note ?? ''} nextHref={(() => {
                  const next = order.find(o => o.n > current.n && !mine.has(o.candidateId))
                  return next ? `/roles/${id}/calibration?c=${next.candidateId}` : `/roles/${id}/calibration?c=done`
                })()} />}
              </div>
            </Card>
          ) : (
            <Notice tone="success" title="You've labelled the whole sample">Check the agreement on the right. Click any applicant below to change a label.</Notice>
          )}

          <div className="mt-4 flex flex-wrap gap-1.5">
            {order.map(o => (
              <Link key={o.candidateId} href={`/roles/${id}/calibration?c=${o.candidateId}`} className={`flex h-8 w-8 items-center justify-center rounded-md border text-[12px] tabular-nums ${o.candidateId === current?.candidateId ? 'border-accent text-accent' : mine.has(o.candidateId) ? 'border-line bg-surface-2 text-muted' : 'border-line text-ink'}`}>
                {o.n}
              </Link>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <Card className="p-5">
            <p className="text-sm font-semibold">Agreement on held-out applicants</p>
            {enough ? (
              <>
                <p className={`mt-2 text-3xl font-semibold tabular-nums ${a.rate >= PASS_AGREEMENT ? 'text-success' : 'text-warn'}`}>{Math.round(a.rate * 100)}%</p>
                <p className="text-[12px] text-muted">{a.agree} of {a.labelled} match · kappa {a.kappa.toFixed(2)} · needs {PASS_AGREEMENT * 100}%</p>
                {a.labelled < MIN_VALIDATE_LABELS && <p className="mt-2 text-[12px] text-warn">Only {a.labelled} held-out applicant{a.labelled === 1 ? '' : 's'} — a rough guide. Locking unlocks autopilot for this role only, not the whole template.</p>}
              </>
            ) : (
              <p className="mt-2 text-[13px] text-muted">Shows once at least {Math.min(MIN_VALIDATE_LABELS, validate.length)} held-out applicants are labelled ({a.labelled} so far). Held-out applicants are mixed in — you can’t tell which they are.</p>
            )}
            {role.status !== 'closed' && <CalibrationActions roleId={id} canLock={enough && a.rate >= PASS_AGREEMENT && canManageRoles(me)} />}
          </Card>

          {enough && pairs.some(p => p.human !== p.ai) && (
            <Card>
              <CardHeader title="Where you and the AI differ" description="Sharpen the answer keys these point to, then re-score." />
              <ul className="divide-y divide-line">
                {pairs.filter(p => p.human !== p.ai).map(p => (
                  <li key={p.id} className="px-5 py-3 text-[13px]">
                    <Link href={`/roles/${id}/applicants/${p.id}`} className="font-medium hover:text-accent">Applicant {order.find(o => o.candidateId === p.id)?.n}</Link>
                    <p className="mt-0.5 text-muted">You: <Badge>{BAND_LABEL[p.human]}</Badge> · AI: <Badge tone="accent">{BAND_LABEL[p.ai]}</Badge> ({ai.get(p.id)?.score})</p>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
