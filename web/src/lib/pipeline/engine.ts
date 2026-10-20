import 'server-only'
import { db } from '../supabase/server'
import { getRole } from '../data/roles'
import { recordDecision, runEligibility, type CandidateRow } from '../data/candidates'
import { screenCandidate } from './screen'
import { resumeCandidate } from './resumeStage'
import { applyCut } from './cut'
import { expireOverdue, inviteToRound, remindIfDue, scoreSession } from './rounds'
import { notifyRole } from './notify'
import { sendQueued } from '../email/outbox'
import { QuotaExceeded } from '../ai/quota'
import { AiBadOutput, AiUnavailable } from '../ai/providers'
import { stageLabel } from './stages'
import { claimLock, releaseLock } from './lock'
import { allRows } from '../data/paging'

export interface TickResult {
  ran: boolean
  reason?: string
  screened: number
  resumes: number
  invited: number
  scored: number
  cuts: string[]
  pendingCuts: string[]
  emails: { sent: number; failed: number; blocked?: string }
  waiting?: string
  errors: string[]
}


async function candidatesAt(roleId: string, stage: string, status = 'active') {
  return (await allRows((a, b) => db().from('candidates').select('*').eq('role_id', roleId).eq('stage', stage).eq('status', status).is('merged_into', null).order('created_at').order('id').range(a, b))) as CandidateRow[]
}

async function hasEval(candidateId: string, stage: string, version: number) {
  const { data } = await db().from('evaluations').select('id').eq('candidate_id', candidateId).eq('stage', stage).eq('role_version', version).limit(1)
  return !!data?.length
}

/**
 * Advance one role as far as time and free-tier quota allow:
 * eligibility → answer screening → resume → cut → AI rounds (invite, remind,
 * expire, score, cut) → human round hand-off → send emails. Safe to call
 * repeatedly; every step is idempotent.
 */
const SCREEN_PARALLEL = 4

export async function tick(roleId: string, budgetMs = 40_000): Promise<TickResult> {
  const started = Date.now()
  const timeLeft = () => budgetMs - (Date.now() - started)
  const res: TickResult = { ran: false, screened: 0, resumes: 0, invited: 0, scored: 0, cuts: [], pendingCuts: [], emails: { sent: 0, failed: 0 }, errors: [] }

  const role = await getRole(roleId)
  if (!role) return { ...res, reason: 'Role not found' }
  if (role.status !== 'active') return { ...res, reason: role.status === 'paused' ? 'Role is paused' : 'Role is not live yet' }
  const lock = await claimLock(roleId, 'engine')
  if (!lock) return { ...res, reason: 'Already running in another window' }
  res.ran = true
  const { spec, current_version: version } = role

  const stop = (e: unknown): boolean => {
    if (e instanceof QuotaExceeded) {
      res.waiting = e.message
      return true
    }
    if (e instanceof AiUnavailable) {
      res.waiting = friendlyAiError(e.message)
      return true
    }
    // Database errors arrive as plain objects with a message, not Error instances
    res.errors.push(e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e))
    return res.errors.length >= 3
  }

  try {
    await runEligibility(roleId, spec)

    // Answer screening
    // Screening gets at most ~60% of the run so resumes (and everything after)
    // keep moving too — otherwise nothing downstream starts until every
    // answer in a big pool has been scored.
    // A few at a time: each AI call can take 10-20 s when the free tier is
    // busy, and four in flight still stays well under its per-minute limit.
    const toScreen = await candidatesAt(roleId, 'screening')
    let halted = false
    for (let i = 0; i < toScreen.length && !halted; i += SCREEN_PARALLEL) {
      if (timeLeft() < Math.max(8_000, budgetMs * 0.4) || res.waiting) break
      await Promise.all(toScreen.slice(i, i + SCREEN_PARALLEL).map(async c => {
        try {
          await screenCandidate(roleId, version, spec, c)
          res.screened++
        } catch (e) {
          // One unreadable answer set must not block the queue forever
          if (e instanceof AiBadOutput && (await giveUpAfterRepeatedFailures(c, 'screening'))) return
          if (stop(e)) halted = true
        }
      }))
    }

    // Resume check
    if (!res.waiting) {
      for (const c of await candidatesAt(roleId, 'resume')) {
        if (timeLeft() < 10_000 || res.waiting) break
        if (await hasEval(c.id, 'resume', version)) continue
        try {
          await resumeCandidate(roleId, version, spec, c)
          res.resumes++
        } catch (e) {
          if (e instanceof AiBadOutput && (await giveUpAfterRepeatedFailures(c, 'resume'))) continue
          if (stop(e)) break
        }
      }
    }

    // Screening cut: once nobody is still being screened or read
    const screeningLeft = (await candidatesAt(roleId, 'screening')).length + (await candidatesAt(roleId, 'eligibility')).length
    const atResume = await candidatesAt(roleId, 'resume')
    const resumeDone = (await Promise.all(atResume.map(c => hasEval(c.id, 'resume', version)))).every(Boolean)
    if (atResume.length && !screeningLeft && resumeDone) {
      if (role.autopilot) {
        const r = await applyCut(roleId, spec, 'resume', { type: 'system' })
        res.cuts.push(`Screening: ${r.advanced} moved on, ${r.waitlisted} waitlisted, ${r.out} below the bar${r.review ? `, ${r.review} need a look` : ''}`)
      } else {
        res.pendingCuts.push('resume')
        await notifyRole(roleId, 'cut_ready', 'Screening is done — ready to shortlist', `${atResume.length} candidates are scored. Review and apply the cut to send round invites.`, `/roles/${roleId}/interviews`)
      }
    }

    // Interview rounds, in order
    for (const round of spec.interviewRounds) {
      if (timeLeft() < 5_000) break
      if (round.kind === 'human') {
        const waiting = await candidatesAt(roleId, round.id)
        for (const c of waiting) {
          const { data: m } = await db().from('meetings').select('id').eq('candidate_id', c.id).eq('round_id', round.id).maybeSingle()
          if (!m) await db().from('meetings').insert({ candidate_id: c.id, round_id: round.id, duration_min: round.durationMin, interviewer_emails: round.interviewerEmails })
        }
        const { count } = await db().from('meetings').select('id', { count: 'exact', head: true }).eq('round_id', round.id).eq('state', 'to_schedule').in('candidate_id', waiting.map(c => c.id))
        if (count) await notifyRole(roleId, 'schedule_human', `${count} candidate${count === 1 ? '' : 's'} ready for ${round.name}`, 'All AI rounds are done. Their scores, interview summaries and recordings are in the shortlist report. Pick times that suit the interviewer and candidate on the Interviews tab — the Meet invite goes out automatically.', `/roles/${roleId}/report`)
        continue
      }

      for (const c of await candidatesAt(roleId, round.id)) {
        try {
          if (await inviteToRound(roleId, version, spec, round, c, role.title)) res.invited++
        } catch (e) {
          if (stop(e)) break
        }
      }
      await remindIfDue(roleId, round, role.title)
      await expireOverdue(roleId, round)

      const { data: done } = await db().from('interview_sessions').select('id, candidate_id').eq('role_id', roleId).eq('round_id', round.id).eq('preview', false).eq('state', 'submitted')
      for (const s of done ?? []) {
        if (timeLeft() < 8_000 || res.waiting) break
        if (await hasEval(s.candidate_id, round.id, version)) continue
        const { data: ev } = await db().from('evaluations').select('id').eq('candidate_id', s.candidate_id).eq('stage', round.id).limit(1)
        if (ev?.length) continue
        try {
          await scoreSession(s.id)
          res.scored++
        } catch (e) {
          if (e instanceof AiBadOutput) {
            const { data: c } = await db().from('candidates').select('*').eq('id', s.candidate_id).single()
            if (c && (await giveUpAfterRepeatedFailures(c as CandidateRow, round.id))) continue
          }
          if (stop(e)) break
        }
      }

      // Round cut: everyone still in the round has finished and been scored
      const inRound = await candidatesAt(roleId, round.id)
      if (inRound.length) {
        const { data: sessions } = await db().from('interview_sessions').select('candidate_id, state').eq('round_id', round.id).eq('preview', false).in('candidate_id', inRound.map(c => c.id))
        const allSubmitted = inRound.every(c => sessions?.some(s => s.candidate_id === c.id && s.state === 'submitted'))
        const { data: evs } = await db().from('evaluations').select('candidate_id').eq('stage', round.id).in('candidate_id', inRound.map(c => c.id))
        const allScored = inRound.every(c => evs?.some(e => e.candidate_id === c.id))
        if (allSubmitted && allScored) {
          if (role.autopilot) {
            const r = await applyCut(roleId, spec, round.id, { type: 'system' })
            res.cuts.push(`${round.name}: ${r.advanced} moved on, ${r.waitlisted} waitlisted, ${r.out} below the bar`)
          } else {
            res.pendingCuts.push(round.id)
            await notifyRole(roleId, 'cut_ready', `${round.name} is complete — ready to shortlist`, `Everyone has finished ${stageLabel(spec, round.id)}. Review the scores and apply the cut.`, `/roles/${roleId}/interviews`)
          }
        }
      }
    }

    res.emails = await sendQueued(25, Math.max(3_000, timeLeft() - 2_000))
  } catch (e) {
    stop(e)
  } finally {
    await releaseLock(lock, res.waiting ? 'waiting_quota' : 'done', res)
  }
  return res
}

/** Turn a provider error ("gemini… returned 503: {json}") into something HR can read. */
export function friendlyAiError(raw: string): string {
  const model = /gemini/i.test(raw) ? 'Google Gemini' : /groq|gpt-oss|whisper/i.test(raw) ? 'Groq' : 'The AI service'
  const code = Number(raw.match(/\b(4\d\d|5\d\d)\b/)?.[1])
  const why =
    code === 503 || /high demand|overloaded|UNAVAILABLE/i.test(raw) ? 'is busy right now (high demand on the free tier)'
    : code === 429 ? 'is rate-limiting free requests for a moment'
    : code >= 500 ? 'had a temporary error'
    : code === 401 || code === 403 ? 'rejected the API key — check it in Settings'
    : 'could not be reached'
  // Reaching here means every model in the Gemini chain was busy or used up
  const retry = code === 401 || code === 403 ? '' : ' HireEasy retries on its own; nothing is lost. Scores from a fallback model are marked, and autopilot never decides on them alone.'
  return `${model} ${why}.${retry}`
}

const MAX_AI_ATTEMPTS = 3

/** Count a failed AI read; after a few, hand the candidate to a person instead of retrying forever. */
async function giveUpAfterRepeatedFailures(c: CandidateRow, stage: string): Promise<boolean> {
  const attempts = ((c.parsed as { aiFailures?: Record<string, number> }).aiFailures?.[stage] ?? 0) + 1
  const aiFailures = { ...((c.parsed as { aiFailures?: Record<string, number> }).aiFailures ?? {}), [stage]: attempts }
  if (attempts < MAX_AI_ATTEMPTS) {
    await db().from('candidates').update({ parsed: { ...c.parsed, aiFailures } }).eq('id', c.id)
    return false
  }
  await recordDecision({ candidateId: c.id, stage, outcome: 'review', actorType: 'ai', reason: `The AI could not ${stage === 'screening' ? 'score these answers' : stage === 'resume' ? 'read this resume' : 'score this interview'} reliably after ${attempts} tries — please review them by hand.`, via: 'ai' })
  await db().from('candidates').update({ parsed: { ...c.parsed, aiFailures }, status: 'review', updated_at: new Date().toISOString() }).eq('id', c.id)
  return true
}
