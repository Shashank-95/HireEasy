import type { Metadata } from 'next'
import Link from 'next/link'
import { db } from '@/lib/supabase/server'
import { getRoleForPage } from '@/lib/data/roles'
import { FIELD_LABELS, type Field } from '@/lib/import/mapping'
import { Badge, Card, EmptyState, Notice } from '@/components/ui'

export const metadata: Metadata = { title: 'What we changed' }

interface Change {
  candidate: string
  externalId: string
  field: Field
  from: string
  to: string
  note: string
  check: boolean
}

export default async function ChangesPage({ params, searchParams }: PageProps<'/roles/[id]/applicants/changes'>) {
  const { id } = await params
  await getRoleForPage(id)
  const sp = await searchParams
  const onlyCheck = sp.all !== '1'

  const { data: imp } = await db().from('imports').select('id, created_at, source_url, total_rows, empty_rows, applicants, duplicates, change_log').eq('role_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (!imp) return <EmptyState title="No imports yet" description="Once you add applications, every value the tool had to interpret shows up here." />

  const log = (imp.change_log as Change[]) ?? []
  const shown = onlyCheck ? log.filter(c => c.check) : log
  const people = new Set(log.filter(c => c.check).map(c => c.externalId)).size

  return (
    <div className="space-y-4">
      <Link href={`/roles/${id}/applicants`} className="text-[13px] text-muted hover:text-ink">← Applicants</Link>
      <div>
        <h2 className="text-lg font-semibold">What we changed in the data</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Form answers come in every format. Here is each value the tool converted to the standard form, and why. Nothing is changed silently — the original answer is always kept and shown on the applicant’s page.
        </p>
      </div>
      <Notice tone="info">
        Latest import ({new Date(imp.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}): {imp.total_rows} rows, {imp.empty_rows} empty submissions skipped,
        {' '}{imp.duplicates} repeat applications merged, {imp.applicants} applicants. {people} applicant{people === 1 ? '' : 's'} had something worth a glance.
      </Notice>
      <div className="flex gap-2 text-[13px]">
        <Link href="?all=0" className={onlyCheck ? 'font-semibold text-ink' : 'text-muted'}>Worth a glance ({log.filter(c => c.check).length})</Link>
        <span className="text-faint">·</span>
        <Link href="?all=1" className={!onlyCheck ? 'font-semibold text-ink' : 'text-muted'}>Every change ({log.length})</Link>
      </div>
      <Card className="divide-y divide-line">
        {shown.slice(0, 1000).map((c, i) => (
          <div key={i} className="grid gap-1 px-4 py-3 text-[13px] sm:grid-cols-[180px_140px_1fr]">
            <span className="font-medium">{c.candidate}</span>
            <span><Badge tone={c.check ? 'warn' : 'neutral'}>{FIELD_LABELS[c.field] ?? c.field}</Badge></span>
            <span className="min-w-0">
              <span className="text-muted">“{c.from.length > 120 ? c.from.slice(0, 120) + '…' : c.from}”</span>
              <span className="mx-1.5 text-faint">→</span>
              <span className="font-medium">{c.to || '(left blank)'}</span>
              <span className="mt-0.5 block text-[12px] text-faint">{c.note}</span>
            </span>
          </div>
        ))}
        {shown.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted">Nothing to show.</p>}
      </Card>
    </div>
  )
}
