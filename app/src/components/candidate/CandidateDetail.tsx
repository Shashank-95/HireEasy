import { motion, AnimatePresence } from 'framer-motion'
import { X, Shield, Brain, AlertTriangle, CheckCircle2, ThumbsUp, ThumbsDown, RotateCcw, Mail, Phone, MapPin, FileText, Briefcase, Clock, Wallet } from 'lucide-react'
import { Candidate, Job, useJobStore } from '../../stores/jobStore'
import { FILTER_LABELS } from '../../lib/screeningFilters'
import { formatCtc, formatExperience, formatNotice } from '../../lib/candidateParsing'

interface Props {
  candidate: Candidate | null
  job: Job
  onClose: () => void
}

const TIER_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  STRONG_YES: { bg: 'bg-emerald-500/15 border-emerald-500/25', text: 'text-emerald-400', label: 'Strong Yes' },
  YES: { bg: 'bg-brand-500/15 border-brand-500/25', text: 'text-brand-300', label: 'Yes' },
  MAYBE: { bg: 'bg-amber-500/15 border-amber-500/25', text: 'text-amber-400', label: 'Maybe' },
  NO: { bg: 'bg-rose-500/15 border-rose-500/25', text: 'text-rose-400', label: 'No' },
}

export default function CandidateDetail({ candidate, job, onClose }: Props) {
  const { updateCandidate } = useJobStore()

  const setDecision = (decision: 'promoted' | 'rejected' | undefined) => {
    if (!candidate) return
    updateCandidate(job.id, candidate.id, {
      manualDecision: decision,
      status: decision === 'promoted' ? 'l1_shortlisted'
        : decision === 'rejected' ? 'rejected'
        : candidate.status,
    })
  }

  const detail = candidate?.screeningDetail
  const tier = detail?.tier ? TIER_STYLE[detail.tier] : null
  const allSkills = candidate ? [...job.technicalSkills, ...job.nonTechSkills, ...job.behavioralSkills] : []

  return (
    <AnimatePresence>
      {candidate && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-xl bg-[#0f0f13] border-l border-white/[0.08] z-50 overflow-y-auto"
          >
            {/* Header */}
            <div className="sticky top-0 bg-[#0f0f13]/95 backdrop-blur-sm border-b border-white/[0.06] px-6 py-5 z-10">
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h2 className="text-lg font-bold text-white truncate">{candidate.name}</h2>
                    {tier && (
                      <span className={`px-2 py-0.5 rounded-md text-[11px] font-medium border ${tier.bg} ${tier.text}`}>
                        {tier.label}
                      </span>
                    )}
                    {candidate.manualDecision && (
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-violet-500/15 border border-violet-500/25 text-violet-300">
                        Manual {candidate.manualDecision}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-xs text-white/40 flex-wrap">
                    {candidate.email && (
                      <span className="flex items-center gap-1"><Mail size={11} />{candidate.email}</span>
                    )}
                    {candidate.phone && (
                      <span className="flex items-center gap-1"><Phone size={11} />{candidate.phone}</span>
                    )}
                  </div>
                </div>
                <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/[0.06] transition-colors shrink-0">
                  <X size={16} className="text-white/50" />
                </button>
              </div>

              {/* Score strip */}
              <div className="flex items-center gap-4 mt-4">
                <ScorePill label="L1 Score" value={candidate.l1Score ?? '—'} accent="brand" />
                <ScorePill
                  label="Percentile"
                  value={candidate.l1Percentile !== undefined ? `${candidate.l1Percentile.toFixed(1)}` : '—'}
                  accent="emerald"
                />
                <ScorePill
                  label="AI Detection"
                  value={candidate.aiDetectionScore !== undefined ? `${candidate.aiDetectionScore}%` : '—'}
                  accent={(candidate.aiDetectionScore || 0) > 70 ? 'rose' : 'muted'}
                />
                {candidate.l2Score !== undefined && (
                  <ScorePill label="L2 Score" value={candidate.l2Score} accent="brand" />
                )}
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Structured attributes */}
              <div className="grid grid-cols-2 gap-3">
                <Attribute icon={Wallet} label="Expected CTC" value={formatCtc(candidate.ctcExpected)} raw={candidate.ctcRaw} />
                <Attribute icon={Briefcase} label="Experience" value={formatExperience(candidate.experienceYears)} raw={candidate.experienceRaw} />
                <Attribute icon={Clock} label="Notice Period" value={formatNotice(candidate.noticePeriodDays)} raw={candidate.noticePeriodRaw} />
                <Attribute icon={MapPin} label="Location" value={candidate.location || '—'} />
              </div>

              {candidate.resumeUrl && (
                <a
                  href={candidate.resumeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] text-sm text-white/70 transition-colors"
                >
                  <FileText size={14} className="text-brand-400" /> Open resume
                </a>
              )}

              {/* Hard filter failures */}
              {candidate.filterFailures && candidate.filterFailures.length > 0 && (
                <Section title="Filtered out" icon={AlertTriangle} tone="rose">
                  <div className="flex flex-wrap gap-1.5">
                    {candidate.filterFailures.map(f => (
                      <span key={f} className="px-2 py-1 rounded-md text-[11px] bg-rose-500/10 border border-rose-500/20 text-rose-300">
                        {FILTER_LABELS[f] || f}
                      </span>
                    ))}
                  </div>
                </Section>
              )}

              {/* API error */}
              {detail?.error && (
                <Section title="Scoring failed" icon={AlertTriangle} tone="amber">
                  <p className="text-xs text-amber-300/80 font-mono bg-amber-500/5 p-3 rounded-lg">{detail.error}</p>
                </Section>
              )}

              {/* AI verdict */}
              {detail && !detail.error && (
                <>
                  {detail.summary && (
                    <Section title="Assessment" icon={Brain} tone="brand">
                      <p className="text-sm text-white/70 leading-relaxed">{detail.summary}</p>
                      {detail.aiPenalty < 1 && (
                        <p className="text-xs text-amber-400/70 mt-2">
                          Score reduced from {detail.rawScore} to {candidate.l1Score} due to AI-generated content signals
                          (×{detail.aiPenalty}).
                        </p>
                      )}
                    </Section>
                  )}

                  {/* Skill breakdown */}
                  {Object.keys(detail.skillScores).length > 0 && (
                    <Section title="Skill evidence" icon={CheckCircle2} tone="brand">
                      <div className="space-y-2.5">
                        {allSkills.map(skill => {
                          const score = detail.skillScores[skill.name]
                          if (score === undefined) return null
                          return (
                            <div key={skill.id}>
                              <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-white/70">{skill.name}</span>
                                  <span className="text-[10px] text-white/25">{skill.weight}% weight</span>
                                </div>
                                <span className={`text-xs font-bold ${
                                  score >= 75 ? 'text-emerald-400' : score >= 50 ? 'text-amber-400' : 'text-rose-400/80'
                                }`}>
                                  {score}
                                </span>
                              </div>
                              <div className="w-full h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    score >= 75 ? 'bg-emerald-500/70' : score >= 50 ? 'bg-amber-500/70' : 'bg-rose-500/50'
                                  }`}
                                  style={{ width: `${score}%` }}
                                />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </Section>
                  )}

                  {/* Quality signals */}
                  <Section title="Answer quality" icon={Shield} tone="muted">
                    <div className="grid grid-cols-5 gap-2">
                      {Object.entries(detail.qualitySignals).map(([key, val]) => (
                        <div key={key} className="text-center">
                          <div className="w-full h-14 rounded-lg bg-white/[0.03] flex items-end overflow-hidden">
                            <div
                              className="w-full bg-brand-500/40 transition-all"
                              style={{ height: `${val}%` }}
                            />
                          </div>
                          <p className="text-[10px] text-white/50 mt-1.5">{val}</p>
                          <p className="text-[9px] text-white/25 capitalize leading-tight">
                            {key === 'quantification' ? 'numbers' : key}
                          </p>
                        </div>
                      ))}
                    </div>
                  </Section>

                  {detail.topStrengths.length > 0 && (
                    <Section title="Strengths" icon={ThumbsUp} tone="emerald">
                      <ul className="space-y-1.5">
                        {detail.topStrengths.map((s, i) => (
                          <li key={i} className="text-sm text-white/60 flex items-start gap-2">
                            <span className="text-emerald-400 mt-1">•</span>{s}
                          </li>
                        ))}
                      </ul>
                    </Section>
                  )}

                  {detail.concerns.length > 0 && (
                    <Section title="Concerns" icon={AlertTriangle} tone="amber">
                      <ul className="space-y-1.5">
                        {detail.concerns.map((s, i) => (
                          <li key={i} className="text-sm text-white/60 flex items-start gap-2">
                            <span className="text-amber-400 mt-1">•</span>{s}
                          </li>
                        ))}
                      </ul>
                    </Section>
                  )}

                  {detail.redFlags.length > 0 && (
                    <Section title="Red flags" icon={AlertTriangle} tone="rose">
                      <div className="flex flex-wrap gap-1.5">
                        {detail.redFlags.map(f => (
                          <span key={f} className="px-2 py-1 rounded-md text-[11px] bg-rose-500/10 border border-rose-500/20 text-rose-300">
                            {f.replace(/_/g, ' ')}
                          </span>
                        ))}
                      </div>
                    </Section>
                  )}
                </>
              )}

              {/* Raw answers */}
              <Section title="Screening answers" icon={FileText} tone="muted">
                <div className="space-y-3">
                  {Object.entries(candidate.responses)
                    .filter(([, a]) => a.trim())
                    .map(([q, a], i) => (
                      <div key={i} className="rounded-lg bg-white/[0.02] p-3">
                        <p className="text-[11px] text-brand-300/70 mb-1.5">{q}</p>
                        <p className="text-xs text-white/60 leading-relaxed whitespace-pre-wrap">{a}</p>
                      </div>
                    ))}
                  {Object.values(candidate.responses).every(a => !a.trim()) && (
                    <p className="text-xs text-white/30">No answers submitted.</p>
                  )}
                </div>
              </Section>
            </div>

            {/* Sticky override bar */}
            <div className="sticky bottom-0 bg-[#0f0f13]/95 backdrop-blur-sm border-t border-white/[0.06] px-6 py-4">
              <p className="text-[11px] text-white/30 mb-2.5">Recruiter override — beats the algorithm</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setDecision(candidate.manualDecision === 'promoted' ? undefined : 'promoted')}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-all flex items-center justify-center gap-2 ${
                    candidate.manualDecision === 'promoted'
                      ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                      : 'bg-white/[0.03] border-white/[0.08] text-white/60 hover:bg-emerald-500/10 hover:border-emerald-500/25'
                  }`}
                >
                  <ThumbsUp size={14} /> Shortlist
                </button>
                <button
                  onClick={() => setDecision(candidate.manualDecision === 'rejected' ? undefined : 'rejected')}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-all flex items-center justify-center gap-2 ${
                    candidate.manualDecision === 'rejected'
                      ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                      : 'bg-white/[0.03] border-white/[0.08] text-white/60 hover:bg-rose-500/10 hover:border-rose-500/25'
                  }`}
                >
                  <ThumbsDown size={14} /> Reject
                </button>
                {candidate.manualDecision && (
                  <button
                    onClick={() => setDecision(undefined)}
                    className="px-3 rounded-lg bg-white/[0.03] border border-white/[0.08] text-white/50 hover:bg-white/[0.06] transition-all"
                    title="Clear override"
                  >
                    <RotateCcw size={14} />
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

function ScorePill({ label, value, accent }: { label: string; value: string | number; accent: string }) {
  const color = {
    brand: 'text-brand-400', emerald: 'text-emerald-400', rose: 'text-rose-400', muted: 'text-white/50',
  }[accent] || 'text-white'
  return (
    <div>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
      <p className="text-[10px] text-white/30">{label}</p>
    </div>
  )
}

function Attribute({ icon: Icon, label, value, raw }: { icon: any; label: string; value: string; raw?: string }) {
  return (
    <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.05]">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon size={11} className="text-white/30" />
        <p className="text-[10px] text-white/40">{label}</p>
      </div>
      <p className="text-sm text-white/80">{value}</p>
      {raw && raw !== value && (
        <p className="text-[10px] text-white/20 mt-0.5 truncate" title={raw}>from: "{raw}"</p>
      )}
    </div>
  )
}

function Section({ title, icon: Icon, tone, children }: {
  title: string; icon: any; tone: string; children: React.ReactNode
}) {
  const color = {
    brand: 'text-brand-400', emerald: 'text-emerald-400',
    amber: 'text-amber-400', rose: 'text-rose-400', muted: 'text-white/40',
  }[tone] || 'text-white/40'
  return (
    <div>
      <div className="flex items-center gap-2 mb-2.5">
        <Icon size={13} className={color} />
        <h3 className="text-xs font-medium text-white/60 uppercase tracking-wide">{title}</h3>
      </div>
      {children}
    </div>
  )
}
