import type { Metadata } from 'next'

import { getRoleForPage } from '@/lib/data/roles'
import { listCandidates } from '@/lib/data/imports'
import { db } from '@/lib/supabase/server'
import { stagesFor } from '@/lib/pipeline/stages'
import { formatMoney, type MoneyParse } from '@/lib/parse/money'
import { HowItWorks } from '@/components/ui'
import { ImportWizard } from './ImportWizard'
import { CandidateTable, type CandidateListItem } from './CandidateTable'
import { inChunks } from '@/lib/data/paging'

export const metadata: Metadata = { title: 'Applicants' }

export default async function ApplicantsPage({ params, searchParams }: PageProps<'/roles/[id]/applicants'>) {
  const { id } = await params
  const sp = await searchParams
  const initialStage = typeof sp.stage === 'string' ? sp.stage : 'all'
  const { role } = await getRoleForPage(id)
  const candidates = await listCandidates(id)

  // Latest decision per candidate = why they're where they are
  const latest = new Map<string, { reason: string; actor: string }>()
  if (candidates.length) {
    const decs = await inChunks(candidates.map(c => c.id), chunk => db().from('decisions').select('candidate_id, reason, actor_type, created_at').in('candidate_id', chunk).order('created_at', { ascending: false }))
    for (const d of decs) if (!latest.has(d.candidate_id)) latest.set(d.candidate_id, { reason: d.reason, actor: d.actor_type })
  }

  const items: CandidateListItem[] = candidates.map(c => ({
    id: c.id,
    name: c.name,
    email: c.email,
    stage: c.stage,
    status: c.status,
    score: c.parsed.scores?.[c.stage] ?? c.parsed.scores?.screening ?? null,
    salary: c.parsed.salary ? formatMoney(c.parsed.salary as MoneyParse) : '—',
    salaryRaw: c.fields.expectedSalary ?? '',
    experience: c.fields.experience ?? '',
    college: c.fields.education ?? '',
    preferred: c.parsed.preferredColleges ?? [],
    flags: c.parsed.flags ?? [],
    reason: latest.get(c.id)?.reason ?? '',
    reasonBy: latest.get(c.id)?.actor ?? '',
  }))

  return (
    <>
      {candidates.length === 0 && (
        <HowItWorks
          title="What happens after you import"
          steps={[
            'Empty form submissions are skipped and repeat applications from the same person are merged.',
            'Salary, experience and notice answers are read whatever the format — every interpretation is listed under “What we changed”.',
            'Eligibility (budget, experience, notice, location) is checked instantly using the limits in Setup. Anyone excluded can be restored in one click.',
            'Eligible applicants then move to AI screening of their answers and resume.',
          ]}
        />
      )}
      {role.status !== 'closed' && <ImportWizard roleId={id} compact={candidates.length > 0} questions={role.spec.screeningQuestions.map(q => ({ id: q.id, text: q.text }))} />}
      {candidates.length > 0 && <CandidateTable roleId={id} items={items} initialStage={initialStage} stages={stagesFor(role.spec).map(s => ({ key: s.key, label: s.label }))} />}
    </>
  )
}
