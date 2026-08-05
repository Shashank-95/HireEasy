import { useState, useMemo } from 'react'
import { Download, ArrowRight, Shield, Search, ChevronRight, Filter, AlertTriangle, ThumbsUp, ThumbsDown } from 'lucide-react'
import { Job, Candidate, useJobStore } from '../../../stores/jobStore'
import { exportToExcel } from '../../../lib/export'
import { FILTER_LABELS } from '../../../lib/screeningFilters'
import { formatCtc, formatExperience, formatNotice } from '../../../lib/candidateParsing'
import CandidateDetail from '../../../components/candidate/CandidateDetail'

interface Props {
  job: Job
  onNext: () => void
}

type Tab = 'shortlisted' | 'rejected' | 'filtered' | 'all'

export default function StepL1Results({ job, onNext }: Props) {
  const [tab, setTab] = useState<Tab>('shortlisted')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Candidate | null>(null)
  const { updateJob } = useJobStore()

  const groups = useMemo(() => {
    const all = [...job.candidates].sort((a, b) => (b.l1Score || 0) - (a.l1Score || 0))
    return {
      all,
      shortlisted: all.filter(c => c.status === 'l1_shortlisted'),
      // Scored but didn't make the cut — distinct from structurally filtered
      rejected: all.filter(c => c.status === 'rejected' && !c.filterFailures?.length),
      filtered: all.filter(c => (c.filterFailures?.length || 0) > 0),
    }
  }, [job.candidates])

  const visible = useMemo(() => {
    const list = groups[tab]
    if (!query.trim()) return list
    const q = query.toLowerCase()
    return list.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.location?.toLowerCase().includes(q)
    )
  }, [groups, tab, query])

  // Keep the drawer in sync when the store updates (e.g. after a manual override)
  const liveSelected = selected ? job.candidates.find(c => c.id === selected.id) || null : null

  const handleExport = () => {
    exportToExcel(job.candidates, `${job.title.replace(/\s+/g, '_')}_L1_Results`)
  }

  const handleContinue = () => {
    updateJob(job.id, { shortlistedCount: groups.shortlisted.length })
    onNext()
  }

  const tabs: { key: Tab; label: string; count: number; tone: string }[] = [
    { key: 'shortlisted', label: 'Shortlisted', count: groups.shortlisted.length, tone: 'emerald' },
    { key: 'rejected', label: 'Below cutoff', count: groups.rejected.length, tone: 'white' },
    { key: 'filtered', label: 'Hard filtered', count: groups.filtered.length, tone: 'amber' },
    { key: 'all', label: 'All', count: groups.all.length, tone: 'white' },
  ]

  const overrideCount = job.candidates.filter(c => c.manualDecision).length

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white mb-2">L1 Results</h2>
          <p className="text-sm text-white/40">
            {groups.shortlisted.length} of {groups.all.length} candidates advance to L2.
            Click any candidate to see the full evidence behind their score.
          </p>
        </div>
        <button onClick={handleExport} className="btn-secondary flex items-center gap-2 text-sm py-2 shrink-0">
          <Download size={14} /> Export
        </button>
      </div>

      {/* Funnel */}
      <div className="glass-card p-6">
        <h3 className="text-sm font-medium text-white/70 mb-4">Pipeline Funnel</h3>
        <div className="space-y-2">
          {[
            { label: 'Applied', count: groups.all.length, tone: 'bg-white/20' },
            { label: 'Passed filters', count: groups.all.length - groups.filtered.length, tone: 'bg-brand-500/40' },
            { label: 'Shortlisted', count: groups.shortlisted.length, tone: 'bg-emerald-500/50' },
          ].map((item, i) => {
            const pct = groups.all.length ? Math.round((item.count / groups.all.length) * 100) : 0
            return (
              <div key={i} className="flex items-center gap-4">
                <div className="w-28 text-xs text-white/40">{item.label}</div>
                <div className="flex-1 h-6 rounded-md bg-white/[0.03] overflow-hidden relative">
                  <div className={`h-full ${item.tone} rounded-md transition-all duration-500`} style={{ width: `${pct}%` }} />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-white/60">
                    {item.count} ({pct}%)
                  </span>
                </div>
              </div>
            )
          })}
        </div>
        {overrideCount > 0 && (
          <p className="text-xs text-violet-300/70 mt-3">
            {overrideCount} candidate{overrideCount > 1 ? 's' : ''} manually overridden by you.
          </p>
        )}
      </div>

      {/* Candidate browser */}
      <div className="glass-card overflow-hidden">
        <div className="p-4 border-b border-white/[0.06] flex items-center gap-3">
          <div className="flex gap-1">
            {tabs.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  tab === t.key
                    ? 'bg-brand-500/15 text-brand-400 border border-brand-500/25'
                    : 'text-white/40 hover:text-white/60 border border-transparent'
                }`}
              >
                {t.label}
                <span className="ml-1.5 text-white/30">{t.count}</span>
              </button>
            ))}
          </div>
          <div className="flex-1 relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, email, location…"
              className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-white/20 outline-none focus:border-brand-500/40"
            />
          </div>
        </div>

        <div className="max-h-[28rem] overflow-y-auto">
          {visible.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-sm text-white/30">
                {query ? 'No candidates match your search.' : 'No candidates in this group.'}
              </p>
            </div>
          ) : (
            visible.map((c, i) => (
              <button
                key={c.id}
                onClick={() => setSelected(c)}
                className="w-full flex items-center gap-3 px-4 py-3 border-b border-white/[0.03] hover:bg-white/[0.03] transition-colors text-left group"
              >
                <span className="text-[11px] text-white/20 w-6 shrink-0">#{i + 1}</span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-white truncate">{c.name}</p>
                    {c.manualDecision === 'promoted' && <ThumbsUp size={11} className="text-emerald-400 shrink-0" />}
                    {c.manualDecision === 'rejected' && <ThumbsDown size={11} className="text-rose-400 shrink-0" />}
                    {c.screeningDetail?.error && <AlertTriangle size={11} className="text-amber-400 shrink-0" />}
                  </div>
                  <div className="flex items-center gap-2.5 mt-0.5 text-[11px] text-white/30">
                    <span className="truncate max-w-[160px]">{c.email || 'no email'}</span>
                    {c.ctcExpected !== undefined && <span className="shrink-0">{formatCtc(c.ctcExpected)}</span>}
                    {c.experienceYears !== undefined && <span className="shrink-0">{formatExperience(c.experienceYears)}</span>}
                    {c.noticePeriodDays !== undefined && <span className="shrink-0">{formatNotice(c.noticePeriodDays)}</span>}
                  </div>
                </div>

                {/* Hard filter chips */}
                {c.filterFailures && c.filterFailures.length > 0 && (
                  <div className="hidden md:flex gap-1 shrink-0">
                    {c.filterFailures.slice(0, 2).map(f => (
                      <span key={f} className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/10 border border-amber-500/15 text-amber-300/70">
                        {FILTER_LABELS[f] || f}
                      </span>
                    ))}
                    {c.filterFailures.length > 2 && (
                      <span className="text-[10px] text-white/25">+{c.filterFailures.length - 2}</span>
                    )}
                  </div>
                )}

                <div className="flex items-center gap-3 shrink-0">
                  {(c.aiDetectionScore || 0) > 50 && (
                    <span className="flex items-center gap-1 text-[11px] text-rose-400/70">
                      <Shield size={10} />{c.aiDetectionScore}%
                    </span>
                  )}
                  <span className="text-xs text-white/40 w-7 text-right">{c.l1Score ?? '—'}</span>
                  <span className={`px-2 py-1 rounded-md text-[11px] font-bold w-16 text-center ${
                    (c.l1Percentile || 0) >= 95 ? 'bg-emerald-500/20 text-emerald-400'
                      : (c.l1Percentile || 0) >= 90 ? 'bg-brand-500/20 text-brand-300'
                      : (c.l1Percentile || 0) >= 75 ? 'bg-amber-500/15 text-amber-400/80'
                      : 'bg-white/[0.05] text-white/30'
                  }`}>
                    {c.l1Percentile !== undefined ? `${c.l1Percentile.toFixed(0)}%ile` : '—'}
                  </span>
                  <ChevronRight size={14} className="text-white/15 group-hover:text-white/40 transition-colors" />
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Hard filter summary */}
      {groups.filtered.length > 0 && (
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Filter size={14} className="text-amber-400" />
            <h3 className="text-sm font-medium text-white/70">Why candidates were filtered</h3>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(
              groups.filtered.reduce<Record<string, number>>((acc, c) => {
                c.filterFailures?.forEach(f => { acc[f] = (acc[f] || 0) + 1 })
                return acc
              }, {})
            )
              .sort((a, b) => b[1] - a[1])
              .map(([rule, count]) => (
                <span key={rule} className="px-2.5 py-1 rounded-md text-[11px] bg-amber-500/10 border border-amber-500/15 text-amber-300/80">
                  {FILTER_LABELS[rule] || rule}: {count}
                </span>
              ))}
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={handleContinue}
          disabled={groups.shortlisted.length === 0}
          className="btn-primary flex items-center gap-2 disabled:opacity-30"
        >
          Proceed to L2 with {groups.shortlisted.length} candidates <ArrowRight size={16} />
        </button>
      </div>

      <CandidateDetail candidate={liveSelected} job={job} onClose={() => setSelected(null)} />
    </div>
  )
}
