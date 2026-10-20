import type { Metadata } from 'next'
import { db } from '@/lib/supabase/server'
import { getRoleForPage } from '@/lib/data/roles'
import { Card, EmptyState } from '@/components/ui'

export const metadata: Metadata = { title: 'Activity' }

const LABEL: Record<string, string> = {
  'role.created': 'Role created',
  'role.saved': 'Setup saved',
  'role.new_version': 'New version of answer keys',
  'role.active': 'Went live',
  'role.paused': 'Paused',
  'role.draft': 'Moved back to draft',
  'role.closed': 'Role closed',
  'role.member_added': 'Hiring manager added',
  'role.member_removed': 'Hiring manager removed',
  'import.committed': 'Applications imported',
  'candidate.restore': 'Candidate restored',
  'candidate.stop': 'Candidate stopped',
  'candidate.advance': 'Candidate moved forward',
  'stage.cut': 'Shortlist cut applied',
  'autopilot.on': 'Autopilot turned on',
  'autopilot.off': 'Autopilot turned off',
  'calibration.locked': 'Calibration passed — answer keys locked',
  'meeting.scheduled': 'Interview scheduled',
}

function detail(action: string, d: Record<string, unknown>): string {
  if (action === 'import.committed') return `${d.added} new, ${d.updated} updated, ${d.duplicates} merged, ${d.emptyRows} empty rows skipped`
  if (action === 'stage.cut') return `${d.stage}: ${d.advanced} moved on, ${d.waitlisted} waitlisted, ${d.out} below the bar${d.review ? `, ${d.review} need a look` : ''}`
  if (action === 'calibration.locked') return `${Math.round(Number(d.rate) * 100)}% agreement on ${d.labelled} held-out applicants`
  if (action === 'role.new_version') return `Version ${d.version}`
  if (action === 'role.member_added') return String(d.email ?? '')
  if (action === 'role.closed') return `${d.rejectionsQueued ?? 0} rejection emails queued`
  return ''
}

export default async function ActivityPage({ params }: PageProps<'/roles/[id]/activity'>) {
  const { id } = await params
  await getRoleForPage(id)
  const { data } = await db().from('audit_log').select('id, action, details, created_at, profiles(full_name, email)').eq('role_id', id).order('created_at', { ascending: false }).limit(300)
  if (!data?.length) return <EmptyState title="No activity yet" />
  return (
    <Card className="divide-y divide-line">
      {data.map(a => {
        const p = (Array.isArray(a.profiles) ? a.profiles[0] : a.profiles) as { full_name: string; email: string } | null
        return (
          <div key={a.id} className="flex flex-col gap-0.5 px-5 py-3 text-[13px] sm:flex-row sm:items-center sm:gap-4">
            <span className="w-40 shrink-0 text-[12px] text-faint">{new Date(a.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}</span>
            <span className="font-medium">{LABEL[a.action] ?? a.action}</span>
            <span className="text-muted">{detail(a.action, a.details as Record<string, unknown>)}</span>
            <span className="text-[12px] text-faint sm:ml-auto">{p ? p.full_name || p.email : 'Autopilot'}</span>
          </div>
        )
      })}
    </Card>
  )
}
