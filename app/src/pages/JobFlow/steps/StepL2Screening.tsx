import { useState } from 'react'
import { Loader2, FileText, Target, Sparkles, CheckCircle2 } from 'lucide-react'
import { motion } from 'framer-motion'
import { Job, useJobStore } from '../../../stores/jobStore'
import { useSettingsStore } from '../../../stores/settingsStore'
import { analyzeResume } from '../../../lib/llm'
import { downloadResume } from '../../../lib/google'

interface Props {
  job: Job
  onNext: () => void
}

export default function StepL2Screening({ job, onNext }: Props) {
  const [screening, setScreening] = useState(false)
  const [progress, setProgress] = useState(0)
  const [phase, setPhase] = useState('')
  const [currentCandidate, setCurrentCandidate] = useState('')
  const [complete, setComplete] = useState(false)
  const [results, setResults] = useState<{ name: string; score: number; highlights: string[] }[]>([])
  const { updateCandidate } = useJobStore()
  const settings = useSettingsStore()

  const shortlistedCandidates = job.candidates.filter(c => c.status === 'l1_shortlisted')

  const startScreening = async () => {
    if (!settings.isConfigured()) return

    setScreening(true)
    setProgress(0)

    // Build JD context — use description, or fallback to title + skills
    const jdText = job.description && job.description.trim().length > 50
      ? job.description
      : `Job Title: ${job.title}\n${job.department ? `Department: ${job.department}\n` : ''}Required Technical Skills: ${job.technicalSkills.map(s => s.name).join(', ')}\nRequired Non-Technical Skills: ${job.nonTechSkills.map(s => s.name).join(', ')}${job.behavioralSkills.length > 0 ? `\nBehavioral Skills: ${job.behavioralSkills.map(s => s.name).join(', ')}` : ''}`

    const allSkills = [...job.technicalSkills, ...job.nonTechSkills, ...job.behavioralSkills]
    const candidateResults: { name: string; score: number; highlights: string[] }[] = []

    for (let i = 0; i < shortlistedCandidates.length; i++) {
      const candidate = shortlistedCandidates[i]
      setCurrentCandidate(candidate.name)
      setProgress(Math.round(((i + 1) / shortlistedCandidates.length) * 100))

      // Phase updates
      if (i === 0) setPhase('Analyzing candidate profiles against JD...')
      else if (i === Math.floor(shortlistedCandidates.length * 0.3)) setPhase('Mapping projects and impact against JD...')
      else if (i === Math.floor(shortlistedCandidates.length * 0.6)) setPhase('Evaluating skill proficiency signals...')
      else if (i === Math.floor(shortlistedCandidates.length * 0.8)) setPhase('Computing final L2 scores...')

      let resumeContent = ''

      // Try to download and extract text from resume PDF
      if (candidate.resumeUrl && candidate.resumeUrl.startsWith('http')) {
        try {
          const text = await downloadResume(candidate.resumeUrl)
          // downloadResume now returns extracted text for PDFs
          if (text && text.length > 50 && !text.startsWith('[PDF content from:')) {
            resumeContent = text.substring(0, 5000)
          }
        } catch (err) {
          console.warn(`Resume download failed for ${candidate.name}:`, err)
        }
      }

      // Build comprehensive candidate profile from all available data
      const responsesSummary = Object.entries(candidate.responses)
        .filter(([_, val]) => val.trim().length > 0)
        .map(([key, val]) => `${key}: ${val}`)
        .join('\n\n')

      const candidateProfile = [
        `Candidate: ${candidate.name}`,
        candidate.email ? `Email: ${candidate.email}` : '',
        candidate.l1Score ? `L1 Screening Score: ${candidate.l1Score}/100` : '',
        resumeContent ? `\nResume Content:\n${resumeContent}` : '',
        responsesSummary ? `\nScreening Responses:\n${responsesSummary}` : '',
      ].filter(Boolean).join('\n')

      // If we have very little content, give a baseline score instead of failing
      if (candidateProfile.trim().length < 50) {
        const baselineScore = candidate.l1Score ? Math.round(candidate.l1Score * 0.7) : 30
        updateCandidate(job.id, candidate.id, {
          l2Score: baselineScore,
          status: 'l2_shortlisted',
        })
        candidateResults.push({
          name: candidate.name,
          score: baselineScore,
          highlights: ['Limited data — scored based on L1 performance'],
        })
        continue
      }

      try {
        const result = await analyzeResume(
          candidateProfile,
          jdText,
          allSkills.map(s => ({ name: s.name, weight: s.weight })),
        )

        updateCandidate(job.id, candidate.id, {
          l2Score: result.overallScore,
          status: 'l2_shortlisted',
        })

        candidateResults.push({
          name: candidate.name,
          score: result.overallScore,
          highlights: result.highlights.slice(0, 2),
        })
      } catch (err) {
        console.error(`L2 analysis failed for ${candidate.name}:`, err)
        // On failure, use L1 score as fallback instead of 0
        const fallbackScore = candidate.l1Score ? Math.round(candidate.l1Score * 0.8) : 40
        updateCandidate(job.id, candidate.id, {
          l2Score: fallbackScore,
          status: 'l2_shortlisted',
        })
        candidateResults.push({
          name: candidate.name,
          score: fallbackScore,
          highlights: ['Scored using L1 data (resume analysis unavailable)'],
        })
      }
    }

    candidateResults.sort((a, b) => b.score - a.score)
    setResults(candidateResults)
    setComplete(true)
    setScreening(false)
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white mb-2">Level 2 Screening — Resume Deep Analysis</h2>
        <p className="text-sm text-white/40">
          AI will rigorously evaluate each shortlisted candidate's resume against the JD, scoring projects, impact, skills, and growth signals.
        </p>
      </div>

      <div className="glass-card p-6">
        <h3 className="font-medium text-white mb-4">L2 Evaluation Criteria</h3>
        <div className="grid grid-cols-2 gap-3">
          {[
            { icon: Target, label: 'Project Relevance', desc: 'How well do past projects align with role requirements' },
            { icon: Sparkles, label: 'Impact Demonstrated', desc: 'Quantifiable outcomes and results achieved' },
            { icon: FileText, label: 'Skill Proficiency', desc: 'Depth of skills mentioned vs. JD requirements' },
            { icon: Target, label: 'Curiosity & Growth', desc: 'Certifications, side projects, continuous learning signals' },
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.02]">
              <item.icon size={14} className="text-brand-400 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-white/80">{item.label}</p>
                <p className="text-xs text-white/40">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

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
                  <p className="text-xs text-white/30">Analyzing: {currentCandidate}</p>
                </div>
              </div>
              <div className="w-full h-2 rounded-full bg-white/[0.06] overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-brand-500 to-emerald-400 rounded-full"
                  animate={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-white/30 text-right">Analyzing {shortlistedCandidates.length} resumes · {progress}%</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <CheckCircle2 size={18} className="text-emerald-400" />
                <h3 className="font-medium text-white">L2 Screening Complete</h3>
              </div>

              <div className="space-y-2">
                {results.slice(0, 10).map((r, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-white/[0.02]">
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-white/30 w-5">#{i + 1}</span>
                      <span className="text-sm text-white">{r.name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {r.highlights[0] && (
                        <span className="text-xs text-white/30 max-w-[200px] truncate">{r.highlights[0]}</span>
                      )}
                      <span className={`text-sm font-bold ${
                        r.score >= 75 ? 'text-emerald-400' : r.score >= 50 ? 'text-amber-400' : 'text-red-400'
                      }`}>
                        {r.score}
                      </span>
                    </div>
                  </div>
                ))}
                {results.length > 10 && (
                  <p className="text-xs text-white/30 text-center pt-2">+{results.length - 10} more candidates</p>
                )}
              </div>
            </div>
          )}
        </motion.div>
      )}

      <div className="flex justify-end gap-3">
        {!complete && (
          <button
            onClick={startScreening}
            disabled={screening || shortlistedCandidates.length === 0}
            className="btn-primary flex items-center gap-2 disabled:opacity-30"
          >
            {screening ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
            {screening ? 'Analyzing...' : `Analyze ${shortlistedCandidates.length} Resumes`}
          </button>
        )}
        {complete && (
          <button onClick={onNext} className="btn-primary">Configure Final Shortlist</button>
        )}
      </div>
    </div>
  )
}
