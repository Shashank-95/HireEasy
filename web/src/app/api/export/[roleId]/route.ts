import { NextResponse, type NextRequest } from 'next/server'
import Papa from 'papaparse'
import { canAccessRole, getMe } from '@/lib/auth'
import { getRole } from '@/lib/data/roles'
import { db } from '@/lib/supabase/server'
import type { CandidateRow } from '@/lib/data/candidates'
import { stageLabel } from '@/lib/pipeline/stages'
import { formatMoney, type MoneyParse } from '@/lib/parse/money'
import { allRows } from '@/lib/data/paging'

const STATUS = { active: 'In progress', review: 'Needs a look', out: 'Stopped', hired: 'Hired' } as const

/** The audit trail as spreadsheets: one row per applicant, or one per decision. */
export async function GET(req: NextRequest, ctx: RouteContext<'/api/export/[roleId]'>) {
  const { roleId } = await ctx.params
  const me = await getMe()
  if (!me) return NextResponse.json({ error: 'Sign in' }, { status: 401 })
  if (!(await canAccessRole(me, roleId))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const role = await getRole(roleId)
  if (!role) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const type = req.nextUrl.searchParams.get('type') === 'decisions' ? 'decisions' : 'candidates'

  const list = (await allRows((a, b) => db().from('candidates').select('*').eq('role_id', roleId).is('merged_into', null).order('created_at').order('id').range(a, b))) as CandidateRow[]
  const ids = list.map(c => c.id)
  const decisions: { candidate_id: string; stage: string; outcome: string; actor_type: string; reason: string; created_at: string; profiles: { full_name: string; email: string } | null }[] = []
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await db().from('decisions').select('candidate_id, stage, outcome, actor_type, reason, created_at, profiles(full_name, email)').in('candidate_id', ids.slice(i, i + 200)).order('created_at')
    decisions.push(...((data ?? []) as unknown as typeof decisions))
  }
  const byId = new Map(list.map(c => [c.id, c]))

  let rows: Record<string, string | number>[]
  if (type === 'decisions') {
    rows = decisions.map(d => ({
      Applicant: byId.get(d.candidate_id)?.name ?? '',
      Email: byId.get(d.candidate_id)?.email ?? '',
      Stage: stageLabel(role.spec, d.stage),
      Outcome: d.outcome,
      'Decided by': d.actor_type === 'human' ? d.profiles?.full_name || d.profiles?.email || 'A person' : d.actor_type === 'ai' ? 'AI' : 'Rules',
      Reason: d.reason,
      When: new Date(d.created_at).toISOString(),
    }))
  } else {
    const latest = new Map<string, (typeof decisions)[number]>()
    for (const d of decisions) latest.set(d.candidate_id, d)
    rows = list.map(c => {
      const scores = c.parsed.scores ?? {}
      const last = latest.get(c.id)
      return {
        Name: c.name,
        Email: c.email,
        Phone: c.phone,
        Stage: stageLabel(role.spec, c.stage),
        Status: STATUS[c.status],
        'Screening score': scores.screening ?? '',
        ...Object.fromEntries(role.spec.interviewRounds.filter(r => r.kind === 'ai').map(r => [`${r.name} score`, scores[r.id] ?? ''])),
        'Expected salary (as written)': c.fields.expectedSalary ?? '',
        'Expected salary (read as)': c.parsed.salary ? formatMoney(c.parsed.salary as MoneyParse) : '',
        'Experience (form)': c.fields.experience ?? '',
        'Experience (resume, years)': (c.parsed as { resumeYears?: number }).resumeYears ?? '',
        'Notice period': c.fields.notice ?? '',
        Location: c.fields.location ?? '',
        College: c.fields.education ?? '',
        'Preferred college': (c.parsed.preferredColleges ?? []).join(', '),
        Flags: (c.parsed.flags ?? []).join(' | '),
        'Latest decision': last?.reason ?? '',
        'Decided by': last ? (last.actor_type === 'human' ? last.profiles?.full_name || 'A person' : last.actor_type === 'ai' ? 'AI' : 'Rules') : '',
        Resume: c.fields.resume ?? '',
      }
    })
  }
  const csv = '﻿' + Papa.unparse(rows, { escapeFormulae: true })
  const file = `${role.title.replace(/[^\w]+/g, '-')}-${type}-${new Date().toISOString().slice(0, 10)}.csv`
  return new NextResponse(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${file}"`, 'Cache-Control': 'no-store' } })
}
