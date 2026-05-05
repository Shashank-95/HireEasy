import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Download, Star, User, ArrowLeft, Trophy, Mail, RefreshCw, FileText, Loader2, Brain, ChevronDown, ChevronUp } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useJobStore } from '../../stores/jobStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { exportToExcel } from '../../lib/export'
import { sendEmail } from '../../lib/google'
import { scoreInterview, InterviewScoreResult } from '../../lib/llm'

export default function InterviewResults() {
  const { jobId } = useParams()
  const navigate = useNavigate()
  const { getJob, updateCandidate } = useJobStore()
  const settings = useSettingsStore()
  const job = getJob(jobId!)

  const [selectedCandidate, setSelectedCandidate] = useState<string | null>(null)
  const [sendingOffer, setSendingOffer] = useState(false)
  const [offerSent, setOfferSent] = useState(false)
  const [fetchingResults, setFetchingResults] = useState(false)
  const [scoringCandidate, setScoringCandidate] = useState<string | null>(null)
  const [aiScores, setAiScores] = useState<Record<string, InterviewScoreResult>>({})
  const [fetchError, setFetchError] = useState('')

  // Load persisted ratings from candidates
  const [ratings, setRatings] = useState<Record<string, Record<string, number>>>(() => {
    if (!job) return {}
    const loaded: Record<string, Record<string, number>> = {}
    for (const c of job.candidates) {
      if (c.manualRatings) loaded[c.id] = c.manualRatings
    }
    return loaded
  })

  if (!job) {
    return (
      <div className="p-8 text-center">
        <p className="text-white/40">Job not found</p>
        <button onClick={() => navigate('/')} className="btn-secondary mt-4">Back to Dashboard</button>
      </div>
    )
  }

  const interviewedCandidates = job.candidates
    .filter(c => ['interview_scheduled', 'interviewed', 'hired'].includes(c.status))
    .sort((a, b) => (b.interviewScore || b.finalScore || b.l2Score || 0) - (a.interviewScore || a.finalScore || a.l2Score || 0))

  const interviewAppUrl = settings.interviewAppUrl

  const handleExport = () => {
    exportToExcel(interviewedCandidates, `${job.title.replace(/\s+/g, '_')}_Interview_Results`)
  }

  const handleSelectForHire = async (candidateId: string) => {
    const candidate = job.candidates.find(c => c.id === candidateId)
    if (!candidate?.email) return

    setSendingOffer(true)
    try {
      await sendEmail(
        candidate.email,
        `Congratulations! Offer for ${job.title}`,
        `<p>Dear ${candidate.name},</p>
        <p>We are delighted to inform you that you have been selected for the <strong>${job.title}</strong> position.</p>
        <p>We were impressed by your qualifications and believe you will be a great addition to our team.</p>
        <p>Our HR team will reach out shortly with the detailed offer letter and next steps.</p>
        <p>Congratulations and welcome aboard!</p>
        <p>Best regards,<br>HR Team</p>`,
      )
      updateCandidate(job.id, candidateId, { status: 'hired' })
      useJobStore.getState().updateJob(job.id, { hiredCount: (job.hiredCount || 0) + 1 })
      setOfferSent(true)
    } catch (err) {
      console.error(err)
    } finally {
      setSendingOffer(false)
    }
  }

  const setRating = (candidateId: string, criteria: string, value: number) => {
    const updated = {
      ...ratings,
      [candidateId]: { ...(ratings[candidateId] || {}), [criteria]: value },
    }
    setRatings(updated)
    // Persist to store
    updateCandidate(job.id, candidateId, {
      manualRatings: updated[candidateId],
    } as any)
  }

  // Fetch interview results from the interview app
  const handleFetchResults = async () => {
    if (!interviewAppUrl) {
      setFetchError('Interview App URL not configured in Settings')
      return
    }

    setFetchingResults(true)
    setFetchError('')
    let fetched = 0

    for (const candidate of interviewedCandidates) {
      if (!candidate.interviewToken) continue
      if (candidate.interviewTranscripts && candidate.interviewTranscripts.length > 0) continue

      try {
        const res = await fetch(`${interviewAppUrl}/api/results?token=${candidate.interviewToken}`)
        if (res.ok) {
          const data = await res.json()
          if (data.responses && data.responses.length > 0) {
            updateCandidate(job.id, candidate.id, {
              interviewTranscripts: data.responses,
              status: 'interviewed',
            })
            fetched++
          }
        }
      } catch {
        // Non-fatal — candidate hasn't completed interview yet
      }
    }

    if (fetched === 0) {
      setFetchError('No new interview results found. Candidates may not have completed their interviews yet.')
    }
    setFetchingResults(false)
  }

  // Score a candidate's interview with LLM
  const handleScoreCandidate = async (candidateId: string) => {
    const candidate = job.candidates.find(c => c.id === candidateId)
    if (!candidate?.interviewTranscripts?.length) return

    setScoringCandidate(candidateId)
    try {
      const allSkills = [
        ...job.technicalSkills,
        ...job.nonTechSkills,
        ...job.behavioralSkills,
      ]

      const result = await scoreInterview(
        candidate.interviewTranscripts,
        job.title,
        job.description || '',
        allSkills,
      )

      setAiScores(prev => ({ ...prev, [candidateId]: result }))
      updateCandidate(job.id, candidateId, {
        interviewScore: result.overallScore,
        interviewFeedback: result.feedback,
        finalScore: result.overallScore,
      })
    } catch (err) {
      console.error('Scoring failed:', err)
    }
    setScoringCandidate(null)
  }

  // Score all candidates that have transcripts
  const handleScoreAll = async () => {
    const toScore = interviewedCandidates.filter(
      c => c.interviewTranscripts?.length && !aiScores[c.id] && !c.interviewScore
    )
    for (const candidate of toScore) {
      await handleScoreCandidate(candidate.id)
    }
  }

  const feedbackCriteria = ['Communication', 'Technical Depth', 'Problem Solving', 'Cultural Fit', 'Overall']
  const hasAnyTranscripts = interviewedCandidates.some(c => c.interviewTranscripts?.length)
  const hasUnscoredTranscripts = interviewedCandidates.some(
    c => c.interviewTranscripts?.length && !c.interviewScore && !aiScores[c.id]
  )

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center gap-4 mb-8">
        <button onClick={() => navigate(`/job/${jobId}`)} className="p-2 rounded-lg hover:bg-white/[0.06] transition-colors">
          <ArrowLeft size={18} className="text-white/50" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">Interview Results</h1>
          <p className="text-sm text-white/40 mt-1">{job.title} — {interviewedCandidates.length} candidates</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleFetchResults}
            disabled={fetchingResults}
            className="btn-secondary flex items-center gap-2"
          >
            {fetchingResults ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            Fetch Results
          </button>
          {hasUnscoredTranscripts && settings.isConfigured() && (
            <button
              onClick={handleScoreAll}
              disabled={!!scoringCandidate}
              className="btn-primary flex items-center gap-2"
            >
              <Brain size={16} /> Score All
            </button>
          )}
          <button onClick={handleExport} className="btn-secondary flex items-center gap-2">
            <Download size={16} /> Export
          </button>
        </div>
      </div>

      {fetchError && (
        <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/10 mb-4 text-xs text-amber-400">
          {fetchError}
        </div>
      )}

      {/* Results Table */}
      <div className="glass-card overflow-hidden mb-6">
        <div className="grid grid-cols-[1fr_60px_60px_70px_100px_100px] gap-4 px-6 py-3 border-b border-white/[0.06] text-xs font-medium text-white/40">
          <span>Candidate</span>
          <span className="text-center">L1</span>
          <span className="text-center">L2</span>
          <span className="text-center">Interview</span>
          <span className="text-center">Status</span>
          <span className="text-center">Action</span>
        </div>

        {interviewedCandidates.map((candidate) => {
          const score = aiScores[candidate.id] || null
          const interviewScoreVal = candidate.interviewScore || score?.overallScore
          const hasTranscripts = candidate.interviewTranscripts && candidate.interviewTranscripts.length > 0
          const isExpanded = selectedCandidate === candidate.id

          return (
            <div key={candidate.id}>
              <div
                className={`grid grid-cols-[1fr_60px_60px_70px_100px_100px] gap-4 px-6 py-4 border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors items-center cursor-pointer ${
                  isExpanded ? 'bg-white/[0.03]' : ''
                }`}
                onClick={() => setSelectedCandidate(isExpanded ? null : candidate.id)}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center">
                    {candidate.status === 'hired' ? (
                      <Trophy size={14} className="text-amber-400" />
                    ) : hasTranscripts ? (
                      <FileText size={14} className="text-brand-400" />
                    ) : (
                      <User size={14} className="text-white/40" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{candidate.name}</p>
                    <p className="text-xs text-white/30">{candidate.email || 'No email'}</p>
                  </div>
                  {isExpanded ? <ChevronUp size={14} className="text-white/20" /> : <ChevronDown size={14} className="text-white/20" />}
                </div>
                <div className="text-center">
                  <span className={`text-sm font-bold ${(candidate.l1Score || 0) >= 70 ? 'text-emerald-400' : 'text-white/40'}`}>
                    {candidate.l1Score || '—'}
                  </span>
                </div>
                <div className="text-center">
                  <span className={`text-sm font-bold ${(candidate.l2Score || 0) >= 70 ? 'text-emerald-400' : 'text-white/40'}`}>
                    {candidate.l2Score || '—'}
                  </span>
                </div>
                <div className="text-center">
                  {scoringCandidate === candidate.id ? (
                    <Loader2 size={14} className="text-brand-400 animate-spin mx-auto" />
                  ) : (
                    <span className={`text-sm font-bold ${(interviewScoreVal || 0) >= 70 ? 'text-brand-400' : interviewScoreVal ? 'text-white/60' : 'text-white/20'}`}>
                      {interviewScoreVal || '—'}
                    </span>
                  )}
                </div>
                <div className="text-center">
                  <span className={`status-badge ${
                    candidate.status === 'hired' ? 'bg-amber-500/10 text-amber-400' :
                    candidate.status === 'interviewed' ? 'bg-emerald-500/10 text-emerald-400' :
                    'bg-white/[0.06] text-white/40'
                  }`}>
                    {candidate.status.replace('_', ' ')}
                  </span>
                </div>
                <div className="flex justify-center">
                  {candidate.status !== 'hired' && candidate.email && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleSelectForHire(candidate.id) }}
                      disabled={sendingOffer}
                      className="px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 text-xs font-medium hover:bg-emerald-500/20 transition-colors"
                    >
                      Select
                    </button>
                  )}
                  {candidate.status === 'hired' && (
                    <span className="text-xs text-amber-400">Hired</span>
                  )}
                </div>
              </div>

              {/* Expandable Section */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden border-b border-white/[0.04]"
                  >
                    <div className="px-6 py-5 bg-white/[0.01] space-y-5">

                      {/* AI Score Summary */}
                      {(score || candidate.interviewScore) && (
                        <div className="p-4 rounded-xl bg-brand-500/5 border border-brand-500/10">
                          <div className="flex items-center gap-2 mb-3">
                            <Brain size={14} className="text-brand-400" />
                            <p className="text-xs font-medium text-brand-400">AI Interview Analysis</p>
                          </div>
                          {score && (
                            <>
                              <div className="grid grid-cols-4 gap-3 mb-3">
                                {[
                                  ['Communication', score.communication],
                                  ['Technical', score.technicalDepth],
                                  ['Problem Solving', score.problemSolving],
                                  ['Relevance', score.relevance],
                                ].map(([label, val]) => (
                                  <div key={label as string} className="text-center p-2 rounded-lg bg-white/[0.03]">
                                    <p className="text-xs text-white/40 mb-1">{label}</p>
                                    <p className={`text-lg font-bold ${(val as number) >= 70 ? 'text-brand-400' : 'text-white/50'}`}>{val}</p>
                                  </div>
                                ))}
                              </div>
                              <p className="text-sm text-white/60 mb-2">{score.feedback}</p>
                              {score.strengths.length > 0 && (
                                <div className="mb-2">
                                  <p className="text-xs text-emerald-400 mb-1">Strengths</p>
                                  {score.strengths.map((s, i) => (
                                    <p key={i} className="text-xs text-white/40 ml-2">• {s}</p>
                                  ))}
                                </div>
                              )}
                              {score.improvements.length > 0 && (
                                <div>
                                  <p className="text-xs text-amber-400 mb-1">Areas for Improvement</p>
                                  {score.improvements.map((s, i) => (
                                    <p key={i} className="text-xs text-white/40 ml-2">• {s}</p>
                                  ))}
                                </div>
                              )}
                            </>
                          )}
                          {!score && candidate.interviewFeedback && (
                            <p className="text-sm text-white/60">{candidate.interviewFeedback}</p>
                          )}
                        </div>
                      )}

                      {/* Interview Transcripts */}
                      {hasTranscripts && (
                        <div>
                          <div className="flex items-center justify-between mb-3">
                            <p className="text-xs text-white/40">Interview Transcripts</p>
                            {!score && !candidate.interviewScore && settings.isConfigured() && (
                              <button
                                onClick={() => handleScoreCandidate(candidate.id)}
                                disabled={scoringCandidate === candidate.id}
                                className="text-xs px-3 py-1.5 rounded-lg bg-brand-500/10 text-brand-400 hover:bg-brand-500/20 transition-colors flex items-center gap-1.5"
                              >
                                {scoringCandidate === candidate.id ? (
                                  <><Loader2 size={12} className="animate-spin" /> Scoring...</>
                                ) : (
                                  <><Brain size={12} /> Score with AI</>
                                )}
                              </button>
                            )}
                          </div>
                          <div className="space-y-3">
                            {candidate.interviewTranscripts!.map((t, i) => (
                              <div key={i} className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                                <p className="text-xs font-medium text-white/50 mb-1.5">Q{i + 1}: {t.question}</p>
                                <p className="text-sm text-white/70 leading-relaxed">{t.transcript}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {!hasTranscripts && candidate.interviewToken && (
                        <div className="text-center py-4">
                          <p className="text-xs text-white/30">Interview not yet completed</p>
                          <p className="text-xs text-white/20 mt-1">Token: {candidate.interviewToken}</p>
                        </div>
                      )}

                      {/* Manual Star Ratings */}
                      <div>
                        <p className="text-xs text-white/40 mb-3">Manual Feedback</p>
                        <div className="grid grid-cols-5 gap-4">
                          {feedbackCriteria.map(criteria => (
                            <div key={criteria} className="text-center">
                              <p className="text-xs text-white/50 mb-2">{criteria}</p>
                              <div className="flex justify-center gap-0.5">
                                {[1, 2, 3, 4, 5].map(star => (
                                  <button
                                    key={star}
                                    onClick={() => setRating(candidate.id, criteria, star)}
                                    className="transition-colors"
                                  >
                                    <Star
                                      size={16}
                                      className={star <= (ratings[candidate.id]?.[criteria] || 0)
                                        ? 'text-amber-400 fill-amber-400'
                                        : 'text-white/10 hover:text-amber-400/50'
                                      }
                                    />
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )
        })}

        {interviewedCandidates.length === 0 && (
          <div className="p-8 text-center">
            <p className="text-white/30">No interview results yet</p>
          </div>
        )}
      </div>

      {offerSent && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-5 flex items-center gap-3"
        >
          <Mail size={18} className="text-emerald-400" />
          <p className="text-sm text-emerald-400">Selection email sent successfully to the candidate!</p>
        </motion.div>
      )}
    </div>
  )
}
