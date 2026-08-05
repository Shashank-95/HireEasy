import { useState, useEffect, useMemo } from 'react'
import { Loader2, Brain, Shield, CheckCircle2, AlertTriangle, Filter, Clock, Zap, RotateCcw } from 'lucide-react'
import { motion } from 'framer-motion'
import { Job, Candidate, ScreeningDetail, DEFAULT_CRITERIA, useJobStore } from '../../../stores/jobStore'
import { useSettingsStore } from '../../../stores/settingsStore'
import { screenCandidate } from '../../../lib/llm'
import { detectAiContent, heuristicAiDetection } from '../../../lib/aiDetection'
import { evaluateCriteria, evaluateEffort, buildFingerprintIndex, FILTER_LABELS } from '../../../lib/screeningFilters'

interface Props {
  job: Job
  onNext: () => void
}

/** How many LLM calls run concurrently. Tuned to stay under free-tier rate limits. */
const LLM_CONCURRENCY = 5
const AI_CONCURRENCY = 8
/** Scores below this are never shortlisted, regardless of percentile rank. */
const MIN_QUALITY_FLOOR = 35

export default function StepL1Screening({ job, onNext }: Props) {
  const [screening, setScreening] = useState(false)
  const [progress, setProgress] = useState(0)
  const [phase, setPhase] = useState('')
  const [detailLine, setDetailLine] = useState('')
  const [complete, setComplete] = useState(false)
  const [percentileCutoff, setPercentileCutoff] = useState(job.l1PercentileCutoff ?? 90)
  const [errorCount, setErrorCount] = useState(0)
  const settings = useSettingsStore()
  const { updateJob, bulkUpdateCandidates } = useJobStore()

  const criteria = job.screeningCriteria || DEFAULT_CRITERIA

  /** Candidates that already carry an LLM verdict — means screening has run. */
  const alreadyScored = job.candidates.some(c => c.screeningDetail !== undefined)

  // Pre-flight: how many candidates will actually reach the LLM?
  const preflight = useMemo(() => {
    const fpIndex = buildFingerprintIndex(job.candidates)
    let filteredByCriteria = 0
    let filteredByEffort = 0
    const byRule: Record<string, number> = {}

    for (const c of job.candidates) {
      const effort = evaluateEffort(c, fpIndex)
      if (effort.failures.length > 0) {
        filteredByEffort++
        effort.failures.forEach(f => { byRule[f] = (byRule[f] || 0) + 1 })
        continue
      }
      if (criteria.enabled && criteria.mode === 'reject') {
        const crit = evaluateCriteria(c, criteria)
        if (crit.failures.length > 0) {
          filteredByCriteria++
          crit.failures.forEach(f => { byRule[f] = (byRule[f] || 0) + 1 })
        }
      }
    }

    const toScore = job.candidates.length - filteredByEffort - filteredByCriteria
    // Rough wall-clock: each batch of LLM_CONCURRENCY takes ~4s including the inter-batch pause
    const estSeconds = Math.ceil(toScore / LLM_CONCURRENCY) * 4 + Math.ceil(job.candidates.length / AI_CONCURRENCY) * 2
    return { toScore, filteredByEffort, filteredByCriteria, byRule, estSeconds }
  }, [job.candidates, criteria])

  // Reflect a previously-completed run when revisiting the step
  useEffect(() => {
    if (alreadyScored && !complete && !screening) setComplete(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const stats = useMemo(() => {
    const c = job.candidates
    return {
      total: c.length,
      shortlisted: c.filter(x => x.status === 'l1_shortlisted').length,
      aiDetected: c.filter(x => (x.aiDetectionScore || 0) > 70).length,
      hardFiltered: c.filter(x => (x.filterFailures?.length || 0) > 0).length,
      errored: c.filter(x => x.screeningDetail?.error).length,
    }
  }, [job.candidates])

  /**
   * Applies percentile ranking + shortlisting to already-computed scores.
   * Pure math over cached l1Score values — no API calls, so the recruiter can
   * try different cutoffs instantly and for free.
   */
  const applyPercentileCutoff = (cutoff: number) => {
    const scored = job.candidates.filter(
      c => typeof c.l1Score === 'number' && (c.filterFailures?.length || 0) === 0
    )
    if (scored.length === 0) return

    const scores = scored.map(c => c.l1Score || 0)
    const patches: { id: string; data: Partial<Candidate> }[] = []

    // Small pools make percentiles meaningless — fall back to a top-N slice.
    const useTopN = scored.length < 10
    const topNCount = Math.max(1, Math.ceil(scored.length * (100 - cutoff) / 100))
    const topNThreshold = [...scores].sort((a, b) => b - a)[topNCount - 1] ?? 0

    for (const c of scored) {
      const score = c.l1Score || 0
      const below = scores.filter(s => s < score).length
      const tied = scores.filter(s => s === score).length - 1
      const percentile = Math.round(((below + tied / 2) / scores.length) * 1000) / 10

      let shortlist = useTopN
        ? score >= topNThreshold && score >= MIN_QUALITY_FLOOR
        : percentile >= cutoff && score >= MIN_QUALITY_FLOOR

      // Recruiter overrides always win
      if (c.manualDecision === 'promoted') shortlist = true
      if (c.manualDecision === 'rejected') shortlist = false

      patches.push({
        id: c.id,
        data: { l1Percentile: percentile, status: shortlist ? 'l1_shortlisted' : 'rejected' },
      })
    }

    // Filtered-out candidates stay rejected with a 0 percentile
    for (const c of job.candidates) {
      if ((c.filterFailures?.length || 0) > 0) {
        patches.push({ id: c.id, data: { l1Percentile: 0, status: 'rejected' } })
      }
    }

    bulkUpdateCandidates(job.id, patches)
    const passed = patches.filter(p => p.data.status === 'l1_shortlisted').length
    updateJob(job.id, { shortlistedCount: passed, l1PercentileCutoff: cutoff })
    setComplete(true)
  }

  const startScreening = async () => {
    if (!settings.isConfigured()) return

    setScreening(true)
    setProgress(0)
    setErrorCount(0)

    const candidates = job.candidates
    const total = candidates.length

    const jdText = job.description && job.description.trim().length > 50
      ? job.description
      : `Job Title: ${job.title}\n${job.department ? `Department: ${job.department}\n` : ''}Required Technical Skills: ${job.technicalSkills.map(s => s.name).join(', ')}\nRequired Non-Technical Skills: ${job.nonTechSkills.map(s => s.name).join(', ')}`

    // ══ Phase 1: deterministic hard filters (zero cost) ══
    setPhase('Applying hard filters')
    setDetailLine('Budget, experience, notice period, effort and duplicate checks')

    const fpIndex = buildFingerprintIndex(candidates)
    const survivors: Candidate[] = []
    const filterPatches: { id: string; data: Partial<Candidate> }[] = []

    for (const c of candidates) {
      const effort = evaluateEffort(c, fpIndex)
      const crit = criteria.enabled ? evaluateCriteria(c, criteria) : { failures: [], reasons: [] }
      const allFailures = [...effort.failures, ...crit.failures]

      // Effort failures are always disqualifying. Criteria failures only
      // disqualify in 'reject' mode — in 'flag' mode we still score them.
      const disqualified =
        effort.failures.length > 0 || (criteria.mode === 'reject' && crit.failures.length > 0)

      if (disqualified) {
        filterPatches.push({
          id: c.id,
          data: { filterFailures: allFailures, l1Score: 0, l1Percentile: 0, status: 'rejected' },
        })
      } else {
        filterPatches.push({ id: c.id, data: { filterFailures: allFailures.length ? allFailures : undefined } })
        survivors.push(c)
      }
    }
    bulkUpdateCandidates(job.id, filterPatches)
    setProgress(5)

    if (survivors.length === 0) {
      setPhase('No candidates passed the hard filters')
      setDetailLine('Loosen your criteria in the Job Description step and try again.')
      setScreening(false)
      setComplete(true)
      return
    }

    // ══ Phase 2: AI-generated content detection ══
    setPhase('Detecting AI-generated responses')
    const heuristics = heuristicAiDetection(survivors.map(c => Object.values(c.responses).join(' ')))
    const aiPatches: { id: string; data: Partial<Candidate> }[] = []

    for (let i = 0; i < survivors.length; i += AI_CONCURRENCY) {
      const batch = survivors.slice(i, i + AI_CONCURRENCY)
      setDetailLine(`${Math.min(i + batch.length, survivors.length)} of ${survivors.length} checked`)

      const results = await Promise.all(
        batch.map(async (c, idx) => {
          const globalIdx = i + idx
          const text = Object.values(c.responses).join(' ')
          // Local heuristics always produce a signal, even with no detection API key
          const localScore = heuristics.scores[globalIdx] ?? 0
          if (text.trim().length < 20) return { id: c.id, score: localScore }
          try {
            const r = await detectAiContent(text)
            // A provider score of 0 means "unconfigured or failed" — fall back to
            // heuristics rather than reporting a falsely clean 0%.
            if (r.score === 0) return { id: c.id, score: localScore }
            return { id: c.id, score: Math.round(Math.max(r.score, localScore * 0.7)) }
          } catch {
            return { id: c.id, score: localScore }
          }
        })
      )
      results.forEach(r => aiPatches.push({ id: r.id, data: { aiDetectionScore: r.score } }))
      setProgress(5 + Math.round(((i + batch.length) / survivors.length) * 20))
    }
    bulkUpdateCandidates(job.id, aiPatches)

    const aiScoreById = new Map(aiPatches.map(p => [p.id, p.data.aiDetectionScore || 0]))

    // ══ Phase 3: LLM skill evaluation ══
    setPhase('Evaluating responses against required skills')
    const scorePatches: { id: string; data: Partial<Candidate> }[] = []
    let errors = 0

    for (let i = 0; i < survivors.length; i += LLM_CONCURRENCY) {
      const batch = survivors.slice(i, i + LLM_CONCURRENCY)
      setDetailLine(`${Math.min(i + batch.length, survivors.length)} of ${survivors.length} scored`)

      await Promise.all(
        batch.map(async (candidate) => {
          const responseText = Object.entries(candidate.responses)
            .filter(([, v]) => v.trim().length > 0)
            .map(([q, a]) => `Q: ${q}\nA: ${a}`)
            .join('\n\n')

          const aiScore = aiScoreById.get(candidate.id) ?? 0
          const aiPenalty = aiScore > 70 ? 0.55 : aiScore > 50 ? 0.8 : aiScore > 30 ? 0.92 : 1

          try {
            const result = await screenCandidate(
              responseText,
              jdText,
              job.technicalSkills.map(s => ({ name: s.name, weight: s.weight })),
              job.nonTechSkills.map(s => ({ name: s.name, weight: s.weight })),
              job.behavioralSkills.map(s => ({ name: s.name, weight: s.weight })),
              { jobTitle: job.title, department: job.department },
            )

            const finalScore = Math.round(result.compositeScore * aiPenalty)
            const detail: ScreeningDetail = {
              skillScores: result.skillScores,
              qualitySignals: result.qualitySignals,
              redFlags: result.redFlags,
              tier: result.tier,
              topStrengths: result.topStrengths,
              concerns: result.concerns,
              summary: result.summary,
              rawScore: result.compositeScore,
              aiPenalty,
            }
            scorePatches.push({ id: candidate.id, data: { l1Score: finalScore, screeningDetail: detail } })
          } catch (err: any) {
            errors++
            // Never silently pass or fail on an API error — record it so the
            // recruiter can see exactly which candidates need a re-run.
            scorePatches.push({
              id: candidate.id,
              data: {
                l1Score: 0,
                screeningDetail: {
                  skillScores: {},
                  qualitySignals: { specificity: 0, quantification: 0, relevance: 0, communication: 0, depth: 0 },
                  redFlags: [],
                  tier: 'NO',
                  topStrengths: [],
                  concerns: [],
                  summary: '',
                  rawScore: 0,
                  aiPenalty: 1,
                  error: String(err?.message || err).slice(0, 200),
                },
              },
            })
          }
        })
      )

      setProgress(25 + Math.round(((i + batch.length) / survivors.length) * 65))
      setErrorCount(errors)
      if (i + LLM_CONCURRENCY < survivors.length) await new Promise(r => setTimeout(r, 300))
    }

    bulkUpdateCandidates(job.id, scorePatches)

    // ══ Phase 4: percentile ranking ══
    setPhase('Ranking candidates')
    setDetailLine('')
    setProgress(95)

    // Read fresh state so the percentile pass sees the scores we just wrote
    const freshJob = useJobStore.getState().getJob(job.id)
    if (freshJob) {
      const scored = freshJob.candidates.filter(
        c => typeof c.l1Score === 'number' && (c.filterFailures?.length || 0) === 0
      )
      const scores = scored.map(c => c.l1Score || 0)
      const rankPatches: { id: string; data: Partial<Candidate> }[] = []
      const useTopN = scored.length < 10
      const topNCount = Math.max(1, Math.ceil(scored.length * (100 - percentileCutoff) / 100))
      const topNThreshold = [...scores].sort((a, b) => b - a)[topNCount - 1] ?? 0

      let passed = 0
      for (const c of scored) {
        const score = c.l1Score || 0
        const below = scores.filter(s => s < score).length
        const tied = scores.filter(s => s === score).length - 1
        const percentile = Math.round(((below + tied / 2) / scores.length) * 1000) / 10
        const shortlist = useTopN
          ? score >= topNThreshold && score >= MIN_QUALITY_FLOOR
          : percentile >= percentileCutoff && score >= MIN_QUALITY_FLOOR
        if (shortlist) passed++
        rankPatches.push({
          id: c.id,
          data: { l1Percentile: percentile, status: shortlist ? 'l1_shortlisted' : 'rejected' },
        })
      }
      bulkUpdateCandidates(job.id, rankPatches)
      updateJob(job.id, { shortlistedCount: passed, candidateCount: total, l1PercentileCutoff: percentileCutoff })
    }

    setProgress(100)
    setPhase('Screening complete')
    setComplete(true)
    setScreening(false)
  }

  const estMinutes = Math.ceil(preflight.estSeconds / 60)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white mb-2">Level 1 Screening</h2>
        <p className="text-sm text-white/40">
          Hard filters run first at zero cost, then AI evaluates the survivors against your weighted skills and ranks them by percentile.
        </p>
      </div>

      {/* Pre-flight plan */}
      {!screening && !complete && (
        <div className="glass-card p-6">
          <h3 className="font-medium text-white mb-4">Screening Plan</h3>

          <div className="grid grid-cols-3 gap-3 mb-5">
            <PlanStat
              icon={Filter}
              tone="amber"
              value={preflight.filteredByEffort + preflight.filteredByCriteria}
              label="Filtered upfront"
              sub="No AI cost"
            />
            <PlanStat
              icon={Brain}
              tone="brand"
              value={preflight.toScore}
              label="AI evaluations"
              sub={`${settings.preferredLlm}`}
            />
            <PlanStat
              icon={Clock}
              tone="white"
              value={estMinutes < 1 ? '<1' : estMinutes}
              label="Est. minutes"
              sub={`${LLM_CONCURRENCY} parallel`}
            />
          </div>

          {Object.keys(preflight.byRule).length > 0 && (
            <div className="mb-5">
              <p className="text-xs text-white/40 mb-2">Filtered before AI scoring:</p>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(preflight.byRule)
                  .sort((a, b) => b[1] - a[1])
                  .map(([rule, count]) => (
                    <span key={rule} className="px-2 py-1 rounded-md text-[11px] bg-amber-500/10 border border-amber-500/15 text-amber-300/80">
                      {FILTER_LABELS[rule] || rule}: {count}
                    </span>
                  ))}
              </div>
            </div>
          )}

          <CutoffSelector
            value={percentileCutoff}
            onChange={setPercentileCutoff}
            poolSize={preflight.toScore}
          />

          {!settings.isConfigured() && (
            <div className="mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center gap-2">
              <AlertTriangle size={14} className="text-amber-400 shrink-0" />
              <p className="text-xs text-amber-400">
                No LLM configured. Add a free Gemini or Groq key in Settings first.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Progress */}
      {screening && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <Loader2 size={18} className="text-brand-400 animate-spin" />
            <div>
              <p className="text-sm text-white/80">{phase}</p>
              {detailLine && <p className="text-xs text-white/30 mt-0.5">{detailLine}</p>}
            </div>
          </div>
          <div className="w-full h-2 rounded-full bg-white/[0.06] overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-brand-500 to-brand-400 rounded-full"
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
          <div className="flex justify-between mt-2">
            {errorCount > 0 && (
              <p className="text-xs text-amber-400">{errorCount} API failures (retried)</p>
            )}
            <p className="text-xs text-white/30 ml-auto">{progress}%</p>
          </div>
        </motion.div>
      )}

      {/* Results */}
      {complete && !screening && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-6">
          <div className="flex items-center gap-2 mb-5">
            <CheckCircle2 size={18} className="text-emerald-400" />
            <h3 className="font-medium text-white">Screening Complete</h3>
          </div>

          <div className="grid grid-cols-4 gap-3 mb-5">
            <ResultStat value={stats.total} label="Total" tone="white" />
            <ResultStat value={stats.shortlisted} label="Shortlisted" tone="emerald" />
            <ResultStat value={stats.hardFiltered} label="Hard filtered" tone="amber" />
            <ResultStat value={stats.aiDetected} label="AI flagged" tone="rose" />
          </div>

          {stats.errored > 0 && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/5 border border-amber-500/15 mb-4">
              <AlertTriangle size={14} className="text-amber-400 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-400/80">
                {stats.errored} candidates could not be scored due to API errors and were excluded from ranking.
                Re-run the full screening once your quota resets to include them.
              </p>
            </div>
          )}

          <div className="pt-5 border-t border-white/[0.06]">
            <CutoffSelector
              value={percentileCutoff}
              onChange={setPercentileCutoff}
              poolSize={job.candidates.filter(c => typeof c.l1Score === 'number' && !c.filterFailures?.length).length}
            />
            <button
              onClick={() => applyPercentileCutoff(percentileCutoff)}
              className="mt-4 w-full py-2.5 rounded-lg bg-brand-500/10 hover:bg-brand-500/20 border border-brand-500/30 text-brand-300 text-sm font-medium transition-all flex items-center justify-center gap-2"
            >
              <Zap size={14} />
              Re-shortlist at {percentileCutoff}th percentile — instant, no API cost
            </button>
          </div>
        </motion.div>
      )}

      <div className="flex justify-end gap-3">
        {!complete && (
          <button
            onClick={startScreening}
            disabled={screening || !settings.isConfigured() || preflight.toScore === 0}
            className="btn-primary flex items-center gap-2 disabled:opacity-30"
          >
            {screening ? <Loader2 size={16} className="animate-spin" /> : <Brain size={16} />}
            {screening ? 'Screening…' : `Screen ${preflight.toScore} Candidates`}
          </button>
        )}
        {complete && (
          <>
            <button
              onClick={startScreening}
              disabled={screening || !settings.isConfigured()}
              className="px-4 py-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-sm text-white/70 transition-all flex items-center gap-2"
              title="Re-run all AI evaluations from scratch — uses API quota"
            >
              <RotateCcw size={14} /> Re-run Full Screening
            </button>
            <button onClick={onNext} className="btn-primary">View Results & Configure L2</button>
          </>
        )}
      </div>
    </div>
  )
}

function CutoffSelector({ value, onChange, poolSize }: {
  value: number
  onChange: (v: number) => void
  poolSize: number
}) {
  const expected = Math.max(1, Math.round(poolSize * (100 - value) / 100))
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-medium text-white">Shortlist cutoff</p>
          <p className="text-xs text-white/40 mt-0.5">
            Ranked like a competitive exam — only the top {(100 - value).toFixed(0)}% advance
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-brand-400">
            {value}<span className="text-sm text-white/40">th</span>
          </p>
          <p className="text-[10px] text-white/30">≈ {expected} candidates</p>
        </div>
      </div>
      <input
        type="range"
        min={50}
        max={99}
        step={1}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        className="w-full accent-brand-500 h-1"
      />
      <div className="flex justify-between text-[10px] text-white/25 mt-2">
        <span>Broad · top 50%</span>
        <span>Selective · top 25%</span>
        <span>Strict · top 10%</span>
        <span>Elite · top 1%</span>
      </div>
    </div>
  )
}

function PlanStat({ icon: Icon, tone, value, label, sub }: {
  icon: any; tone: 'amber' | 'brand' | 'white'; value: number | string; label: string; sub: string
}) {
  const colors = {
    amber: 'text-amber-400 bg-amber-500/10 border-amber-500/15',
    brand: 'text-brand-400 bg-brand-500/10 border-brand-500/15',
    white: 'text-white/70 bg-white/[0.03] border-white/[0.06]',
  }[tone]
  return (
    <div className={`p-4 rounded-xl border ${colors.split(' ').slice(1).join(' ')}`}>
      <Icon size={14} className={colors.split(' ')[0]} />
      <p className={`text-2xl font-bold mt-2 ${colors.split(' ')[0]}`}>{value}</p>
      <p className="text-xs text-white/50">{label}</p>
      <p className="text-[10px] text-white/25 mt-0.5">{sub}</p>
    </div>
  )
}

function ResultStat({ value, label, tone }: { value: number; label: string; tone: string }) {
  const color = {
    white: 'text-white', emerald: 'text-emerald-400', amber: 'text-amber-400', rose: 'text-rose-400',
  }[tone] || 'text-white'
  return (
    <div className="p-4 rounded-xl bg-white/[0.03] text-center">
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-white/40 mt-1">{label}</p>
    </div>
  )
}
