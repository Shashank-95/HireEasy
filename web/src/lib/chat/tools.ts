import 'server-only'
import { db } from '../supabase/server'
import type { Me } from '../auth'
import { listRoles, getRole, type RoleWithSpec } from '../data/roles'
import { stageLabel, stagesFor } from '../pipeline/stages'
import { formatMoney, type MoneyParse } from '../parse/money'
import type { CandidateRow } from '../data/candidates'
import { allRows } from '../data/paging'

/**
 * Read-only tools for Ask HireEasy. Every tool:
 *  - only sees roles the person asking can access (HMs: roles they're on);
 *  - returns compact, factual JSON straight from the records the screens show;
 *  - never changes anything.
 * The assistant may only state what these return.
 */

const STATUS = { active: 'in progress', review: 'needs a person to look', out: 'stopped', hired: 'hired' } as const
const ACTOR = { system: 'rules', ai: 'AI', human: 'a person' } as const
const when = (s: string) => new Date(s).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })
const short = (s: string, n = 160) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

export const TOOL_DEFS = [
  {
    type: 'function',
    function: {
      name: 'find_roles',
      description: 'List the hiring roles this person can see, with applicant counts. Use to find a role id from its title, or to answer questions across roles.',
      parameters: { type: 'object', properties: { query: { type: 'string', description: 'Optional words from the role title' } } },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_role',
      description: 'Details of one role: status, autopilot, eligibility limits, score bars, interview rounds, and how many candidates are at each stage.',
      parameters: { type: 'object', properties: { role_id: { type: 'string' } }, required: ['role_id'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_candidates',
      description: 'Find candidates by (part of) their name or email, across every role this person can see. Always use this before get_candidate when you only have a name.',
      parameters: { type: 'object', properties: { name_or_email: { type: 'string' }, role_id: { type: 'string', description: 'Optional: limit to one role' } }, required: ['name_or_email'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_candidate',
      description: 'Everything about one candidate: where they are, every decision with its reason and who made it, scores per stage, eligibility checks, screening answers scored per question, resume findings, and AI interview summaries with strengths and concerns.',
      parameters: { type: 'object', properties: { candidate_id: { type: 'string' } }, required: ['candidate_id'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_candidates',
      description: 'List candidates in a role, optionally filtered by stage, status or score, sorted by score. Use for questions like "who is in round 1", "top 5", "who was waitlisted", "who needs a look".',
      parameters: {
        type: 'object',
        properties: {
          role_id: { type: 'string' },
          stage: { type: 'string', description: 'Stage key or name, e.g. "screening", "resume", an interview round name, "done"' },
          status: { type: 'string', enum: ['in progress', 'needs a person to look', 'stopped', 'hired'] },
          min_score: { type: 'number' },
          max_score: { type: 'number' },
          limit: { type: 'number', description: 'Max rows, default 15, up to 40' },
        },
        required: ['role_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_interview_transcript',
      description: 'What a candidate actually said in an AI interview round, question by question (transcribed speech, including follow-ups).',
      parameters: { type: 'object', properties: { candidate_id: { type: 'string' }, round: { type: 'string', description: 'Optional round name' } }, required: ['candidate_id'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'pending_items',
      description: 'What is waiting on a person right now across all roles: unread notifications, interviews to schedule, candidates needing a look.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'recent_activity',
      description: 'Recent actions on a role (imports, cuts, autopilot changes, overrides), newest first.',
      parameters: { type: 'object', properties: { role_id: { type: 'string' }, limit: { type: 'number' } }, required: ['role_id'] },
    },
  },
] as const

export type ToolName = (typeof TOOL_DEFS)[number]['function']['name']

export class ToolError extends Error {}

/** The roles this person can see, cached for one question. */
export async function accessibleRoles(me: Me) {
  return listRoles(me)
}

async function roleFor(me: Me, roleId: string, allowed: Set<string>): Promise<RoleWithSpec> {
  if (!allowed.has(roleId)) throw new ToolError('No role with that id that you can access. Use find_roles to get the id.')
  const r = await getRole(roleId)
  if (!r) throw new ToolError('Role not found.')
  return r
}

async function candidateFor(cid: string, allowed: Set<string>): Promise<CandidateRow> {
  const { data } = await db().from('candidates').select('*').eq('id', cid).maybeSingle()
  if (!data || !allowed.has(data.role_id)) throw new ToolError('No candidate with that id that you can access. Use find_candidates first.')
  return data as CandidateRow
}

const link = (roleId: string, cid?: string) => (cid ? `/roles/${roleId}/applicants/${cid}` : `/roles/${roleId}`)

export async function runTool(me: Me, name: string, args: Record<string, unknown>, allowedRoles: { id: string; title: string }[]): Promise<unknown> {
  const allowed = new Set(allowedRoles.map(r => r.id))
  const roleTitle = (id: string) => allowedRoles.find(r => r.id === id)?.title ?? ''

  switch (name) {
    case 'find_roles': {
      const q = String(args.query ?? '').toLowerCase().trim()
      const roles = (await listRoles(me)).filter(r => !q || r.title.toLowerCase().includes(q) || q.split(/\s+/).every(w => r.title.toLowerCase().includes(w)))
      const data = roles.length ? await allRows((a, b) => db().from('candidates').select('role_id, status').in('role_id', roles.map(r => r.id)).is('merged_into', null).order('id').range(a, b)) : []
      return roles.map(r => {
        const mine = (data ?? []).filter(c => c.role_id === r.id)
        return {
          role_id: r.id,
          title: r.title,
          status: r.status,
          autopilot: r.autopilot,
          link: link(r.id),
          applicants: mine.length,
          in_progress: mine.filter(c => c.status === 'active').length,
          needs_a_look: mine.filter(c => c.status === 'review').length,
          stopped: mine.filter(c => c.status === 'out').length,
          hired: mine.filter(c => c.status === 'hired').length,
        }
      })
    }

    case 'get_role': {
      const r = await roleFor(me, String(args.role_id), allowed)
      const data = await allRows((a, b) => db().from('candidates').select('stage, status').eq('role_id', r.id).is('merged_into', null).order('id').range(a, b))
      const e = r.spec.eligibility
      return {
        role_id: r.id,
        title: r.title,
        link: link(r.id),
        status: r.status,
        autopilot: r.autopilot,
        answer_keys_locked_by_calibration: r.versionLocked,
        eligibility: {
          budget: e.budget.enabled ? `${e.budget.fixedLpa} L fixed + ${e.budget.variableLpa} L variable, compared against ${e.budget.compareAgainst === 'fixed' ? 'fixed pay' : 'total CTC'}, ${e.budget.tolerancePct}% tolerance` : 'not checked',
          experience: e.experience.enabled ? `${e.experience.minYears}–${e.experience.maxYears ?? 'no max'} years, ${e.experience.tolerancePct}% tolerance` : 'not checked',
          notice: e.notice.enabled ? `up to ${e.notice.maxDays} days, ${e.notice.tolerancePct}% tolerance` : 'not checked',
          location: e.location.enabled ? e.location.allowed.join(', ') : 'not checked',
        },
        screening: { score_bar: r.spec.screeningAdvance.minScore, max_advancing: r.spec.screeningAdvance.maxAdvance },
        interview_rounds: r.spec.interviewRounds.map(x => (x.kind === 'ai' ? { name: x.name, kind: 'AI interview', questions: x.questions.length, score_bar: x.advance.minScore, max_advancing: x.advance.maxAdvance, deadline_hours: x.deadlineHours } : { name: x.name, kind: 'with a person', interviewers: x.interviewerEmails })),
        candidates_by_stage: stagesFor(r.spec).map(s => {
          const here = (data ?? []).filter(c => c.stage === s.key)
          return { stage: s.label, in_progress: here.filter(c => c.status === 'active').length, needs_a_look: here.filter(c => c.status === 'review').length, stopped_here: here.filter(c => c.status === 'out').length, hired: here.filter(c => c.status === 'hired').length }
        }),
        total_applicants: data?.length ?? 0,
      }
    }

    case 'find_candidates': {
      const q = String(args.name_or_email ?? '').trim()
      if (q.length < 2) throw new ToolError('Give at least two letters of the name or email.')
      const roles = args.role_id ? [String(args.role_id)].filter(id => allowed.has(id)) : [...allowed]
      if (!roles.length) return []
      const pattern = `%${q.replace(/[%_]/g, '')}%`
      const words = q.split(/\s+/).filter(w => w.length > 1)
      let query = db().from('candidates').select('id, name, email, role_id, stage, status').in('role_id', roles).is('merged_into', null).limit(15)
      query = words.length > 1 ? query.ilike('name', `%${words.join('%')}%`) : query.or(`name.ilike.${pattern},email.ilike.${pattern}`)
      const { data } = await query
      const specs = new Map<string, RoleWithSpec>()
      const matches = []
      for (const c of data ?? []) {
        if (!specs.has(c.role_id)) specs.set(c.role_id, (await getRole(c.role_id))!)
        matches.push({ candidate_id: c.id, name: c.name, email: c.email, role: roleTitle(c.role_id), role_id: c.role_id, stage: stageLabel(specs.get(c.role_id)!.spec, c.stage), status: STATUS[c.status as keyof typeof STATUS], link: link(c.role_id, c.id) })
      }
      // An exact full-name match is unambiguous even if the name also appears inside others
      const exact = matches.filter(m => m.name.toLowerCase().trim() === q.toLowerCase())
      const list = exact.length === 1 ? exact : matches
      return {
        matches: list,
        ambiguous: list.length > 1,
        note: list.length > 1 ? `${list.length} candidates match "${q}". Do not pick one — ask which one they mean, listing them as options.` : list.length === 0 ? `No candidate matches "${q}" in the roles this person can see. Say exactly that — don't suggest they don't exist elsewhere, and don't ask for an ID.` : 'One match.',
      }
    }

    case 'get_candidate': {
      const c = await candidateFor(String(args.candidate_id), allowed)
      const role = (await getRole(c.role_id))!
      const spec = role.spec
      const [{ data: decs }, { data: evs }, { data: sessions }, { data: meeting }] = await Promise.all([
        db().from('decisions').select('stage, outcome, actor_type, reason, created_at, profiles(full_name, email)').eq('candidate_id', c.id).order('created_at'),
        db().from('evaluations').select('stage, score, band, model, details, created_at').eq('candidate_id', c.id).order('created_at', { ascending: false }),
        db().from('interview_sessions').select('round_id, state, submitted_at, expires_at').eq('candidate_id', c.id).eq('preview', false),
        db().from('meetings').select('round_id, state, starts_at').eq('candidate_id', c.id),
      ])
      const latest = (stage: string) => evs?.find(e => e.stage === stage)
      const qText = (id: string) => short(spec.screeningQuestions.find(q => q.id === id)?.text ?? id, 90)
      const skill = (id: string) => [...spec.mustHaves, ...spec.goodToHaves].find(s => s.id === id)?.name ?? id
      const screening = latest('screening')
      const resume = latest('resume')
      const eligibility = latest('eligibility')
      type Q = { questionId: string; score: number; elements?: { element: string; status: string }[] }
      return {
        candidate_id: c.id,
        name: c.name,
        email: c.email,
        role: role.title,
        role_id: role.id,
        link: link(role.id, c.id),
        current_stage: stageLabel(spec, c.stage),
        status: STATUS[c.status],
        facts: {
          expected_salary_as_written: c.fields.expectedSalary ?? null,
          expected_salary_read_as: c.parsed.salary ? formatMoney(c.parsed.salary as MoneyParse) : null,
          experience_on_form: c.fields.experience ?? null,
          experience_from_resume_years: (c.parsed as { resumeYears?: number }).resumeYears ?? null,
          notice_period: c.fields.notice ?? null,
          location: c.fields.location ?? null,
          college: c.fields.education ?? null,
          preferred_college_matches: c.parsed.preferredColleges ?? [],
          current_company: c.fields.currentCompany ?? null,
        },
        flags: c.parsed.flags ?? [],
        scores_out_of_100: Object.fromEntries(Object.entries(c.parsed.scores ?? {}).map(([k, v]) => [stageLabel(spec, k), v])),
        decisions_oldest_first: (decs ?? []).map(d => {
          const p = (Array.isArray(d.profiles) ? d.profiles[0] : d.profiles) as { full_name: string; email: string } | null
          return { stage: stageLabel(spec, d.stage), outcome: d.outcome, decided_by: d.actor_type === 'human' ? p?.full_name || p?.email || 'a person' : ACTOR[d.actor_type as keyof typeof ACTOR], reason: d.reason, when: when(d.created_at) }
        }),
        eligibility_checks: ((eligibility?.details as { results?: { criterion: string; verdict: string; reason: string }[] })?.results ?? []).map(r => ({ check: r.criterion, result: r.verdict, reason: r.reason })),
        screening: screening
          ? {
              score: screening.score,
              band: screening.band,
              model: screening.model,
              per_question: ((screening.details as { questions?: Q[] }).questions ?? []).map(q => ({
                question: qText(q.questionId),
                score_out_of_5: q.score,
                strong_answer_elements_missing: (q.elements ?? []).filter(e => e.status === 'absent').map(e => short(e.element, 80)),
                elements_without_detail: (q.elements ?? []).filter(e => e.status === 'generic').map(e => short(e.element, 80)),
              })),
              ai_text_artifacts: (screening.details as { artifacts?: string[] }).artifacts ?? [],
            }
          : null,
        resume: resume
          ? (resume.details as { failed?: string }).failed
            ? { could_not_read: (resume.details as { failed: string }).failed }
            : {
                summary: (resume.details as { summary?: string }).summary,
                full_time_years: (resume.details as { years?: number }).years,
                internship_years: (resume.details as { internshipYears?: number }).internshipYears,
                skills: ((resume.details as { skills?: { skillId: string; score: number; evidence: string }[] }).skills ?? []).map(s => ({ skill: skill(s.skillId), score_out_of_5: s.score, evidence: short(s.evidence, 120) })),
              }
          : null,
        interviews: spec.interviewRounds.map(r => {
          if (r.kind === 'human') {
            const m = meeting?.find(x => x.round_id === r.id)
            return m ? { round: r.name, kind: 'with a person', meeting: m.state, starts: m.starts_at ? when(m.starts_at) : null } : null
          }
          const s = sessions?.find(x => x.round_id === r.id)
          if (!s) return null
          const ev = latest(r.id)
          const d = (ev?.details ?? {}) as { summary?: string; strengths?: string[]; concerns?: string[]; questions?: Q[] }
          return {
            round: r.name,
            kind: 'AI interview',
            state: s.state,
            completed: s.submitted_at ? when(s.submitted_at) : null,
            deadline: when(s.expires_at),
            score: ev?.score ?? null,
            summary: d.summary ?? null,
            strengths: d.strengths ?? [],
            concerns: d.concerns ?? [],
            per_question: (d.questions ?? []).map(q => ({ question: short(r.questions.find(x => x.id === q.questionId)?.text ?? q.questionId, 90), score_out_of_5: q.score })),
          }
        }).filter(Boolean),
      }
    }

    case 'list_candidates': {
      const role = await roleFor(me, String(args.role_id), allowed)
      const stages = stagesFor(role.spec)
      // Filters are worked out once; the query is rebuilt for each page
      let stageKey: string | null = null
      let statusKey: string | null = null
      if (args.stage) {
        const want = String(args.stage).toLowerCase()
        const st = stages.find(s => s.key.toLowerCase() === want || s.label.toLowerCase() === want) ?? stages.find(s => s.label.toLowerCase().includes(want) || want.includes(s.key.toLowerCase()))
        if (!st) throw new ToolError(`Unknown stage "${args.stage}". Stages: ${stages.map(s => s.label).join(', ')}`)
        stageKey = st.key
      }
      if (args.status) {
        const key = (Object.entries(STATUS).find(([, v]) => v === args.status)?.[0]) as string | undefined
        if (key) statusKey = key
      }
      const data = await allRows((a, b) => {
        let q = db().from('candidates').select('id, name, stage, status, parsed').eq('role_id', role.id).is('merged_into', null)
        if (stageKey) q = q.eq('stage', stageKey)
        if (statusKey) q = q.eq('status', statusKey)
        return q.order('id').range(a, b)
      })
      const scoreOf = (c: { stage: string; parsed: { scores?: Record<string, number> } }) => c.parsed.scores?.[c.stage] ?? c.parsed.scores?.screening ?? null
      let rows = (data ?? []).map(c => ({ c, score: scoreOf(c as { stage: string; parsed: { scores?: Record<string, number> } }) }))
      if (typeof args.min_score === 'number') rows = rows.filter(r => r.score !== null && r.score >= (args.min_score as number))
      if (typeof args.max_score === 'number') rows = rows.filter(r => r.score !== null && r.score <= (args.max_score as number))
      rows.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.c.name.localeCompare(b.c.name))
      const limit = Math.min(40, Math.max(1, Number(args.limit ?? 15)))
      const ids = rows.slice(0, limit).map(r => r.c.id)
      const { data: decs } = ids.length ? await db().from('decisions').select('candidate_id, reason, created_at').in('candidate_id', ids).order('created_at', { ascending: false }) : { data: [] }
      const last = new Map<string, string>()
      for (const d of decs ?? []) if (!last.has(d.candidate_id)) last.set(d.candidate_id, d.reason)
      return {
        role: role.title,
        total_matching: rows.length,
        showing: Math.min(limit, rows.length),
        candidates: rows.slice(0, limit).map(r => ({ candidate_id: r.c.id, name: r.c.name, stage: stageLabel(role.spec, r.c.stage), status: STATUS[r.c.status as keyof typeof STATUS], score: r.score, latest_reason: short(last.get(r.c.id) ?? '', 200), link: link(role.id, r.c.id) })),
      }
    }

    case 'get_interview_transcript': {
      const c = await candidateFor(String(args.candidate_id), allowed)
      const role = (await getRole(c.role_id))!
      const want = String(args.round ?? '').toLowerCase()
      const rounds = role.spec.interviewRounds.filter(r => r.kind === 'ai' && (!want || r.name.toLowerCase().includes(want)))
      const { data } = await db().from('interview_sessions').select('round_id, state, interview_answers(question_id, followup_index, prompt, transcript)').eq('candidate_id', c.id).eq('preview', false)
      return rounds.map(r => {
        const s = data?.find(x => x.round_id === r.id)
        return {
          round: r.name,
          state: s?.state ?? 'not invited',
          answers: (s?.interview_answers ?? []).sort((a, b) => a.question_id.localeCompare(b.question_id) || a.followup_index - b.followup_index).map(a => ({ asked: short(a.prompt, 140), follow_up: a.followup_index > 0, said: short(a.transcript ?? '', 700) })),
        }
      })
    }

    case 'pending_items': {
      const ids = [...allowed]
      if (!ids.length) return { roles: 0 }
      const [{ data: notes }, { data: review }, { data: meets }] = await Promise.all([
        db().from('notifications').select('role_id, title, created_at').in('role_id', ids).is('read_at', null).order('created_at', { ascending: false }).limit(15),
        allRows((a, b) => db().from('candidates').select('role_id').in('role_id', ids).eq('status', 'review').is('merged_into', null).order('id').range(a, b)).then(data => ({ data })),
        db().from('meetings').select('candidate_id, state, candidates(role_id, name)').eq('state', 'to_schedule'),
      ])
      const toSchedule = (meets ?? []).map(m => (Array.isArray(m.candidates) ? m.candidates[0] : m.candidates) as { role_id: string; name: string } | null).filter((c): c is { role_id: string; name: string } => !!c && allowed.has(c.role_id))
      return {
        notifications: (notes ?? []).map(n => ({ role: roleTitle(n.role_id), title: n.title, when: when(n.created_at), link: link(n.role_id) })),
        needs_a_look_by_role: ids.map(id => ({ role: roleTitle(id), count: (review ?? []).filter(r => r.role_id === id).length, link: `${link(id)}/applicants` })).filter(x => x.count),
        interviews_to_schedule: toSchedule.map(c => ({ role: roleTitle(c.role_id), candidate: c.name, link: `${link(c.role_id)}/interviews` })),
      }
    }

    case 'recent_activity': {
      const role = await roleFor(me, String(args.role_id), allowed)
      const { data } = await db().from('audit_log').select('action, details, created_at, profiles(full_name, email)').eq('role_id', role.id).order('created_at', { ascending: false }).limit(Math.min(30, Number(args.limit ?? 15)))
      return (data ?? []).map(a => {
        const p = (Array.isArray(a.profiles) ? a.profiles[0] : a.profiles) as { full_name: string; email: string } | null
        return { action: a.action, details: a.details, by: p ? p.full_name || p.email : 'autopilot', when: when(a.created_at) }
      })
    }
  }
  throw new ToolError(`Unknown tool ${name}`)
}
