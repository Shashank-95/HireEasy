import { useState } from 'react'
import { Download, ArrowRight, TrendingUp } from 'lucide-react'
import { Job, useJobStore } from '../../../stores/jobStore'
import { exportToExcel } from '../../../lib/export'

interface Props {
  job: Job
  onNext: () => void
}

export default function StepFinalShortlist({ job, onNext }: Props) {
  const [percentile, setPercentile] = useState(75)
  const { updateJob, updateCandidate } = useJobStore()

  const l2Candidates = job.candidates
    .filter(c => c.status === 'l2_shortlisted')
    .sort((a, b) => (b.l2Score || 0) - (a.l2Score || 0))

  const totalL2 = l2Candidates.length
  const finalCount = Math.max(1, Math.ceil(totalL2 * ((100 - percentile) / 100)))

  const percentileOptions = [
    { value: 90, label: 'Top 90th', desc: 'Only the best — highest bar' },
    { value: 75, label: 'Top 75th', desc: 'Strong candidates — recommended' },
    { value: 50, label: 'Top 50th', desc: 'Broader pool — more options' },
  ]

  const handleExport = () => {
    exportToExcel(job.candidates, `${job.title.replace(/\s+/g, '_')}_Full_Ranking`)
  }

  const handleContinue = () => {
    // Mark candidates beyond cutoff as rejected
    l2Candidates.forEach((c, i) => {
      if (i >= finalCount) {
        updateCandidate(job.id, c.id, { status: 'rejected', finalScore: c.l2Score })
      } else {
        updateCandidate(job.id, c.id, { finalScore: c.l2Score })
      }
    })
    updateJob(job.id, { shortlistedCount: finalCount })
    onNext()
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white mb-2">Final Shortlist</h2>
        <p className="text-sm text-white/40">
          Select the percentile cutoff for interview candidates. Only quality candidates above this threshold will advance.
        </p>
      </div>

      <div className="glass-card p-6">
        <div className="flex items-center gap-2 mb-5">
          <TrendingUp size={16} className="text-brand-400" />
          <h3 className="font-medium text-white">Percentile Selection</h3>
        </div>

        <div className="space-y-3 mb-6">
          {percentileOptions.map(opt => {
            const count = Math.max(1, Math.ceil(totalL2 * ((100 - opt.value) / 100)))
            return (
              <button
                key={opt.value}
                onClick={() => setPercentile(opt.value)}
                className={`w-full p-4 rounded-xl border text-left transition-all ${
                  percentile === opt.value
                    ? 'border-brand-500/50 bg-brand-500/10'
                    : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-white">{opt.label} percentile</p>
                    <p className="text-xs text-white/40 mt-0.5">{opt.desc}</p>
                  </div>
                  <span className={`text-lg font-bold ${percentile === opt.value ? 'text-brand-400' : 'text-white/20'}`}>
                    {count}
                  </span>
                </div>
              </button>
            )
          })}
        </div>

        {/* Preview of who makes the cut */}
        {l2Candidates.length > 0 && (
          <div className="space-y-2 mb-4">
            <p className="text-xs text-white/40">Candidates advancing:</p>
            {l2Candidates.slice(0, finalCount).map((c, i) => (
              <div key={c.id} className="flex items-center justify-between p-2 rounded-lg bg-emerald-500/5">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-white/20">#{i + 1}</span>
                  <span className="text-sm text-white">{c.name}</span>
                </div>
                <span className="text-xs font-bold text-emerald-400">{c.l2Score}</span>
              </div>
            ))}
            {l2Candidates.length > finalCount && (
              <div className="text-xs text-white/20 text-center pt-1">
                {l2Candidates.length - finalCount} candidates below cutoff
              </div>
            )}
          </div>
        )}

        <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
          <div className="flex items-center justify-between">
            <span className="text-sm text-white/50">Candidates advancing to interviews:</span>
            <span className="text-xl font-bold text-brand-400">{finalCount}</span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-white/[0.06] mt-3 overflow-hidden">
            <div
              className="h-full bg-brand-500 rounded-full transition-all duration-500"
              style={{ width: `${totalL2 > 0 ? (finalCount / totalL2) * 100 : 0}%` }}
            />
          </div>
          <p className="text-xs text-white/30 mt-2">{finalCount} of {totalL2} L2 candidates selected</p>
        </div>
      </div>

      <div className="flex justify-between">
        <button onClick={handleExport} className="btn-secondary flex items-center gap-2 text-sm">
          <Download size={14} /> Export Full Ranking
        </button>
        <button onClick={handleContinue} className="btn-primary flex items-center gap-2">
          Setup Interviews <ArrowRight size={16} />
        </button>
      </div>
    </div>
  )
}
