import { useState } from 'react'
import { Download, Users, ArrowRight, Shield, Brain } from 'lucide-react'
import { Job, useJobStore } from '../../../stores/jobStore'
import { exportToExcel } from '../../../lib/export'

interface Props {
  job: Job
  onNext: () => void
}

export default function StepL1Results({ job, onNext }: Props) {
  const { updateJob } = useJobStore()

  const allCandidates = job.candidates
  const shortlisted = allCandidates.filter(c => c.status === 'l1_shortlisted').sort((a, b) => (b.l1Score || 0) - (a.l1Score || 0))
  const aiDetected = allCandidates.filter(c => (c.aiDetectionScore || 0) > 70)
  const rejected = allCandidates.filter(c => c.status === 'rejected' && (c.aiDetectionScore || 0) <= 70)

  const options = [5, 10, 15, 20, 25].filter(n => n <= shortlisted.length)
  const [selectedCount, setSelectedCount] = useState<number>(
    options.includes(10) ? 10 : options[options.length - 1] || shortlisted.length
  )

  const handleExport = () => {
    exportToExcel(allCandidates, `${job.title.replace(/\s+/g, '_')}_L1_Results`)
  }

  const handleContinue = () => {
    // Keep only top N as l1_shortlisted, reject the rest
    shortlisted.forEach((c, i) => {
      if (i >= selectedCount) {
        useJobStore.getState().updateCandidate(job.id, c.id, { status: 'rejected' })
      }
    })
    updateJob(job.id, { shortlistedCount: selectedCount })
    onNext()
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white mb-2">L1 Results</h2>
        <p className="text-sm text-white/40">
          Review screening results and select how many candidates advance to Level 2 resume screening.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="glass-card p-4 text-center">
          <p className="text-2xl font-bold text-emerald-400">{shortlisted.length}</p>
          <p className="text-xs text-white/40 mt-1">Passed L1</p>
        </div>
        <div className="glass-card p-4 text-center">
          <p className="text-2xl font-bold text-amber-400">{aiDetected.length}</p>
          <p className="text-xs text-white/40 mt-1">AI Detected</p>
        </div>
        <div className="glass-card p-4 text-center">
          <p className="text-2xl font-bold text-white/40">{rejected.length}</p>
          <p className="text-xs text-white/40 mt-1">Below Threshold</p>
        </div>
      </div>

      {/* Top Candidates Preview */}
      {shortlisted.length > 0 && (
        <div className="glass-card p-6">
          <h3 className="text-sm font-medium text-white/70 mb-3">Top Candidates by L1 Score</h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {shortlisted.slice(0, 15).map((c, i) => (
              <div key={c.id} className="flex items-center justify-between p-3 rounded-lg bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-white/20 w-5">#{i + 1}</span>
                  <div>
                    <p className="text-sm font-medium text-white">{c.name}</p>
                    <p className="text-xs text-white/30">{c.email || 'No email'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5">
                    <Shield size={10} className="text-white/20" />
                    <span className="text-xs text-white/30">{c.aiDetectionScore || 0}%</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Brain size={10} className="text-brand-400" />
                    <span className={`text-sm font-bold ${
                      (c.l1Score || 0) >= 70 ? 'text-emerald-400' : (c.l1Score || 0) >= 50 ? 'text-amber-400' : 'text-white/40'
                    }`}>
                      {c.l1Score || 0}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Selection */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Users size={16} className="text-brand-400" />
            <p className="text-sm font-medium text-white">How many candidates should proceed to L2?</p>
          </div>
          <button onClick={handleExport} className="btn-secondary flex items-center gap-2 text-sm py-2">
            <Download size={14} /> Export Results
          </button>
        </div>

        <div className="flex gap-3 mb-3">
          {options.map(count => (
            <button
              key={count}
              onClick={() => setSelectedCount(count)}
              className={`px-5 py-3 rounded-xl border text-sm font-medium transition-all ${
                selectedCount === count
                  ? 'border-brand-500/50 bg-brand-500/10 text-brand-400'
                  : 'border-white/[0.06] bg-white/[0.02] text-white/50 hover:bg-white/[0.04]'
              }`}
            >
              Top {count}
            </button>
          ))}
        </div>
        <p className="text-xs text-white/30">
          The top {selectedCount} candidates ranked by L1 score will advance to resume-based deep screening.
        </p>
      </div>

      {/* Funnel */}
      <div className="glass-card p-6">
        <h3 className="text-sm font-medium text-white/70 mb-4">Pipeline Funnel</h3>
        <div className="space-y-2">
          {[
            { label: 'Total Applied', count: allCandidates.length, pct: 100 },
            { label: 'L1 Shortlisted', count: shortlisted.length, pct: Math.round((shortlisted.length / allCandidates.length) * 100) || 0 },
            { label: 'Advancing to L2', count: selectedCount, pct: Math.round((selectedCount / allCandidates.length) * 100) || 0 },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-4">
              <div className="w-28 text-xs text-white/40">{item.label}</div>
              <div className="flex-1 h-6 rounded-md bg-white/[0.03] overflow-hidden relative">
                <div
                  className="h-full bg-gradient-to-r from-brand-600/40 to-brand-500/40 rounded-md transition-all duration-500"
                  style={{ width: `${item.pct}%` }}
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-white/50">
                  {item.count} ({item.pct}%)
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <button onClick={handleContinue} className="btn-primary flex items-center gap-2">
          Proceed to L2 Screening <ArrowRight size={16} />
        </button>
      </div>
    </div>
  )
}
