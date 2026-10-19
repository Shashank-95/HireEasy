import { useState, useEffect, useMemo } from 'react'
import { Loader2, FileText, Target, Sparkles, CheckCircle2, AlertTriangle, RotateCcw } from 'lucide-react'
import { motion } from 'framer-motion'
import { Job, Candidate, useJobStore } from '../../../stores/jobStore'
import { useSettingsStore } from '../../../stores/settingsStore'
import { analyzeResume } from '../../../lib/llm'
import { downloadResume } from '../../../lib/google'
import { modelVisibleAnswers, redactIdentity } from '../../../lib/screeningFilters'

interface Props {
  job: Job
  onNext: () => void
}

/** Resume downloads are heavier than plain LLM calls, so keep concurrency lower. */
const L2_CONCURRENCY = 4

export default function StepL2Screening({ job, onNext }: Props) {
  const [screening, setScreening] = useState(false)
  const [progress, setProgress] = useState(0)
  const [phase, setPhase] = useState('')
  const [detailLine, setDetailLine] = useState('')
  const [complete, setComplete] = useState(false)
  const [resumesFound, setResumesFound] = useState(0)
  const { bulkUpdateCandidates } = useJobStore()
  const settings = useSettingsStore()

  const pool = useMemo(
    () => job.candidates.filter(c => c.status === 'l1_shortlisted' || c.status === 'l2_shortlisted'),
    [job.candidates]
  )
  const alreadyScored = pool.some(c => typeof c.l2Score === 'number')
  const withResume = pool.filter(c => c.resumeUrl?.startsWith('http')).length

  useEffect(() => {
    if (alreadyScored && !complete && !screening) setComplete(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const ranked = useMemo(
    () => [...pool].filter(c => typeof c.l2Score === 'number').sort((a, b) => (b.l2Score || 0) - (a.l2Score || 0)),
    [pool]
  )

  const startScreening = async () => {
    if (!settings.isConfigured()) return

    setScreening(true)
    setProgress(0)
    setResumesFound(0)

    const jdText = job.description && job.description.trim().length > 50
      ? job.description
      : `Job Title: ${job.title}\nRequired Skills: ${[...job.technicalSkills, ...job.nonTechSkills].map(s => s.name).join(', ')}`

    const allSkills = [...job.technicalSkills, ...job.nonTechSkills, ...job.behavioralSkills]
    const patches: { id: string; data: Partial<Candidate> }[] = []
    let resumeHits = 0

    setPhase('Analysing resumes against the job description')

    for (let i = 0; i < pool.length; i += L2_CONCURRENCY) {
      const batch = pool.slice(i, i + L2_CONCURRENCY)
      setDetailLine(`${Math.min(i + batch.length, pool.length)} of ${pool.length} analysed`)

      await Promise.all(batch.map(async (candidate) => {
        let resumeContent = ''

        if (candidate.resumeUrl?.startsWith('http')) {
          try {
            const text = await downloadResume(candidate.resumeUrl)
            if (text && text.length > 50 && !text.startsWith('[PDF content from:')) {
              resumeContent = text.substring(0, 6000)
              resumeHits++
              setResumesFound(resumeHits)
            }
          } catch {
            // Expired/permissioned link — fall through to response-only scoring
          }
        }

        // Blind screening carries through to L2: no name, no pedigree answers,
        // and the resume's own contact details are redacted
        const blind = !!job.blindScreening
        if (blind && resumeContent) resumeContent = redactIdentity(resumeContent, candidate)

        const responsesSummary = modelVisibleAnswers(candidate.responses, blind)
          .map(([q, a]) => `${q}: ${a}`)
          .join('\n\n')

        const profile = [
          blind ? '' : `Candidate: ${candidate.name}`,
          candidate.experienceYears !== undefined ? `Experience: ${candidate.experienceYears} years` : '',
          candidate.l1Score ? `L1 screening score: ${candidate.l1Score}/100` : '',
          candidate.screeningDetail?.summary ? `L1 assessment: ${candidate.screeningDetail.summary}` : '',
          resumeContent ? `\nResume:\n${resumeContent}` : '',
          responsesSummary ? `\nScreening answers:\n${responsesSummary}` : '',
        ].filter(Boolean).join('\n')

        try {
          const result = await analyzeResume(profile, jdText, allSkills.map(s => ({ name: s.name, weight: s.weight })))
          patches.push({
            id: candidate.id,
            data: { l2Score: result.overallScore, status: 'l2_shortlisted' },
          })
        } catch (err) {
          console.error(`L2 analysis failed for ${candidate.name}:`, err)
          // Fall back to the L1 signal rather than zeroing a good candidate out
          const fallback = candidate.l1Score ? Math.round(candidate.l1Score * 0.85) : 40
          patches.push({
            id: candidate.id,
            data: { l2Score: fallback, status: 'l2_shortlisted' },
          })
        }
      }))

      setProgress(Math.round(((i + batch.length) / pool.length) * 92))
      if (i + L2_CONCURRENCY < pool.length) await new Promise(r => setTimeout(r, 300))
    }

    // Percentile-rank within the L2 pool
    setPhase('Ranking')
    const scores = patches.map(p => p.data.l2Score || 0)
    const withPercentile = patches.map(p => {
      const s = p.data.l2Score || 0
      const below = scores.filter(x => x < s).length
      const tied = scores.filter(x => x === s).length - 1
      const pct = Math.round(((below + tied / 2) / scores.length) * 1000) / 10
      return { ...p, data: { ...p.data, l2Percentile: pct } }
    })

    bulkUpdateCandidates(job.id, withPercentile)
    setProgress(100)
    setPhase('L2 screening complete')
    setDetailLine('')
    setComplete(true)
    setScreening(false)
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white mb-2">Level 2 — Resume Deep Analysis</h2>
        <p className="text-sm text-white/40">
          Each shortlisted candidate's resume is evaluated against the JD for project relevance, measurable impact,
          skill depth and growth signals.
        </p>
      </div>

      {!screening && !complete && (
        <div className="glass-card p-6">
          <h3 className="font-medium text-white mb-4">L2 Evaluation Criteria</h3>
          <div className="grid grid-cols-2 gap-3 mb-5">
            {[
              { icon: Target, label: 'Project Relevance', desc: 'How closely past work maps to this role' },
              { icon: Sparkles, label: 'Demonstrated Impact', desc: 'Quantified outcomes and results' },
              { icon: FileText, label: 'Skill Depth', desc: 'Proficiency vs. the JD requirements' },
              { icon: Target, label: 'Growth Signals', desc: 'Certifications, side projects, learning' },
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.02]">
                <item.icon size={14} className="text-brand-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-white/80">{item.label}</p>
                  <p className="text-xs text-white/40">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
            <div>
              <p className="text-sm text-white/70">{pool.length} candidates from L1</p>
              <p className="text-xs text-white/40 mt-0.5">
                {withResume} have a resume link · {pool.length - withResume} will be scored on answers alone
              </p>
            </div>
            <p className="text-2xl font-bold text-brand-400">{pool.length}</p>
          </div>

          {pool.length === 0 && (
            <div className="mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center gap-2">
              <AlertTriangle size={14} className="text-amber-400 shrink-0" />
              <p className="text-xs text-amber-400">
                No candidates were shortlisted at L1. Go back and lower the percentile cutoff.
              </p>
            </div>
          )}
        </div>
      )}

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
              className="h-full bg-gradient-to-r from-brand-500 to-emerald-400 rounded-full"
              animate={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex justify-between mt-2 text-xs text-white/30">
            <span>{resumesFound} resumes parsed</span>
            <span>{progress}%</span>
          </div>
        </motion.div>
      )}

      {complete && !screening && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle2 size={18} className="text-emerald-400" />
            <h3 className="font-medium text-white">L2 Screening Complete</h3>
          </div>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {ranked.map((c, i) => (
              <div key={c.id} className="flex items-center justify-between p-3 rounded-lg bg-white/[0.02]">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xs text-white/20 w-6 shrink-0">#{i + 1}</span>
                  <div className="min-w-0">
                    <p className="text-sm text-white truncate">{c.name}</p>
                    <p className="text-[11px] text-white/30">
                      L1 {c.l1Score ?? '—'} → L2 {c.l2Score ?? '—'}
                      {c.resumeUrl ? '' : ' · no resume'}
                    </p>
                  </div>
                </div>
                <span className={`text-sm font-bold shrink-0 ${
                  (c.l2Score || 0) >= 75 ? 'text-emerald-400' : (c.l2Score || 0) >= 50 ? 'text-amber-400' : 'text-rose-400/80'
                }`}>
                  {c.l2Score}
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      <div className="flex justify-end gap-3">
        {!complete && (
          <button
            onClick={startScreening}
            disabled={screening || pool.length === 0 || !settings.isConfigured()}
            className="btn-primary flex items-center gap-2 disabled:opacity-30"
          >
            {screening ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
            {screening ? 'Analysing…' : `Analyse ${pool.length} Candidates`}
          </button>
        )}
        {complete && (
          <>
            <button
              onClick={startScreening}
              disabled={screening}
              className="px-4 py-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-sm text-white/70 transition-all flex items-center gap-2"
            >
              <RotateCcw size={14} /> Re-run L2
            </button>
            <button onClick={onNext} className="btn-primary">Configure Final Shortlist</button>
          </>
        )}
      </div>
    </div>
  )
}
