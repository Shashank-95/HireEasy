import 'server-only'
import { randomUUID } from 'node:crypto'
import { db } from '../supabase/server'
import { RoleSpec, type AiRound } from '../templates/types'
import { recordDecision, type CandidateRow } from '../data/candidates'
import { hashToken, interviewToken } from '../crypto'
import { queueEmail } from '../email/outbox'
import { askJson, scoringChain, transcribe } from '../ai/providers'
import { buildRoundPrompt, checkRoundOutput, ROUND_SYSTEM, RoundOutput, roundResults, type Exchange } from '../ai/interview'
import { overallScore, skillScoresFromQuestions, toPct } from './scoring'

export const interviewLink = (sessionId: string) => `${process.env.NEXT_PUBLIC_APP_URL}/i/${interviewToken(sessionId)}`

export const fmtDeadline = (d: Date) =>
  d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) + ' IST'

/** Roughly how long the interview takes, for the invite. */
export const roundMinutes = (r: AiRound) => Math.max(5, Math.round(r.questions.reduce((s, q) => s + q.timeLimitSec * (1 + r.maxFollowUps * 0.5), 0) / 60 + 2))

/** Create a session and send the invite. Idempotent per candidate and round; true only when this call invited them. */
export async function inviteToRound(roleId: string, version: number, spec: RoleSpec, round: AiRound, c: CandidateRow, roleTitle: string): Promise<boolean> {
  const { data: existing } = await db().from('interview_sessions').select('id').eq('candidate_id', c.id).eq('round_id', round.id).eq('preview', false).maybeSingle()
  if (existing) return false
  const id = randomUUID()
  const expires = new Date(Date.now() + round.deadlineHours * 3_600_000)
  const { error } = await db().from('interview_sessions').insert({ id, candidate_id: c.id, role_id: roleId, round_id: round.id, role_version: version, token_hash: hashToken(interviewToken(id)), expires_at: expires.toISOString() })
  // Another run invited them a moment ago (one live session per candidate and round)
  if (error?.code === '23505') return false
  if (error) throw error
  await queueEmail({
    roleId,
    candidateId: c.id,
    kind: 'ai_invite',
    to: c.email,
    dedupeKey: `invite:${id}`,
    vars: { candidate_name: c.name.split(' ')[0] || c.name, role_title: roleTitle, round_name: round.name, interview_link: interviewLink(id), deadline: fmtDeadline(expires), minutes: String(roundMinutes(round)) },
  })
  return true
}

/** No reminder within this long of the invite. */
export const REMINDER_MIN_GAP_MS = 60 * 60_000

export async function remindIfDue(roleId: string, round: AiRound, roleTitle: string) {
  if (!round.reminderHoursBefore) return 0
  const cutoff = new Date(Date.now() + round.reminderHoursBefore * 3_600_000).toISOString()
  const { data } = await db()
    .from('interview_sessions')
    .select('id, expires_at, candidate_id, candidates(name, email, status)')
    .eq('role_id', roleId)
    .eq('round_id', round.id)
    .eq('preview', false)
    .in('state', ['invited', 'started'])
    .is('reminded_at', null)
    // A reminder window as long as the deadline (Setup only warns) would
    // otherwise send it in the same run as the invite
    .lt('invited_at', new Date(Date.now() - REMINDER_MIN_GAP_MS).toISOString())
    .lte('expires_at', cutoff)
    .gt('expires_at', new Date().toISOString())
  let n = 0
  for (const s of data ?? []) {
    const c = (Array.isArray(s.candidates) ? s.candidates[0] : s.candidates) as { name: string; email: string; status: string } | null
    if (!c || c.status !== 'active') continue
    await queueEmail({ roleId, candidateId: s.candidate_id, kind: 'ai_reminder', to: c.email, dedupeKey: `remind:${s.id}`, vars: { candidate_name: c.name.split(' ')[0] || c.name, role_title: roleTitle, round_name: round.name, interview_link: interviewLink(s.id), deadline: fmtDeadline(new Date(s.expires_at)) } })
    await db().from('interview_sessions').update({ reminded_at: new Date().toISOString() }).eq('id', s.id)
    n++
  }
  return n
}

/**
 * Past the deadline: anyone who recorded at least one answer is scored on
 * what they gave; anyone who never started is closed out as a no-show.
 */
export async function expireOverdue(roleId: string, round: AiRound) {
  const { data } = await db()
    .from('interview_sessions')
    .select('id, candidate_id, state, interview_answers(id)')
    .eq('role_id', roleId)
    .eq('round_id', round.id)
    .eq('preview', false)
    .in('state', ['invited', 'started'])
    .lt('expires_at', new Date().toISOString())
  for (const s of data ?? []) {
    const answered = (s.interview_answers ?? []).length > 0
    await db().from('interview_sessions').update({ state: answered ? 'submitted' : 'expired', submitted_at: answered ? new Date().toISOString() : null }).eq('id', s.id)
    if (!answered) {
      await recordDecision({ candidateId: s.candidate_id, stage: round.id, outcome: 'reject', actorType: 'system', reason: 'Did not take the interview before the deadline.' })
      await db().from('candidates').update({ status: 'out', updated_at: new Date().toISOString() }).eq('id', s.candidate_id)
    }
  }
}

/** Score a finished interview against the round's answer keys. */
/** Whisper text for an answer whose transcription was postponed (quota), from the stored audio. */
async function transcribePending(sessionId: string, hint: string) {
  const { data: pending } = await db().from('interview_answers').select('id, audio_path').eq('session_id', sessionId).is('transcript', null).not('audio_path', 'is', null)
  for (const a of pending ?? []) {
    const { data: file } = await db().storage.from('interview-audio').download(a.audio_path!)
    if (!file) continue
    let text = await transcribe(file, a.audio_path!.split('/').pop()!, hint)
    if (/^(thank you( for watching)?\.?|you\.?|bye\.?|\.+)$/i.test(text.trim())) text = ''
    await db().from('interview_answers').update({ transcript: text }).eq('id', a.id)
  }
}

/**
 * Score a submitted interview against the version of the role the candidate
 * actually took — not today's questions, which may have been edited since.
 */
export async function scoreSession(sessionId: string): Promise<number> {
  const { data: meta } = await db().from('interview_sessions').select('role_id, round_id, role_version').eq('id', sessionId).single()
  if (!meta) throw new Error('Session not found')
  const { data: v } = await db().from('role_versions').select('spec').eq('role_id', meta.role_id).eq('version', meta.role_version).single()
  const spec = RoleSpec.parse(v!.spec)
  const round = spec.interviewRounds.find(r => r.id === meta.round_id && r.kind === 'ai') as AiRound | undefined
  if (!round) throw new Error('That interview round no longer exists in this version of the role.')
  await transcribePending(sessionId, [spec.basics.title, ...spec.mustHaves.map(m => m.name)].join(', '))

  const { data: s } = await db().from('interview_sessions').select('id, candidate_id, role_version, preview, interview_answers(question_id, followup_index, prompt, transcript)').eq('id', sessionId).single()
  if (!s) throw new Error('Session not found')
  const exchanges: Exchange[] = (s.interview_answers ?? []).map(a => ({ questionId: a.question_id, prompt: a.prompt, transcript: a.transcript ?? '', followupIndex: a.followup_index }))
  const answered = round.questions.filter(q => exchanges.some(e => e.questionId === q.id && e.transcript.trim()))

  let results: { questionId: string; score: number; evidence: string; reasoning: string; elements?: unknown[] }[] = round.questions.filter(q => !answered.includes(q)).map(q => ({ questionId: q.id, score: 1, evidence: '', reasoning: 'Not answered.' }))
  let summary = 'No answers were recorded.'
  let strengths: string[] = []
  let concerns: string[] = []
  // One call for the whole interview: one model judges every answer. A
  // fallback model is recorded like in screening (see screenCandidate).
  const chain = scoringChain()
  let model = chain[0]
  let fellBackFrom: string | undefined
  if (answered.length) {
    const sub: AiRound = { ...round, questions: answered }
    const r = await askJson({ model: chain, system: ROUND_SYSTEM, user: buildRoundPrompt(spec, sub, exchanges), schema: RoundOutput, extraCheck: v => checkRoundOutput(v, sub) })
    model = r.model
    fellBackFrom = r.fellBackFrom
    results = [...results, ...roundResults(sub, r.value, exchanges)]
    summary = r.value.summary
    strengths = r.value.strengths
    concerns = r.value.concerns
  }

  const skills = skillScoresFromQuestions(results.map(r => ({ questionId: r.questionId, score: r.score, weight: 1, skillIds: round.questions.find(q => q.id === r.questionId)?.skillIds ?? [] })))
  // Questions without a linked skill still count: plain average as a fallback
  const overall = overallScore(spec, skills) ?? Math.round(results.reduce((a, r) => a + toPct(r.score), 0) / Math.max(1, results.length))

  const details = { sessionId, preview: s.preview, questions: results, skillScores: skills, summary, strengths, concerns, ...(fellBackFrom ? { fellBackFrom } : {}) }
  if (s.preview || !s.candidate_id) {
    // A "Try this interview" run by HR: keep the result on the session only
    await db().from('interview_sessions').update({ events: [{ type: 'score', at: new Date().toISOString(), score: overall, model, ...details }] }).eq('id', sessionId)
    return overall
  }
  await db().from('evaluations').insert({
    candidate_id: s.candidate_id,
    stage: round.id,
    actor_type: 'ai',
    model,
    role_version: s.role_version,
    score: overall,
    details,
  })
  {
    const { data: c } = await db().from('candidates').select('parsed').eq('id', s.candidate_id).single()
    const parsed = (c?.parsed ?? {}) as { scores?: Record<string, number> }
    await db().from('candidates').update({ parsed: { ...parsed, scores: { ...(parsed.scores ?? {}), [round.id]: overall } }, updated_at: new Date().toISOString() }).eq('id', s.candidate_id)
  }
  return overall
}
