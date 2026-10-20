import { IMPORTANCE_WEIGHT, type AdvanceRule, type RoleSpec, type Skill } from '../templates/types'

/**
 * Turning per-question scores into one number — done in code, never by the
 * model, so the same evidence always produces the same score.
 */

/** 1–5 answer-key score → 0–100. */
export const toPct = (score: number) => Math.round(((Math.min(5, Math.max(1, score)) - 1) / 4) * 100)

/** Good-to-haves count, but half as much as must-haves of the same importance. */
const GOOD_TO_HAVE_FACTOR = 0.5

export function skillWeight(spec: RoleSpec, skillId: string): number {
  const must = spec.mustHaves.find(s => s.id === skillId)
  if (must) return IMPORTANCE_WEIGHT[must.importance]
  const good = spec.goodToHaves.find(s => s.id === skillId)
  return good ? IMPORTANCE_WEIGHT[good.importance] * GOOD_TO_HAVE_FACTOR : 0
}

export const allSkills = (spec: RoleSpec): Skill[] => [...spec.mustHaves, ...spec.goodToHaves]

export interface QuestionScore {
  questionId: string
  score: number // 1–5
  skillIds: string[]
  /** Question importance weight */
  weight: number
}

/**
 * Per-skill scores (0–100) from question scores: each skill takes the
 * importance-weighted mean of the questions that test it.
 */
export function skillScoresFromQuestions(qs: QuestionScore[]): Record<string, number> {
  const acc: Record<string, { sum: number; w: number }> = {}
  for (const q of qs) {
    for (const id of q.skillIds) {
      acc[id] ??= { sum: 0, w: 0 }
      acc[id].sum += toPct(q.score) * q.weight
      acc[id].w += q.weight
    }
  }
  return Object.fromEntries(Object.entries(acc).map(([id, a]) => [id, Math.round(a.sum / a.w)]))
}

/** Merge skill scores from several sources (answers, resume): plain mean per skill. */
export function mergeSkillScores(...sources: Record<string, number>[]): Record<string, number> {
  const acc: Record<string, number[]> = {}
  for (const s of sources) for (const [id, v] of Object.entries(s)) (acc[id] ??= []).push(v)
  return Object.fromEntries(Object.entries(acc).map(([id, vs]) => [id, Math.round(vs.reduce((a, b) => a + b, 0) / vs.length)]))
}

/** Weighted overall score across the skills that were assessed. */
export function overallScore(spec: RoleSpec, skillScores: Record<string, number>): number | null {
  let sum = 0
  let w = 0
  for (const [id, v] of Object.entries(skillScores)) {
    const weight = skillWeight(spec, id)
    if (!weight) continue
    sum += v * weight
    w += weight
  }
  return w === 0 ? null : Math.round(sum / w)
}

/** Within this many points of the bar the AI is treated as unsure. */
export const BORDERLINE_MARGIN = 5

export type Band = 'strong' | 'possible' | 'no'

export function bandFor(score: number, rule: AdvanceRule): Band {
  if (score >= rule.minScore + 10) return 'strong'
  if (score >= rule.minScore - BORDERLINE_MARGIN) return 'possible'
  return 'no'
}

export interface Ranked {
  id: string
  score: number
  /** A person forced this candidate through or out */
  override?: 'advance' | 'out'
}

export interface Cut {
  advance: { id: string; reason: string }[]
  /** Cleared the bar but outside the cap — parked for a person to promote */
  waitlist: { id: string; reason: string }[]
  out: { id: string; reason: string }[]
}

/**
 * Score bar + maximum. Borderline candidates (within the margin below the
 * bar) get the benefit of the doubt: the next round gathers better evidence
 * than a guess now. Human overrides always win and don't use up the cap.
 */
export function applyAdvanceRule(candidates: Ranked[], rule: AdvanceRule): Cut {
  const cut: Cut = { advance: [], waitlist: [], out: [] }
  const forced = candidates.filter(c => c.override === 'advance')
  for (const c of forced) cut.advance.push({ id: c.id, reason: 'Moved forward by a person' })
  for (const c of candidates.filter(c => c.override === 'out')) cut.out.push({ id: c.id, reason: 'Stopped by a person' })

  const bar = rule.minScore - BORDERLINE_MARGIN
  const ranked = candidates.filter(c => !c.override).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
  let slots = rule.maxAdvance
  for (const c of ranked) {
    if (c.score < bar) {
      cut.out.push({ id: c.id, reason: `Scored ${c.score}, below the bar of ${rule.minScore}` })
    } else if (slots > 0) {
      slots--
      cut.advance.push({
        id: c.id,
        reason: c.score >= rule.minScore ? `Scored ${c.score} (bar ${rule.minScore})` : `Scored ${c.score} — just under the bar of ${rule.minScore}, advanced for a closer look`,
      })
    } else {
      cut.waitlist.push({ id: c.id, reason: `Scored ${c.score} and cleared the bar, but the round is capped at ${rule.maxAdvance}` })
    }
  }
  return cut
}
