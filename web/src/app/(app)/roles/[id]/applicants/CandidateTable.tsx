'use client'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { STATUS_LABEL, STATUS_TONE } from '@/lib/pipeline/status'
import { Search } from 'lucide-react'
import { Badge, ButtonLink, Card, cx, Input, Select } from '@/components/ui'

export interface CandidateListItem {
  id: string
  name: string
  email: string
  stage: string
  status: 'active' | 'review' | 'out' | 'hired'
  score: number | null
  salary: string
  salaryRaw: string
  experience: string
  college: string
  preferred: string[]
  flags: string[]
  reason: string
  reasonBy: string
}


const ORDER = { review: 0, active: 1, hired: 2, out: 3 } as const

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'In progress' },
  { key: 'review', label: 'Needs a look' },
  { key: 'out', label: 'Stopped' },
  { key: 'hired', label: 'Hired' },
] as const

export function CandidateTable({ roleId, items, stages, initialStage = 'all' }: { roleId: string; items: CandidateListItem[]; stages: { key: string; label: string }[]; initialStage?: string }) {
  const [status, setStatus] = useState<(typeof FILTERS)[number]['key']>('all')
  const [stage, setStage] = useState(initialStage)
  const [q, setQ] = useState('')
  const stageLabel = (k: string) => stages.find(s => s.key === k)?.label ?? k

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items.length }
    for (const i of items) c[i.status] = (c[i.status] ?? 0) + 1
    return c
  }, [items])

  const funnel = useMemo(
    () =>
      stages
        .filter(s => s.key !== 'done')
        .map(s => ({ ...s, n: items.filter(i => i.stage === s.key && i.status !== 'out').length }))
        .filter(s => s.n > 0),
    [items, stages],
  )

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase()
    return items
      .filter(i => (status === 'all' || i.status === status) && (stage === 'all' || i.stage === stage))
      .filter(i => !term || [i.name, i.email, i.college, i.reason].some(v => v.toLowerCase().includes(term)))
      // Needs a look first, then people still in the running by score, then the rest
      .sort((a, b) => ORDER[a.status] - ORDER[b.status] || (b.score ?? -1) - (a.score ?? -1) || a.name.localeCompare(b.name))
  }, [items, status, stage, q])

  return (
    <div className="space-y-4">
      {funnel.length > 0 && (
        <div className="flex flex-wrap gap-2 text-[12px]">
          {funnel.map(s => (
            <button key={s.key} type="button" aria-pressed={stage === s.key} onClick={() => setStage(stage === s.key ? 'all' : s.key)} className={cx('rounded-full border px-3 py-1', stage === s.key ? 'border-accent bg-accent-soft text-accent-text' : 'border-line text-muted hover:text-ink')}>
              {s.label} <span className="font-semibold tabular-nums">{s.n}</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="-mx-1 flex gap-1 overflow-x-auto px-1">
          {FILTERS.map(f => (
            <button
              key={f.key}
              type="button"
              aria-pressed={status === f.key}
              onClick={() => setStatus(f.key)}
              className={cx('shrink-0 rounded-lg px-3 py-1.5 text-[13px] font-medium', status === f.key ? 'bg-ink text-bg' : 'text-muted hover:bg-surface-2')}
            >
              {f.label} <span className="tabular-nums opacity-70">{counts[f.key] ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="flex w-full gap-2 lg:w-auto">
          <div className="relative min-w-0 flex-1 lg:w-72 lg:flex-none">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, college, reason" className="pl-9" aria-label="Search applicants" />
          </div>
          <Select value={stage} onChange={e => setStage(e.target.value)} className="w-36 shrink-0 sm:w-44" aria-label="Stage">
            <option value="all">All stages</option>
            {stages.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </Select>
        </div>
      </div>

      <div className="flex items-center justify-between text-[12px] text-muted">
        <span>{shown.length} shown</span>
        <ButtonLink href={`/roles/${roleId}/applicants/changes`} variant="ghost" size="sm">What we changed in the data →</ButtonLink>
      </div>

      <Card className="overflow-hidden">
        {/* Desktop table */}
        <table className="hidden w-full text-left text-[13px] md:table">
          <thead className="border-b border-line bg-surface-2/60 text-[12px] text-muted">
            <tr>
              <th className="px-4 py-2.5 font-medium">Applicant</th>
              <th className="px-4 py-2.5 font-medium">Where they are</th>
              <th className="px-4 py-2.5 text-right font-medium">Score</th>
              <th className="px-4 py-2.5 font-medium">Expects</th>
              <th className="px-4 py-2.5 font-medium">Why</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {shown.map(c => (
              <tr key={c.id} className="hover:bg-surface-2/50">
                <td className="max-w-[220px] px-4 py-3">
                  <Link href={`/roles/${roleId}/applicants/${c.id}`} className="font-medium text-ink hover:text-accent">{c.name}</Link>
                  <p className="truncate text-[12px] text-faint">{c.college || c.email}</p>
                  {c.preferred.length > 0 && <Badge tone="info" className="mt-1">Preferred college</Badge>}
                </td>
                <td className="px-4 py-3">
                  <Badge tone={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status]}</Badge>
                  <p className="mt-1 text-[12px] text-muted">{stageLabel(c.stage)}</p>
                </td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums">{c.score ?? '—'}</td>
                <td className="px-4 py-3">
                  <p className="tabular-nums">{c.salary}</p>
                  {c.salaryRaw && <p className="max-w-[140px] truncate text-[12px] text-faint" title={c.salaryRaw}>“{c.salaryRaw}”</p>}
                </td>
                <td className="max-w-[360px] px-4 py-3 text-[12px] text-muted">
                  <p className="line-clamp-2">{c.reason}</p>
                  {c.flags.length > 0 && c.status !== 'out' && <p className="mt-1 text-warn">⚑ {c.flags[0]}{c.flags.length > 1 ? ` +${c.flags.length - 1}` : ''}</p>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Mobile cards */}
        <ul className="divide-y divide-line md:hidden">
          {shown.map(c => (
            <li key={c.id}>
              <Link href={`/roles/${roleId}/applicants/${c.id}`} className="block px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{c.name}</p>
                    <p className="truncate text-[12px] text-faint">{c.college || c.email}</p>
                  </div>
                  <span className="text-lg font-semibold tabular-nums">{c.score ?? '—'}</span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Badge tone={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status]}</Badge>
                  <Badge>{stageLabel(c.stage)}</Badge>
                  <Badge>{c.salary}</Badge>
                </div>
                <p className="mt-2 line-clamp-2 text-[12px] text-muted">{c.reason}</p>
              </Link>
            </li>
          ))}
        </ul>
        {shown.length === 0 && <p className="px-4 py-10 text-center text-sm text-muted">No applicants match these filters.</p>}
      </Card>
    </div>
  )
}
