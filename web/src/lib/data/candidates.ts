import 'server-only'
import { db } from '../supabase/server'
import { evaluateEligibility, type EligibilityCriteria } from '../eligibility/evaluate'
import type { RoleSpec } from '../templates/types'
import { matchPreferredColleges } from '../colleges'
import { audit } from './roles'
import { allRows } from './paging'

export interface CandidateRow {
  id: string
  role_id: string
  external_id: string
  name: string
  email: string
  phone: string
  fields: Record<string, string>
  answers: Record<string, string>
  parsed: CandidateParsed
  stage: string
  status: 'active' | 'review' | 'out' | 'hired'
  merged_into: string | null
  created_at: string
  updated_at: string
}

export interface CandidateParsed {
  /** Standard-form values after conversion */
  standard?: Record<string, string>
  /** Every conversion the import made, for "What we changed" */
  changes?: { field: string; from: string; to: string; note: string; check: boolean }[]
  /** The experience column was asked "in years" — a bare number has that unit */
  experienceInYears?: boolean
  salary?: unknown
  experience?: unknown
  notice?: unknown
  flags?: string[]
  preferredColleges?: string[]
  /** Latest overall score per stage */
  scores?: Record<string, number>
}

export interface DecisionRow {
  id: string
  candidate_id: string
  stage: string
  outcome: 'advance' | 'exclude' | 'review' | 'reject' | 'restore' | 'hold'
  actor_type: 'system' | 'ai' | 'human'
  actor_id: string | null
  reason: string
  via?: 'cut' | 'override' | 'rules' | 'ai' | 'interview' | null
  created_at: string
}

/** The role's eligibility settings in the form the evaluator takes. */
export function criteriaFor(spec: RoleSpec): EligibilityCriteria {
  const b = spec.eligibility.budget
  return {
    budget: { enabled: b.enabled, maxLpa: b.compareAgainst === 'fixed' ? b.fixedLpa : b.fixedLpa + b.variableLpa, tolerancePct: b.tolerancePct, action: b.action },
    experience: spec.eligibility.experience,
    notice: spec.eligibility.notice,
    location: spec.eligibility.location,
  }
}

export async function recordDecision(d: { candidateId: string; stage: string; outcome: DecisionRow['outcome']; actorType: DecisionRow['actor_type']; actorId?: string | null; reason: string; via?: DecisionRow['via'] }) {
  const { error } = await db().from('decisions').insert({
    candidate_id: d.candidateId,
    stage: d.stage,
    outcome: d.outcome,
    actor_type: d.actorType,
    actor_id: d.actorId ?? null,
    reason: d.reason,
    via: d.via ?? null,
  })
  if (error) throw error
}

/**
 * Check eligibility for candidates waiting at that stage. Deterministic and
 * instant — no AI. Uses the raw answers (not the standardised ones) so that
 * uncertainty about a figure is never lost before the decision.
 */
/** A bare number from a column that is already "in years" gets its unit, so it's read with full confidence. */
export function withYearUnit(raw: string | undefined, inYears: boolean): string | undefined {
  return inYears && raw && /^\s*\d+(\.\d+)?\s*$/.test(raw) ? `${raw.trim()} years` : raw
}

export async function runEligibility(roleId: string, spec: RoleSpec, onlyIds?: string[]) {
  const list = (await allRows((a, b) => {
    let q = db().from('candidates').select('*').eq('role_id', roleId).eq('stage', 'eligibility').eq('status', 'active').is('merged_into', null)
    if (onlyIds) q = q.in('id', onlyIds)
    return q.order('id').range(a, b)
  })) as CandidateRow[]
  if (!list.length) return 0
  const criteria = criteriaFor(spec)
  const now = new Date().toISOString()

  const evaluations: Record<string, unknown>[] = []
  const decisions: Record<string, unknown>[] = []
  const updates: Record<string, unknown>[] = []

  for (const c of list) {
    const r = evaluateEligibility(
      { expectedSalary: c.fields.expectedSalary, experience: withYearUnit(c.fields.experience, c.parsed.experienceInYears === true), notice: c.fields.notice, location: c.fields.location },
      criteria,
    )
    const preferred = matchPreferredColleges(c.fields.education, spec.preferredColleges)
    const failing = r.results.filter(x => x.verdict === r.verdict && r.verdict !== 'pass')
    evaluations.push({ candidate_id: c.id, stage: 'eligibility', actor_type: 'system', details: { verdict: r.verdict, results: r.results, flags: r.flags } })
    decisions.push({
      candidate_id: c.id,
      stage: 'eligibility',
      outcome: r.verdict === 'pass' ? 'advance' : r.verdict === 'review' ? 'review' : 'exclude',
      actor_type: 'system',
      reason: r.verdict === 'pass' ? 'Meets every eligibility check' : failing.map(x => x.reason).join(' · '),
    })
    updates.push({
      id: c.id,
      role_id: c.role_id,
      external_id: c.external_id,
      parsed: { ...c.parsed, salary: r.parsed.salary, experience: r.parsed.experience, notice: r.parsed.notice, flags: r.flags, preferredColleges: preferred },
      stage: r.verdict === 'pass' ? 'screening' : 'eligibility',
      status: r.verdict === 'pass' ? 'active' : r.verdict === 'review' ? 'review' : 'out',
      updated_at: now,
    })
  }

  for (const [table, rows] of [['evaluations', evaluations], ['decisions', decisions]] as const) {
    for (let i = 0; i < rows.length; i += 500) {
      const { error: e } = await db().from(table).insert(rows.slice(i, i + 500))
      if (e) throw e
    }
  }
  for (let i = 0; i < updates.length; i += 500) {
    const { error: e } = await db().from('candidates').upsert(updates.slice(i, i + 500), { onConflict: 'id' })
    if (e) throw e
  }
  return list.length
}

/**
 * A person overrides the system. Restoring an excluded candidate, or clearing
 * a "review" hold, moves them on to the next stage; stopping one takes them
 * out. Recorded with who did it and why.
 */
export async function humanDecision(args: {
  roleId: string
  candidateId: string
  actorId: string
  action: 'restore' | 'stop' | 'advance'
  reason: string
  nextStageOf: (stage: string) => string
}) {
  const { data: c } = await db().from('candidates').select('*').eq('id', args.candidateId).eq('role_id', args.roleId).single()
  if (!c) throw new Error('Candidate not found.')
  const cand = c as CandidateRow
  const why = args.reason.trim() || (args.action === 'stop' ? 'Stopped by a person' : 'Moved forward by a person')

  if (args.action === 'stop') {
    await recordDecision({ candidateId: cand.id, stage: cand.stage, outcome: 'reject', actorType: 'human', actorId: args.actorId, reason: why, via: 'override' })
    await db().from('candidates').update({ status: 'out', updated_at: new Date().toISOString() }).eq('id', cand.id)
  } else {
    // Restore/advance from eligibility or a review hold: on to the next stage.
    // Inside a scored stage that hasn't been cut yet, the override is kept and
    // the candidate is guaranteed a place when the cut happens.
    const leavesStage = cand.stage === 'eligibility' || cand.status !== 'active'
    await recordDecision({
      candidateId: cand.id,
      stage: cand.stage,
      outcome: args.action === 'restore' ? 'restore' : 'advance',
      actorType: 'human',
      actorId: args.actorId,
      reason: why,
      via: 'override',
    })
    // Past the last stage means hired; restoring someone stopped in the final
    // round puts them back in it rather than hiring them
    let stage = leavesStage ? args.nextStageOf(cand.stage) : cand.stage
    let status: CandidateRow['status'] = 'active'
    if (stage === 'done') {
      if (args.action === 'advance') status = 'hired'
      else stage = cand.stage
    }
    await db().from('candidates').update({ status, stage, updated_at: new Date().toISOString() }).eq('id', cand.id)
  }
  await audit(args.roleId, args.actorId, `candidate.${args.action}`, { candidateId: cand.id, stage: cand.stage })
}
