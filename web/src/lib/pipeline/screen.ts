import 'server-only'
import { db } from '../supabase/server'
import type { RoleSpec } from '../templates/types'
import type { CandidateRow } from '../data/candidates'
import { recordDecision } from '../data/candidates'
import { askJson, MODELS, scoringChain, hasGroq } from '../ai/providers'
import { buildScreeningPrompt, checkScreeningOutput, questionWeight, screeningFlags, SCREENING_SYSTEM, ScreeningOutput, splitAnswers, toQuestionResults, type CalibrationExample, type QuestionResult } from '../ai/screening'
import { allSkills, bandFor, BORDERLINE_MARGIN, overallScore, skillScoresFromQuestions } from './scoring'

/** Highest overall score a candidate could reach if every resume-assessed skill scored 100. */
export function screeningCeiling(spec: RoleSpec, answerSkills: Record<string, number>): number | null {
  const best = { ...answerSkills }
  for (const s of allSkills(spec)) if (s.assessedBy.includes('resume')) best[s.id] = Math.max(best[s.id] ?? 0, 100)
  return overallScore(spec, best)
}

async function calibrationExamples(roleId: string): Promise<CalibrationExample[]> {
  // Labels the hiring team gave during calibration become worked examples
  const { data } = await db().from('calibration_labels').select('note, band, candidate_id, candidates(answers)').eq('role_id', roleId).eq('split', 'tune').limit(12)
  const out: CalibrationExample[] = []
  for (const l of data ?? []) {
    const ans = ((Array.isArray(l.candidates) ? l.candidates[0] : l.candidates) as { answers: Record<string, string> } | null)?.answers ?? {}
    const score = l.band === 'strong' ? 5 : l.band === 'possible' ? 3 : 1
    for (const [qid, text] of Object.entries(ans)) if (!qid.startsWith('extra:') && text.trim()) out.push({ questionId: qid, answer: text, score, note: l.note })
  }
  return out
}

async function scoreOnce(model: string | string[], spec: RoleSpec, answers: Record<string, string>, examples: CalibrationExample[]) {
  const { toScore, blank } = splitAnswers(spec, answers)
  let results: QuestionResult[] = [...blank]
  let used = { model: typeof model === 'string' ? model : model[0], fellBackFrom: undefined as string | undefined }
  if (toScore.length) {
    const r = await askJson({
      model,
      system: SCREENING_SYSTEM,
      user: buildScreeningPrompt(spec, toScore, examples),
      schema: ScreeningOutput,
      extraCheck: v => checkScreeningOutput(v, toScore, spec),
    })
    results = [...results, ...toQuestionResults(spec, r.value, toScore)]
    used = { model: r.model, fellBackFrom: r.fellBackFrom }
  }
  const skills = skillScoresFromQuestions(
    results.map(r => ({ questionId: r.questionId, score: r.score, weight: questionWeight(spec, r.questionId), skillIds: spec.screeningQuestions.find(q => q.id === r.questionId)?.skillIds ?? [] })),
  )
  return { results, skills, overall: overallScore(spec, skills) ?? 0, ...used }
}

/**
 * Score one candidate's answers. If the result lands near the bar, a second,
 * different model scores it too and the two are averaged — borderline calls
 * get two opinions, clear ones don't spend quota.
 *
 * The answers go to the Gemini chain as one call, so all of one candidate's
 * answers are judged by the same model. When the first model's free day is
 * gone, a later model in the chain scores instead: the evaluation records
 * which model (shown as "scored by …") and `fellBackFrom`. Calibration
 * measured agreement for the first model only, so a fallback score is a
 * score, not a decision: it never triggers the early "can't reach the bar"
 * stop below, and an autopilot cut hands such candidates to a person
 * (see planCut). A cut a person applies may use it — they see the badge.
 */
export async function screenCandidate(roleId: string, version: number, spec: RoleSpec, c: CandidateRow, opts: { route?: boolean } = {}) {
  const route = opts.route ?? true
  const examples = await calibrationExamples(roleId)
  const first = await scoreOnce(scoringChain(), spec, c.answers, examples)
  const model = first.model
  let { results, skills, overall } = first
  let second: typeof first | null = null
  const nearBar = Math.abs(overall - spec.screeningAdvance.minScore) <= BORDERLINE_MARGIN + 5

  if (nearBar && hasGroq() && model !== MODELS.second) {
    try {
      second = await scoreOnce(MODELS.second, spec, c.answers, examples)
      results = results.map(r => {
        const o = second!.results.find(x => x.questionId === r.questionId)
        return o ? { ...r, score: Math.round((r.score + o.score) / 2) } : r
      })
      skills = Object.fromEntries(Object.entries(skills).map(([k, v]) => [k, Math.round((v + (second!.skills[k] ?? v)) / 2)]))
      overall = overallScore(spec, skills) ?? overall
    } catch {
      // A second opinion is a bonus; the first score stands on its own
    }
  }

  const flags = screeningFlags(c.answers)
  const band = bandFor(overall, spec.screeningAdvance)
  await db().from('evaluations').insert({
    candidate_id: c.id,
    stage: 'screening',
    actor_type: 'ai',
    model: second ? `${model} + ${MODELS.second}` : model,
    role_version: version,
    score: overall,
    band,
    details: { questions: results, skillScores: skills, artifacts: flags.artifacts, injection: flags.injection, firstScore: first.overall, secondScore: second?.overall ?? null, ...(first.fellBackFrom ? { fellBackFrom: first.fellBackFrom } : {}) },
  })

  // Calibration re-scores only record a new evaluation; they never move anyone
  if (!route) return overall

  const ceiling = screeningCeiling(spec, skills) ?? overall
  const bar = spec.screeningAdvance.minScore - BORDERLINE_MARGIN
  const parsed = { ...c.parsed, scores: { ...(c.parsed.scores ?? {}), screening: overall }, flags: [...(c.parsed.flags ?? []), ...flags.artifacts, ...(flags.injection ? ['Answer tries to instruct the AI scorer'] : [])] }

  if (ceiling < bar && !first.fellBackFrom) {
    // Even a perfect resume could not lift them over the bar — stop here, save the resume read
    await recordDecision({ candidateId: c.id, stage: 'screening', outcome: 'reject', actorType: 'ai', reason: `Answers scored ${overall}. Even a perfect resume would reach only ${ceiling}, below the bar of ${spec.screeningAdvance.minScore}.` })
    await db().from('candidates').update({ parsed, status: 'out', updated_at: new Date().toISOString() }).eq('id', c.id)
  } else {
    await db().from('candidates').update({ parsed, stage: 'resume', updated_at: new Date().toISOString() }).eq('id', c.id)
  }
  return overall
}
