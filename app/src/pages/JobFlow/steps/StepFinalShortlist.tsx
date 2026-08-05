import { useState, useMemo } from 'react'
import { Download, ArrowRight, TrendingUp, ChevronRight, ThumbsUp, ThumbsDown, Info } from 'lucide-react'
import { Job, Candidate, useJobStore } from '../../../stores/jobStore'
import { exportToExcel } from '../../../lib/export'
import { formatCtc, formatExperience, formatNotice } from '../../../lib/candidateParsing'
import CandidateDetail from '../../../components/candidate/CandidateDetail'

interface Props {
  job: Job
  onNext: () => void
}

export default function StepFinalShortlist({ job, onNext }: Props) {
  const { updateJob, bulkUpdateCandidates } = useJobStore()
  const [selected, setSelected] = useState<Candidate | null>(null)
  /** How much L2 (resume depth) counts vs L1 (screening answers). */
  const [l2Weight, setL2Weight] = useState(60)

  const pool = useMemo(
    () => job.candidates.filter(c => c.status === 'l2_shortlisted' || c.finalScore !== undefined),
    [job.candidates]
  )

  /** Blend L1 and L2 into a single decision score, honouring manual overrides. */
  const ranked = useMemo(() => {
    return pool
      .map(c => {
        const l1 = c.l1Score ?? 0
        const l2 = c.l2Score ?? l1
        const blended = Math.round((l2 * l2Weight + l1 * (100 - l2Weight)) / 100)
        return { candidate: c, blended }
      })
      .sort((a, b) => {
        // Manual promotions float to the top, manual rejections sink
        const aRank = a.candidate.manualDecision === 'promoted' ? 1 : a.candidate.manualDecision === 'rejected' ? -1 : 0
        const bRank = b.candidate.manualDecision === 'promoted' ? 1 : b.candidate.manualDecision === 'rejected' ? -1 : 0
        if (aRank !== bRank) return bRank - aRank
        return b.blended - a.blended
      })
  }, [pool, l2Weight])

  const [interviewCount, setInterviewCount] = useState(() => Math.min(10, Math.max(1, Math.ceil(pool.length * 0.3))))
  const effectiveCount = Math.min(interviewCount, ranked.length)

  const handleExport = () => {
    exportToExcel(job.candidates, `${job.title.replace(/\s+/g, '_')}_Final_Ranking`)
  }

  const handleContinue = () => {
    const patches = ranked.map((r, i) => ({
      id: r.candidate.id,
      data: {
        finalScore: r.blended,
        status: (i < effectiveCount ? 'l2_shortlisted' : 'rejected') as Candidate['status'],
      },
    }))
    bulkUpdateCandidates(job.id, patches)
    updateJob(job.id, { shortlistedCount: effectiveCount })
    onNext()
  }

  const liveSelected = selected ? job.candidates.find(c => c.id === selected.id) || null : null
  const cutoffScore = ranked[effectiveCount - 1]?.blended

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white mb-2">Final Shortlist</h2>
        <p className="text-sm text-white/40">
          Blend the L1 and L2 signals, then choose how many candidates to interview.
        </p>
      </div>

      {pool.length === 0 ? (
        <div className="glass-card p-10 text-center">
          <p className="text-sm text-white/40">No candidates completed L2 screening.</p>
          <p className="text-xs text-white/25 mt-1">Go back and run L2 screening first.</p>
        </div>
      ) : (
        <>
          {/* Score blend */}
          <div className="glass-card p-6">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp size={16} className="text-brand-400" />
              <h3 className="font-medium text-white">Score Weighting</h3>
            </div>

            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm text-white/70">L1 answers vs L2 resume depth</p>
                <p className="text-xs text-white/40 mt-0.5">
                  Adjust which signal matters more for the final ranking
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm">
                  <span className="text-white/40">{100 - l2Weight}% L1</span>
                  <span className="text-white/20 mx-1.5">·</span>
                  <span className="text-brand-400 font-bold">{l2Weight}% L2</span>
                </p>
              </div>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={10}
              value={l2Weight}
              onChange={(e) => setL2Weight(parseInt(e.target.value))}
              className="w-full accent-brand-500 h-1"
            />
            <div className="flex justify-between text-[10px] text-white/25 mt-2">
              <span>Screening answers only</span>
              <span>Balanced</span>
              <span>Resume only</span>
            </div>
          </div>

          {/* Interview count */}
          <div className="glass-card p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-medium text-white">How many candidates to interview?</p>
                <p className="text-xs text-white/40 mt-0.5">
                  {cutoffScore !== undefined && `Cutoff score: ${cutoffScore}`}
                </p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-brand-400">{effectiveCount}</p>
                <p className="text-[10px] text-white/30">of {ranked.length}</p>
              </div>
            </div>
            <input
              type="range"
              min={1}
              max={Math.max(1, ranked.length)}
              step={1}
              value={effectiveCount}
              onChange={(e) => setInterviewCount(parseInt(e.target.value))}
              className="w-full accent-brand-500 h-1"
            />
            <div className="flex gap-2 mt-4">
              {[
                { label: 'Top 3', n: 3 },
                { label: 'Top 5', n: 5 },
                { label: 'Top 10', n: 10 },
                { label: 'Top 25%', n: Math.max(1, Math.ceil(ranked.length * 0.25)) },
                { label: 'All', n: ranked.length },
              ]
                .filter(o => o.n <= ranked.length)
                .map(o => (
                  <button
                    key={o.label}
                    onClick={() => setInterviewCount(o.n)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      effectiveCount === o.n
                        ? 'border-brand-500/50 bg-brand-500/10 text-brand-400'
                        : 'border-white/[0.06] bg-white/[0.02] text-white/50 hover:bg-white/[0.04]'
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
            </div>
          </div>

          {/* Ranked list */}
          <div className="glass-card overflow-hidden">
            <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
              <h3 className="text-sm font-medium text-white/70">Final Ranking</h3>
              <p className="text-[11px] text-white/30 flex items-center gap-1">
                <Info size={10} /> Click a candidate for full evidence
              </p>
            </div>
            <div className="max-h-[26rem] overflow-y-auto">
              {ranked.map((r, i) => {
                const c = r.candidate
                const advancing = i < effectiveCount
                return (
                  <button
                    key={c.id}
                    onClick={() => setSelected(c)}
                    className={`w-full flex items-center gap-3 px-4 py-3 border-b border-white/[0.03] transition-colors text-left group ${
                      advancing ? 'bg-emerald-500/[0.04] hover:bg-emerald-500/[0.08]' : 'hover:bg-white/[0.03] opacity-50'
                    }`}
                  >
                    <span className="text-[11px] text-white/20 w-6 shrink-0">#{i + 1}</span>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-white truncate">{c.name}</p>
                        {c.manualDecision === 'promoted' && <ThumbsUp size={11} className="text-emerald-400 shrink-0" />}
                        {c.manualDecision === 'rejected' && <ThumbsDown size={11} className="text-rose-400 shrink-0" />}
                      </div>
                      <div className="flex items-center gap-2.5 mt-0.5 text-[11px] text-white/30">
                        {c.ctcExpected !== undefined && <span>{formatCtc(c.ctcExpected)}</span>}
                        {c.experienceYears !== undefined && <span>{formatExperience(c.experienceYears)}</span>}
                        {c.noticePeriodDays !== undefined && <span>{formatNotice(c.noticePeriodDays)}</span>}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 text-xs">
                      <span className="text-white/30 w-14 text-right">L1 {c.l1Score ?? '—'}</span>
                      <span className="text-white/30 w-14 text-right">L2 {c.l2Score ?? '—'}</span>
                      <span className={`px-2 py-1 rounded-md font-bold w-11 text-center ${
                        advancing ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/[0.05] text-white/30'
                      }`}>
                        {r.blended}
                      </span>
                      <ChevronRight size={14} className="text-white/15 group-hover:text-white/40 transition-colors" />
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </>
      )}

      <div className="flex justify-between">
        <button onClick={handleExport} className="btn-secondary flex items-center gap-2 text-sm">
          <Download size={14} /> Export Full Ranking
        </button>
        <button
          onClick={handleContinue}
          disabled={ranked.length === 0}
          className="btn-primary flex items-center gap-2 disabled:opacity-30"
        >
          Interview {effectiveCount} candidates <ArrowRight size={16} />
        </button>
      </div>

      <CandidateDetail candidate={liveSelected} job={job} onClose={() => setSelected(null)} />
    </div>
  )
}
