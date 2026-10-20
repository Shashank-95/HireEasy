'use server'
import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { canManageRoles, requireOpenRole, requireRoleAccess } from '@/lib/auth'
import { audit, getRole } from '@/lib/data/roles'
import { db } from '@/lib/supabase/server'
import { tick, type TickResult } from '@/lib/pipeline/engine'
import { applyCut } from '@/lib/pipeline/cut'
import { hashToken, interviewToken } from '@/lib/crypto'
import { createMeetEvent, cancelMeetEvent, meetDescription } from '@/lib/google'
import { queueEmail, sendQueued } from '@/lib/email/outbox'
import { recordDecision, type CandidateRow } from '@/lib/data/candidates'
import { nextStage } from '@/lib/pipeline/stages'
import { agreement, chooseSample, getSample, saveSample, PASS_AGREEMENT, MIN_VALIDATE_LABELS, type Band, latestPerCandidate } from '@/lib/data/calibration'
import { screenCandidate } from '@/lib/pipeline/screen'
import { QuotaExceeded } from '@/lib/ai/quota'
import { AiUnavailable } from '@/lib/ai/providers'
import { allRows } from '@/lib/data/paging'

type Res = { error?: string; ok?: string }
const msg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.')
const refresh = (id: string) => revalidatePath(`/roles/${id}`, 'layout')

export async function runNowAction(roleId: string): Promise<{ result?: TickResult; error?: string }> {
  try {
    await requireOpenRole(roleId)
    const result = await tick(roleId, 40_000)
    refresh(roleId)
    return { result }
  } catch (e) {
    return { error: msg(e) }
  }
}

export async function applyCutAction(roleId: string, stage: string): Promise<Res> {
  try {
    const me = await requireOpenRole(roleId)
    const role = await getRole(roleId)
    if (!role) return { error: 'Role not found.' }
    const r = await applyCut(roleId, role.spec, stage, { type: 'human', id: me.id })
    await db().from('notifications').update({ read_at: new Date().toISOString() }).eq('role_id', roleId).eq('kind', 'cut_ready').is('read_at', null)
    // Send the invites right away
    await tick(roleId, 30_000)
    refresh(roleId)
    return { ok: `${r.advanced} moved forward, ${r.waitlisted} waitlisted, ${r.out} below the bar${r.review ? `, ${r.review} need a look (resume unreadable)` : ''}.${r.advanced ? ' Invitations are going out.' : ''}` }
  } catch (e) {
    return { error: msg(e) }
  }
}

/** Autopilot is unlocked by calibration on this role, or on another role from the same template. */
export async function autopilotUnlocked(roleId: string): Promise<boolean> {
  const role = await getRole(roleId)
  if (!role) return false
  if (role.versionLocked) return true
  // Calibrated before, but the answer keys changed since: calibrate again
  const { count: lockedBefore } = await db().from('role_versions').select('version', { count: 'exact', head: true }).eq('role_id', roleId).not('locked_at', 'is', null)
  if (lockedBefore) return false
  if (!role.template_id) return false
  const { data: t } = await db().from('templates').select('calibrated').eq('id', role.template_id).single()
  return !!t?.calibrated
}

export async function setAutopilotAction(roleId: string, on: boolean): Promise<Res> {
  try {
    const me = await requireOpenRole(roleId)
    // Anyone on the role may switch it off; switching it on is HR's call
    if (on && !canManageRoles(me)) return { error: 'Only HR can turn autopilot on.' }
    if (on && !(await autopilotUnlocked(roleId))) return { error: 'Finish calibration first: label the sample on the Calibration tab until the AI agrees with you at least 80% of the time.' }
    await db().from('roles').update({ autopilot: on }).eq('id', roleId)
    await audit(roleId, me.id, on ? 'autopilot.on' : 'autopilot.off')
    refresh(roleId)
    return { ok: on ? 'Autopilot is on. Shortlists, invites and reminders now happen on their own.' : 'Autopilot is off. Cuts wait for you to apply them.' }
  } catch (e) {
    return { error: msg(e) }
  }
}

/** "Try this interview": a private session for HR/HM, never scored into the role. */
export async function previewInterviewAction(roleId: string, roundId: string): Promise<{ link?: string; error?: string }> {
  try {
    await requireOpenRole(roleId)
    const role = await getRole(roleId)
    const round = role?.spec.interviewRounds.find(r => r.id === roundId && r.kind === 'ai')
    if (!role || !round || round.kind !== 'ai') return { error: 'Round not found.' }
    if (!round.questions.length) return { error: 'Add questions to this round first.' }
    const id = randomUUID()
    const { error } = await db().from('interview_sessions').insert({ id, role_id: roleId, round_id: roundId, role_version: role.current_version, token_hash: hashToken(interviewToken(id)), preview: true, expires_at: new Date(Date.now() + 86_400_000).toISOString() })
    if (error) throw error
    return { link: `/i/${interviewToken(id)}` }
  } catch (e) {
    return { error: msg(e) }
  }
}

export async function scheduleMeetingAction(roleId: string, meetingId: string, startsAtIso: string): Promise<Res> {
  try {
    const me = await requireOpenRole(roleId)
    if (!canManageRoles(me)) return { error: 'Only HR schedules interviews.' }
    const role = await getRole(roleId)
    const { data: m } = await db().from('meetings').select('*, candidates!inner(*)').eq('id', meetingId).eq('candidates.role_id', roleId).maybeSingle()
    if (!role || !m) return { error: 'Not found.' }
    const c = (Array.isArray(m.candidates) ? m.candidates[0] : m.candidates) as CandidateRow
    const start = new Date(startsAtIso)
    if (Number.isNaN(start.getTime()) || start.getTime() < Date.now()) return { error: 'Pick a time in the future.' }
    const round = role.spec.interviewRounds.find(r => r.id === m.round_id)
    if (!round || round.kind !== 'human') return { error: 'Round not found.' }
    if (!round.interviewerEmails.length) return { error: 'Add the interviewer\'s email to this round in Setup.' }

    const { data: org } = await db().from('org_settings').select('test_mode, test_email, company_name').single()
    // In test mode the candidate's calendar invite goes to the test address too
    const candidateInvitee = org?.test_mode ? org.test_email : c.email
    const ev = await createMeetEvent({
      summary: `${role.title} interview — ${c.name}`,
      description: meetDescription(round.name, role.title, org?.company_name ?? ''),
      start,
      minutes: round.durationMin,
      attendees: [...round.interviewerEmails, candidateInvitee].filter(Boolean),
      requestId: meetingId,
    })
    await db().from('meetings').update({ starts_at: start.toISOString(), state: 'scheduled', calendar_event_id: ev.eventId, meet_link: ev.meetLink, interviewer_emails: round.interviewerEmails }).eq('id', meetingId)
    const when = start.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' }) + ' IST'
    await queueEmail({ roleId, candidateId: c.id, kind: 'human_invite', to: c.email, dedupeKey: `meet:${meetingId}:${start.toISOString()}`, vars: { candidate_name: c.name.split(' ')[0] || c.name, role_title: role.title, round_name: round.name, meeting_time: when, meet_link: ev.meetLink || ev.htmlLink, interviewers: round.interviewerEmails.join(', ') } })
    await sendQueued(5)
    await audit(roleId, me.id, 'meeting.scheduled', { candidateId: c.id, start: start.toISOString() })
    refresh(roleId)
    return { ok: `Scheduled. Google sent the calendar invite with the Meet link${org?.test_mode ? ' (to the test address, because test mode is on)' : ''}.` }
  } catch (e) {
    return { error: msg(e) }
  }
}

/** After a round with a person: the interviewer records the outcome. */
export async function meetingOutcomeAction(roleId: string, meetingId: string, outcome: 'advance' | 'reject', note: string): Promise<Res> {
  try {
    const me = await requireOpenRole(roleId)
    const role = await getRole(roleId)
    const { data: m } = await db().from('meetings').select('*, candidates!inner(role_id)').eq('id', meetingId).eq('candidates.role_id', roleId).maybeSingle()
    if (!role || !m) return { error: 'Not found.' }
    const next = nextStage(role.spec, m.round_id)
    await recordDecision({ candidateId: m.candidate_id, stage: m.round_id, outcome: outcome === 'advance' ? 'advance' : 'reject', actorType: 'human', actorId: me.id, reason: note.trim() || (outcome === 'advance' ? 'Interviewer moved them forward' : 'Interviewer decided not to proceed') })
    await db().from('candidates').update({ stage: outcome === 'advance' ? next : m.round_id, status: outcome === 'advance' ? (next === 'done' ? 'hired' : 'active') : 'out', updated_at: new Date().toISOString() }).eq('id', m.candidate_id)
    await db().from('meetings').update({ state: 'done' }).eq('id', meetingId)
    refresh(roleId)
    return { ok: outcome === 'advance' ? (next === 'done' ? 'Marked as hired. 🎉' : 'Moved to the next round.') : 'Recorded.' }
  } catch (e) {
    return { error: msg(e) }
  }
}

export async function sendNowAction(roleId: string): Promise<Res> {
  try {
    await requireRoleAccess(roleId)
    const r = await sendQueued(25, 40_000, roleId)
    refresh(roleId)
    if (r.blocked) return { error: r.blocked }
    return { ok: `${r.sent} sent${r.failed ? `, ${r.failed} failed` : ''}.` }
  } catch (e) {
    return { error: msg(e) }
  }
}

export async function retryEmailAction(roleId: string, id: string): Promise<Res> {
  await requireRoleAccess(roleId)
  await db().from('outbox').update({ status: 'queued', error: null }).eq('id', id).eq('role_id', roleId).eq('status', 'failed')
  return sendNowAction(roleId)
}

/* ───────────── calibration ───────────── */

export async function startCalibrationAction(roleId: string): Promise<Res> {
  try {
    await requireOpenRole(roleId)
    const role = await getRole(roleId)
    if (!role) return { error: 'Role not found.' }
    const data = await allRows((a, b) => db().from('evaluations').select('candidate_id, score, created_at, candidates!inner(role_id)').eq('stage', 'screening').eq('candidates.role_id', roleId).order('created_at', { ascending: false }).order('id').range(a, b))
    const latest = new Map<string, number>()
    for (const e of data) if (!latest.has(e.candidate_id) && e.score != null) latest.set(e.candidate_id, Number(e.score))
    if (latest.size < 10) return { error: `Only ${latest.size} applicants have been screened so far. Calibration needs at least 10 — let screening run a little longer.` }
    await saveSample(roleId, chooseSample([...latest].map(([id, score]) => ({ id, score })), role.spec.screeningAdvance.minScore))
    refresh(roleId)
    return { ok: 'Sample ready. Label each answer set — you won\'t see the AI\'s score until you\'re done.' }
  } catch (e) {
    return { error: msg(e) }
  }
}

export async function labelAction(roleId: string, candidateId: string, band: Band, note: string): Promise<Res> {
  try {
    const me = await requireOpenRole(roleId)
    const sample = await getSample(roleId)
    const item = sample?.find(s => s.candidateId === candidateId)
    if (!item) return { error: 'That applicant is not in the calibration sample.' }
    await db().from('calibration_labels').upsert({ role_id: roleId, candidate_id: candidateId, user_id: me.id, band, split: item.split, note: note.slice(0, 500) }, { onConflict: 'candidate_id,user_id' })
    refresh(roleId)
    return { ok: 'Saved.' }
  } catch (e) {
    return { error: msg(e) }
  }
}

/** Re-score the sample with the current answer keys and the team's labels as worked examples. */
export async function rescoreCalibrationAction(roleId: string): Promise<Res> {
  try {
    await requireOpenRole(roleId)
    const role = await getRole(roleId)
    const sample = await getSample(roleId)
    if (!role || !sample) return { error: 'Start calibration first.' }
    const { data } = await db().from('candidates').select('*').in('id', sample.filter(s => s.split === 'validate').map(s => s.candidateId))
    let done = 0
    const started = Date.now()
    for (const c of (data ?? []) as CandidateRow[]) {
      if (Date.now() - started > 45_000) break
      try {
        await screenCandidate(roleId, role.current_version, role.spec, c, { route: false })
        done++
      } catch (e) {
        if (e instanceof QuotaExceeded || e instanceof AiUnavailable) return { error: e.message }
      }
    }
    refresh(roleId)
    return { ok: `Re-scored ${done} held-out applicant${done === 1 ? '' : 's'} with the current answer keys.` }
  } catch (e) {
    return { error: msg(e) }
  }
}

export async function lockCalibrationAction(roleId: string): Promise<Res> {
  try {
    const me = await requireOpenRole(roleId)
    // Locking can vouch for the whole template, so it is HR's step
    if (!canManageRoles(me)) return { error: 'Only HR can lock the answer keys. Your labels are saved.' }
    const role = await getRole(roleId)
    const sample = await getSample(roleId)
    if (!role || !sample) return { error: 'Start calibration first.' }
    const validate = sample.filter(s => s.split === 'validate').map(s => s.candidateId)
    const { data: labelRows } = await db().from('calibration_labels').select('candidate_id, band, created_at').eq('role_id', roleId).in('candidate_id', validate)
    const labels = [...latestPerCandidate(labelRows ?? []).values()]
    const { data: evs } = await db().from('evaluations').select('candidate_id, band, created_at').eq('stage', 'screening').in('candidate_id', validate).order('created_at', { ascending: false })
    const aiBand = new Map<string, Band>()
    for (const e of evs ?? []) if (!aiBand.has(e.candidate_id) && e.band) aiBand.set(e.candidate_id, e.band as Band)
    const pairs = labels.filter(l => aiBand.has(l.candidate_id)).map(l => ({ human: l.band as Band, ai: aiBand.get(l.candidate_id)! }))
    const a = agreement(pairs)
    if (a.labelled < Math.min(MIN_VALIDATE_LABELS, validate.length)) return { error: `Label at least ${Math.min(MIN_VALIDATE_LABELS, validate.length)} of the held-out applicants first (${a.labelled} so far).` }
    if (a.rate < PASS_AGREEMENT) return { error: `Agreement is ${Math.round(a.rate * 100)}% — it needs to be at least ${PASS_AGREEMENT * 100}%. Look at the disagreements, sharpen those answer keys in Setup, then re-score.` }
    await db().from('role_versions').update({ locked_at: new Date().toISOString() }).eq('role_id', roleId).eq('version', role.current_version)
    // Only a full-size check speaks for every role made from this template;
    // a small one unlocks this role alone
    const templateWide = !!role.template_id && a.labelled >= MIN_VALIDATE_LABELS
    if (templateWide) await db().from('templates').update({ calibrated: true }).eq('id', role.template_id)
    await audit(roleId, me.id, 'calibration.locked', { rate: a.rate, kappa: a.kappa, labelled: a.labelled, templateWide })
    refresh(roleId)
    return { ok: `Calibrated at ${Math.round(a.rate * 100)}% agreement. Answer keys are locked and autopilot can be switched on${templateWide ? ' — for later roles from this template too' : ' for this role. (Too few held-out applicants to vouch for the whole template.)'}.` }
  } catch (e) {
    return { error: msg(e) }
  }
}

/* ───────────── closing ───────────── */

export async function closeRoleAction(roleId: string, sendRejections: boolean): Promise<Res> {
  try {
    const me = await requireOpenRole(roleId)
    if (!canManageRoles(me)) return { error: 'Only HR can close a role.' }
    const role = await getRole(roleId)
    if (!role) return { error: 'Role not found.' }
    // Nothing else goes out for this role: unsent invites and reminders are
    // cancelled before the rejections are queued
    const { data: cancelledMail } = await db().from('outbox').update({ status: 'cancelled', error: 'Role closed before it was sent' }).eq('role_id', roleId).eq('status', 'queued').neq('kind', 'rejection').select('id')
    const { data: meetings } = await db().from('meetings').select('id, state, calendar_event_id, candidates!inner(role_id)').eq('candidates.role_id', roleId).in('state', ['to_schedule', 'scheduled'])
    let calendarLeft = 0
    for (const m of meetings ?? []) {
      if (m.state === 'scheduled' && m.calendar_event_id) {
        try {
          await cancelMeetEvent(m.calendar_event_id)
        } catch {
          calendarLeft++
        }
      }
      await db().from('meetings').update({ state: 'cancelled' }).eq('id', m.id)
    }
    let queued = 0
    if (sendRejections) {
      const toReject = await allRows((a, b) => db().from('candidates').select('id, name, email, status').eq('role_id', roleId).is('merged_into', null).neq('status', 'hired').order('id').range(a, b))
      for (const c of toReject) {
        const r = await queueEmail({ roleId, candidateId: c.id, kind: 'rejection', to: c.email, dedupeKey: `reject:${c.id}`, vars: { candidate_name: c.name.split(' ')[0] || c.name, role_title: role.title } })
        if (r === 'queued') queued++
      }
    }
    await db().from('roles').update({ status: 'closed', autopilot: false, updated_at: new Date().toISOString() }).eq('id', roleId)
    await db().from('interview_sessions').update({ state: 'cancelled' }).eq('role_id', roleId).in('state', ['invited', 'started'])
    await audit(roleId, me.id, 'role.closed', { rejectionsQueued: queued, unsentCancelled: cancelledMail?.length ?? 0, meetingsCancelled: meetings?.length ?? 0 })
    if (queued) await sendQueued(25, 40_000, roleId)
    refresh(roleId)
    const parts = [
      sendRejections ? `${queued} rejection email${queued === 1 ? '' : 's'} queued` : '',
      cancelledMail?.length ? `${cancelledMail.length} unsent invite${cancelledMail.length === 1 ? '' : 's'} cancelled` : '',
      meetings?.length ? `${meetings.length} interview${meetings.length === 1 ? '' : 's'} with a person cancelled` : '',
      calendarLeft ? `${calendarLeft} calendar event${calendarLeft === 1 ? '' : 's'} could not be removed — delete ${calendarLeft === 1 ? 'it' : 'them'} in Google Calendar` : '',
    ].filter(Boolean)
    return { ok: `Role closed.${parts.length ? ' ' + parts.join('. ') + '.' : ''}` }
  } catch (e) {
    return { error: msg(e) }
  }
}
