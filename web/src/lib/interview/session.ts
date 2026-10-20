import 'server-only'
import { db } from '../supabase/server'
import { hashToken } from '../crypto'
import { getRole } from '../data/roles'
import type { AiRound, RoleSpec } from '../templates/types'

export interface SessionEvent {
  type: string
  at: string
  [k: string]: unknown
}

export interface LoadedSession {
  id: string
  roleId: string
  roundId: string
  candidateId: string | null
  preview: boolean
  state: 'invited' | 'started' | 'submitted' | 'expired' | 'cancelled'
  expiresAt: string
  events: SessionEvent[]
  spec: RoleSpec
  round: AiRound
  roleTitle: string
  candidateName: string
}

export class SessionError extends Error {
  constructor(message: string, public status = 400) {
    super(message)
  }
}

/** Find a session by the token in the link. The token is the only credential. */
export async function loadSession(token: string): Promise<LoadedSession> {
  if (!/^[\w-]{20,64}$/.test(token)) throw new SessionError('This interview link is not valid.', 404)
  const { data: s } = await db().from('interview_sessions').select('*, candidates(name)').eq('token_hash', hashToken(token)).maybeSingle()
  if (!s) throw new SessionError('This interview link is not valid.', 404)
  const role = await getRole(s.role_id)
  if (!role) throw new SessionError('This role no longer exists.', 404)
  // Scores and questions follow the version the candidate was invited under
  const { data: v } = await db().from('role_versions').select('spec').eq('role_id', s.role_id).eq('version', s.role_version).single()
  const spec = (v?.spec as RoleSpec) ?? role.spec
  const round = spec.interviewRounds.find(r => r.id === s.round_id && r.kind === 'ai') as AiRound | undefined
  if (!round) throw new SessionError('This interview round was removed by the hiring team.', 410)
  const cand = (Array.isArray(s.candidates) ? s.candidates[0] : s.candidates) as { name: string } | null
  return {
    id: s.id,
    roleId: s.role_id,
    roundId: s.round_id,
    candidateId: s.candidate_id,
    preview: s.preview,
    state: s.state,
    expiresAt: s.expires_at,
    events: (s.events as SessionEvent[]) ?? [],
    spec,
    round,
    roleTitle: role.title,
    candidateName: s.preview ? 'there' : (cand?.name ?? '').split(' ')[0] || 'there',
  }
}

export function assertOpen(s: LoadedSession) {
  if (s.state === 'submitted') throw new SessionError('You have already completed this interview. Thank you!', 409)
  if (s.state === 'cancelled') throw new SessionError('This interview was cancelled by the hiring team.', 410)
  if (s.state === 'expired' || new Date(s.expiresAt) < new Date()) throw new SessionError('This interview link has expired.', 410)
}

/**
 * Append an event. Two requests can land together (an answer's follow-up and
 * a tab switch), so write only if the list is unchanged since we read it, and
 * otherwise re-read and try again — neither event is lost.
 */
export async function addEvent(sessionId: string, events: SessionEvent[], e: Omit<SessionEvent, 'at'>) {
  const ev = { ...e, at: new Date().toISOString() } as SessionEvent
  let current = events
  for (let attempt = 0; attempt < 4; attempt++) {
    const next = [...current, ev].slice(-200)
    const { data } = await db().from('interview_sessions').update({ events: next }).eq('id', sessionId).eq('events', JSON.stringify(current)).select('id')
    if (data?.length) return next
    const { data: fresh } = await db().from('interview_sessions').select('events').eq('id', sessionId).single()
    current = (fresh?.events as SessionEvent[] | null) ?? []
  }
  const next = [...current, ev].slice(-200)
  await db().from('interview_sessions').update({ events: next }).eq('id', sessionId)
  return next
}
