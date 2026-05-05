import { useState } from 'react'
import { Loader2, Brain, Shield, CheckCircle2, AlertTriangle } from 'lucide-react'
import { motion } from 'framer-motion'
import { Job, useJobStore } from '../../../stores/jobStore'
import { useSettingsStore } from '../../../stores/settingsStore'
import { screenCandidate } from '../../../lib/llm'
import { detectAiContent, heuristicAiDetection } from '../../../lib/aiDetection'

interface Props {
  job: Job
  onNext: () => void
}

export default function StepL1Screening({ job, onNext }: Props) {
  const [screening, setScreening] = useState(false)
  const [progress, setProgress] = useState(0)
  const [phase, setPhase] = useState('')
  const [currentCandidate, setCurrentCandidate] = useState('')
  const [complete, setComplete] = useState(false)
  const [stats, setStats] = useState({ total: 0, passed: 0, aiDetected: 0, failed: 0 })
  const settings = useSettingsStore()
  const { updateJob, updateCandidate } = useJobStore()

  const startScreening = async () => {
    if (!settings.isConfigured()) return

    setScreening(true)
    setProgress(0)

    const candidates = job.candidates
    const total = candidates.length
    let aiDetectedCount = 0
    let passedCount = 0

    // Build JD context — use description, or fallback to job title + skills
    const jdText = job.description && job.description.trim().length > 50
      ? job.description
      : `Job Title: ${job.title}\n${job.department ? `Department: ${job.department}\n` : ''}Required Technical Skills: ${job.technicalSkills.map(s => s.name).join(', ')}\nRequired Non-Technical Skills: ${job.nonTechSkills.map(s => s.name).join(', ')}${job.behavioralSkills.length > 0 ? `\nBehavioral Skills: ${job.behavioralSkills.map(s => s.name).join(', ')}` : ''}`

    // Phase 1: AI Detection (non-blocking — flags but doesn't auto-reject)
    setPhase('Detecting AI-generated responses...')
    const allResponses = candidates.map(c => Object.values(c.responses).join(' '))
    const heuristics = heuristicAiDetection(allResponses)

    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i]
      setCurrentCandidate(candidate.name)
      setProgress(Math.round(((i + 1) / total) * 30))

      const responseText = Object.values(candidate.responses).join(' ')
      if (responseText.trim().length < 20) {
        updateCandidate(job.id, candidate.id, { aiDetectionScore: 0 })
        continue
      }

      try {
        const aiResult = await detectAiContent(responseText)
        const isHeuristicSuspect = heuristics.suspiciousIndices.includes(i)
        const finalAiScore = isHeuristicSuspect
          ? Math.min(100, aiResult.score + 15)
          : aiResult.score

        // Flag the AI score but do NOT reject here — let LLM scoring decide
        updateCandidate(job.id, candidate.id, { aiDetectionScore: finalAiScore })
        if (finalAiScore > 70) aiDetectedCount++
      } catch {
        // AI detection failed — don't penalize the candidate
        updateCandidate(job.id, candidate.id, { aiDetectionScore: 0 })
      }
    }

    // Phase 2: LLM-based response scoring — runs for ALL candidates
    setPhase('Scoring candidate responses against job requirements...')

    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i]
      setCurrentCandidate(candidate.name)
      setProgress(30 + Math.round(((i + 1) / total) * 65))

      const responseText = Object.entries(candidate.responses)
        .filter(([_, v]) => v.trim().length > 0)
        .map(([key, v]) => `${key}: ${v}`)
        .join('\n\n')

      // If candidate has no meaningful response text, give a low score but don't crash
      if (responseText.trim().length < 10) {
        updateCandidate(job.id, candidate.id, { l1Score: 0, status: 'rejected' })
        continue
      }

      try {
        const result = await screenCandidate(
          responseText,
          jdText,
          job.technicalSkills.map(s => ({ name: s.name, weight: s.weight })),
          job.nonTechSkills.map(s => ({ name: s.name, weight: s.weight })),
          job.behavioralSkills.map(s => ({ name: s.name, weight: s.weight })),
        )

        // Get the latest AI score for this candidate
        const latestJob = useJobStore.getState().getJob(job.id)
        const latestCandidate = latestJob?.candidates.find(c => c.id === candidate.id)
        const aiScore = latestCandidate?.aiDetectionScore || 0

        // Apply a penalty for high AI detection (reduce score, don't auto-reject)
        const aiPenalty = aiScore > 70 ? 0.6 : aiScore > 50 ? 0.85 : 1
        const adjustedScore = Math.round(result.score * aiPenalty)

        const isShortlisted = adjustedScore >= 40
        updateCandidate(job.id, candidate.id, {
          l1Score: adjustedScore,
          status: isShortlisted ? 'l1_shortlisted' : 'rejected',
        })

        if (isShortlisted) passedCount++
      } catch (err) {
        console.error(`L1 scoring failed for ${candidate.name}:`, err)
        // On LLM error, give benefit of doubt — pass with a neutral score
        updateCandidate(job.id, candidate.id, { l1Score: 50, status: 'l1_shortlisted' })
        passedCount++
      }
    }

    setProgress(100)
    setPhase('Screening complete')

    setStats({
      total,
      passed: passedCount,
      aiDetected: aiDetectedCount,
      failed: total - passedCount - aiDetectedCount,
    })
    setComplete(true)
    setScreening(false)
    updateJob(job.id, {
      shortlistedCount: passedCount,
      candidateCount: total,
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white mb-2">Level 1 Screening</h2>
        <p className="text-sm text-white/40">
          AI will analyze all candidate responses for authenticity and alignment with the job description and required skills.
        </p>
      </div>

      {/* What will happen */}
      <div className="glass-card p-6">
        <h3 className="font-medium text-white mb-4">Screening Process</h3>
        <div className="space-y-3">
          {[
            { icon: Shield, color: 'text-amber-400', bg: 'bg-amber-500/10', label: 'AI Detection', desc: `Using ${settings.aiDetectionProvider === 'sapling' ? 'Sapling AI (free)' : settings.aiDetectionProvider} + heuristic analysis to detect AI-generated responses` },
            { icon: Brain, color: 'text-brand-400', bg: 'bg-brand-500/10', label: 'Response Analysis', desc: `Using ${settings.preferredLlm === 'openai' ? 'OpenAI GPT-4o-mini' : settings.preferredLlm === 'anthropic' ? 'Claude' : 'Gemini'} to evaluate answers against JD and skills` },
            { icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/10', label: 'Weighted Scoring', desc: `Scoring ${job.candidates.length} candidates using your configured skill weights` },
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.02]">
              <div className={`w-8 h-8 rounded-lg ${item.bg} flex items-center justify-center shrink-0`}>
                <item.icon size={14} className={item.color} />
              </div>
              <div>
                <p className="text-sm font-medium text-white/80">{item.label}</p>
                <p className="text-xs text-white/40">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Progress */}
      {(screening || complete) && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-6"
        >
          {screening ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Loader2 size={18} className="text-brand-400 animate-spin" />
                <div>
                  <p className="text-sm text-white/70">{phase}</p>
                  {currentCandidate && <p className="text-xs text-white/30">Processing: {currentCandidate}</p>}
                </div>
              </div>
              <div className="w-full h-2 rounded-full bg-white/[0.06] overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-brand-500 to-brand-400 rounded-full"
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
              <p className="text-xs text-white/30 text-right">{progress}% complete</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={18} className="text-emerald-400" />
                <h3 className="font-medium text-white">Screening Complete</h3>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="p-4 rounded-xl bg-white/[0.03] text-center">
                  <p className="text-2xl font-bold text-white">{stats.total}</p>
                  <p className="text-xs text-white/40 mt-1">Total Candidates</p>
                </div>
                <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/10 text-center">
                  <p className="text-2xl font-bold text-emerald-400">{stats.passed}</p>
                  <p className="text-xs text-white/40 mt-1">L1 Shortlisted</p>
                </div>
                <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/10 text-center">
                  <p className="text-2xl font-bold text-amber-400">{stats.aiDetected}</p>
                  <p className="text-xs text-white/40 mt-1">AI Detected</p>
                </div>
              </div>

              {stats.aiDetected > 0 && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/5 border border-amber-500/10">
                  <AlertTriangle size={14} className="text-amber-400 mt-0.5" />
                  <p className="text-xs text-amber-400/80">
                    {stats.aiDetected} candidates showed clear signs of AI-generated responses and have been flagged.
                  </p>
                </div>
              )}
            </div>
          )}
        </motion.div>
      )}

      <div className="flex justify-end gap-3">
        {!complete && (
          <button
            onClick={startScreening}
            disabled={screening || !settings.isConfigured() || job.candidates.length === 0}
            className="btn-primary flex items-center gap-2 disabled:opacity-30"
          >
            {screening ? <Loader2 size={16} className="animate-spin" /> : <Brain size={16} />}
            {screening ? 'Screening...' : `Screen ${job.candidates.length} Candidates`}
          </button>
        )}
        {complete && (
          <button onClick={onNext} className="btn-primary">
            View Results & Configure L2
          </button>
        )}
      </div>
    </div>
  )
}
