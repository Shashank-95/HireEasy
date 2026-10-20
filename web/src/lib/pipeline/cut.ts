import 'server-only'
import { claimLock, releaseLock } from './lock'
import { db } from '../supabase/server'
import type { RoleSpec } from '../templates/types'
import { recordDecision, type CandidateRow } from '../data/candidates'
import { applyAdvanceRule, mergeSkillScores, overallScore, type Ranked } from './scoring'
import { nextStage, stageLabel } from './stages'
import { audit } from '../data/roles'
import { allRows, inChunks } from '../data/paging'

/** The score a stage's cut ranks on. Screening combines answers and resume. */
export async function stageScores(spec: RoleSpec, stage: string, cands: CandidateRow[]): Promise<Map<string, number>> {
  const ids = cands.map(c => c.id)
  const out = new Map<string, number>()
  if (!ids.length) return out
  const stages = stage === 'resume' ? ['screening', 'resume'] : [stage]
  const data = await inChunks(ids, chunk => db().from('evaluations').select('candidate_id, stage, score, details, created_at').in('candidate_id', chunk).in('stage', stages).order('created_at', { ascending: false }))
  const latest = new Map<string, { score: number | null; details: Record<string, unknown> }>()
  for (const e of data ?? []) {
    const k = `${e.candidate_id}:${e.stage}`
    if (!latest.has(k)) latest.set(k, { score: e.score, details: e.details })
  }
  for (const c of cands) {
    if (stage === 'resume') {
      const answers = (latest.get(`${c.id}:screening`)?.details.skillScores as Record<string, number>) ?? {}
      const resume = (latest.get(`${c.id}:resume`)?.details.skillScores as Record<string, number>) ?? {}
      const base = overallScore(spec, mergeSkillScores(answers, resume))
      if (base === null) continue
      const bonus = (c.parsed.preferredColleges ?? []).length ? spec.preferredCollegeBonus : 0
      out.set(c.id, Math.min(100, base + bonus))
    } else {
      const s = latest.get(`${c.id}:${stage}`)?.score
      if (s != null) out.set(c.id, Number(s))
    }
  }
  return out
}

/** The newest human decision in this stage, if any, forces the candidate through or out. */
async function overrides(stages: string[], ids: string[]): Promise<Map<string, 'advance' | 'out'>> {
  const out = new Map<string, 'advance' | 'out'>()
  if (!ids.length) return out
  // One-off decisions by a person — not the decisions a cut applied by HR wrote
  const data = await inChunks(ids, chunk => db().from('decisions').select('candidate_id, outcome, created_at').in('candidate_id', chunk).in('stage', stages).eq('actor_type', 'human').or('via.is.null,via.eq.override').order('created_at', { ascending: false }))
  for (const d of data) {
    if (out.has(d.candidate_id)) continue
    if (d.outcome === 'hold' || d.outcome === 'review') continue
    out.set(d.candidate_id, d.outcome === 'reject' || d.outcome === 'exclude' ? 'out' : 'advance')
  }
  return out
}

/**
 * Apply a stage's advance rule to everyone waiting in it. `stage` is the key
 * candidates sit in while waiting — 'resume' for screening (answers + resume),
 * or an AI round id. Slots already used by earlier cuts of the same stage
 * (e.g. a second import batch) count against the cap.
 */
export class CutInProgress extends Error {
  constructor() {
    super('A cut for this role is already running. Refresh in a moment to see the result.')
  }
}

/** Apply the advance rule to everyone at a stage. Only one cut per role runs at a time. */
export async function applyCut(roleId: string, spec: RoleSpec, stage: string, actor: { type: 'system' | 'human'; id?: string }) {
  const lock = await claimLock(roleId, 'cut', 120)
  if (!lock) throw new CutInProgress()
  try {
    return await runCut(roleId, spec, stage, actor)
  } finally {
    await releaseLock(lock)
  }
}

/**
 * Who a cut would move on, waitlist, stop or hand to a person — used by both
 * the preview on the Interviews tab and the real cut, so they always agree.
 */
export async function planCut(roleId: string, spec: RoleSpec, stage: string, opts: { autopilot?: boolean } = {}) {
  const rule = stage === 'resume' ? spec.screeningAdvance : (spec.interviewRounds.find(r => r.id === stage && r.kind === 'ai') as { advance: { minScore: number; maxAdvance: number } } | undefined)?.advance
  if (!rule) throw new Error(`Stage ${stage} has no advance rule.`)
  const cands = (await allRows((a, b) => db().from('candidates').select('*').eq('role_id', roleId).eq('stage', stage).eq('status', 'active').is('merged_into', null).order('id').range(a, b))) as CandidateRow[]
  const scores = await stageScores(spec, stage, cands)
  // A person may have decided while the candidate was still in answer screening
  const forced = await overrides(stage === 'resume' ? ['screening', 'resume'] : [stage], cands.map(c => c.id))
  const decisionStage = stage === 'resume' ? 'screening' : stage
  // Places already given out by earlier cuts at this stage (by autopilot or a person), not one-off overrides
  const { count: already } = await db().from('decisions').select('id, candidates!inner(role_id)', { count: 'exact', head: true }).eq('stage', decisionStage).eq('outcome', 'advance').eq('via', 'cut').eq('candidates.role_id', roleId)
  const remaining = Math.max(0, rule.maxAdvance - (already ?? 0))
  // A resume we couldn't read leaves its skills out of the score — not a fair
  // basis to move someone on or stop them, so a person decides
  const unreadable = stage === 'resume' ? await unreadableResumes(cands.map(c => c.id)) : new Map<string, string>()
  const review: { id: string; reason: string; kind: 'resume' | 'fallback' }[] = cands.filter(c => unreadable.has(c.id) && !forced.has(c.id)).map(c => ({ id: c.id, reason: unreadable.get(c.id)!, kind: 'resume' as const }))
  // Calibration vouched for the first model in the chain only. A score from a
  // fallback model (the first one's free day ran out) is shown with its
  // "scored by" badge and a person may cut on it, but autopilot doesn't
  // decide on it alone: those candidates go to a person.
  if (opts.autopilot) {
    const fallback = await fallbackScored(cands.map(c => c.id), stage === 'resume' ? ['screening', 'resume'] : [stage])
    for (const c of cands) if (fallback.has(c.id) && !forced.has(c.id) && !review.some(r => r.id === c.id)) review.push({ id: c.id, reason: fallback.get(c.id)!, kind: 'fallback' })
  }
  const ranked: Ranked[] = cands.filter(c => (scores.has(c.id) || forced.has(c.id)) && !review.some(r => r.id === c.id)).map(c => ({ id: c.id, score: scores.get(c.id) ?? 0, override: forced.get(c.id) }))
  const cut = applyAdvanceRule(ranked, { minScore: rule.minScore, maxAdvance: remaining })
  return { rule, cands, scores, forced, decisionStage, remaining, cut, review }
}

/** Candidates whose latest evaluation at these stages came from a fallback model, with a note saying which. */
async function fallbackScored(ids: string[], stages: string[]): Promise<Map<string, string>> {
  const evs = await inChunks(ids, chunk => db().from('evaluations').select('candidate_id, stage, model, details, created_at').in('candidate_id', chunk).in('stage', stages).order('created_at', { ascending: false }))
  const out = new Map<string, string>()
  const seen = new Set<string>()
  for (const e of evs) {
    const k = `${e.candidate_id}:${e.stage}`
    if (seen.has(k)) continue
    seen.add(k)
    const from = (e.details as { fellBackFrom?: string } | null)?.fellBackFrom
    if (from && !out.has(e.candidate_id)) out.set(e.candidate_id, `Scored by ${e.model} because ${from} was used up or busy on the free tier. Calibration checked ${from} only, so autopilot leaves this one to you`)
  }
  return out
}

async function unreadableResumes(ids: string[]): Promise<Map<string, string>> {
  const evs = await inChunks(ids, chunk => db().from('evaluations').select('candidate_id, details, created_at').in('candidate_id', chunk).eq('stage', 'resume').order('created_at', { ascending: false }))
  const out = new Map<string, string>()
  const seen = new Set<string>()
  for (const e of evs) {
    if (seen.has(e.candidate_id)) continue
    seen.add(e.candidate_id)
    const failed = (e.details as { failed?: string } | null)?.failed
    if (failed) out.set(e.candidate_id, failed)
  }
  return out
}

async function runCut(roleId: string, spec: RoleSpec, stage: string, actor: { type: 'system' | 'human'; id?: string }) {
  const { cands, scores, forced, decisionStage, cut, review } = await planCut(roleId, spec, stage, { autopilot: actor.type === 'system' })
  if (!cands.length) return { advanced: 0, waitlisted: 0, out: 0, review: 0 }
  const next = nextStage(spec, stage)
  const now = new Date().toISOString()
  const actorType = actor.type === 'human' ? 'human' : 'ai'

  for (const a of cut.advance) {
    const c = cands.find(x => x.id === a.id)!
    await recordDecision({ candidateId: a.id, stage: decisionStage, outcome: 'advance', actorType: forced.has(a.id) ? 'human' : actorType, actorId: actor.id, reason: `${a.reason} → ${stageLabel(spec, next)}`, via: forced.has(a.id) ? 'override' : 'cut' })
    await db().from('candidates').update({ stage: next, status: next === 'done' ? 'hired' : 'active', parsed: { ...c.parsed, scores: { ...(c.parsed.scores ?? {}), [decisionStage]: scores.get(a.id) ?? c.parsed.scores?.[decisionStage] } }, updated_at: now }).eq('id', a.id)
  }
  for (const w of cut.waitlist) {
    const c = cands.find(x => x.id === w.id)!
    await recordDecision({ candidateId: w.id, stage: decisionStage, outcome: 'hold', actorType, actorId: actor.id, reason: `${w.reason}. Waitlisted — move them forward from their page if a place opens.`, via: 'cut' })
    await db().from('candidates').update({ status: 'review', parsed: { ...c.parsed, scores: { ...(c.parsed.scores ?? {}), [decisionStage]: scores.get(w.id) } }, updated_at: now }).eq('id', w.id)
  }
  for (const o of cut.out) {
    const c = cands.find(x => x.id === o.id)!
    await recordDecision({ candidateId: o.id, stage: decisionStage, outcome: 'reject', actorType: forced.get(o.id) === 'out' ? 'human' : actorType, actorId: actor.id, reason: o.reason, via: forced.get(o.id) === 'out' ? 'override' : 'cut' })
    await db().from('candidates').update({ status: 'out', parsed: { ...c.parsed, scores: { ...(c.parsed.scores ?? {}), [decisionStage]: scores.get(o.id) } }, updated_at: now }).eq('id', o.id)
  }
  for (const r of review) {
    const c = cands.find(x => x.id === r.id)!
    const partial = scores.get(r.id)
    await recordDecision({ candidateId: r.id, stage: decisionStage, outcome: 'review', actorType: actor.type === 'human' ? 'human' : 'ai', actorId: actor.id, reason: r.kind === 'fallback' ? `${r.reason}${partial != null ? ` (score ${partial})` : ''}. Decide by hand: move them forward or stop them from their page.` : `Resume couldn’t be read (${r.reason.replace(/\.$/, '')}).${partial != null ? ` Their score of ${partial} leaves out what only the resume shows.` : ''} Decide by hand: move them forward or stop them from their page.`, via: 'cut' })
    await db().from('candidates').update({ status: 'review', parsed: { ...c.parsed, scores: { ...(c.parsed.scores ?? {}), [decisionStage]: partial } }, updated_at: now }).eq('id', r.id)
  }
  await audit(roleId, actor.id ?? null, 'stage.cut', { stage: decisionStage, advanced: cut.advance.length, waitlisted: cut.waitlist.length, out: cut.out.length, review: review.length })
  return { advanced: cut.advance.length, waitlisted: cut.waitlist.length, out: cut.out.length, review: review.length }
}
