import { useState, useEffect } from 'react'
import { Video, Mic, Mail, Clock, Calendar, Plus, X, Send, CheckCircle2, AlertCircle, Loader2, ExternalLink, Save, FolderOpen, AlertTriangle } from 'lucide-react'
import { motion } from 'framer-motion'
import { Job, useJobStore } from '../../../stores/jobStore'
import { useSettingsStore } from '../../../stores/settingsStore'
import { useQuestionBankStore, QuestionTemplate } from '../../../stores/questionBankStore'
import { sendEmail, createCalendarEvent, authenticateGoogle } from '../../../lib/google'
import { generateTimeSlots, detectConflicts, fetchCalendarEvents } from '../../../lib/scheduling'
import { v4 as uuidv4 } from 'uuid'

interface Props {
  job: Job
  onNext: () => void
}

export default function StepInterview({ job, onNext }: Props) {
  const [interviewType, setInterviewType] = useState<'human' | 'app'>('app')
  const [interviewerEmail, setInterviewerEmail] = useState('')
  const [meetingLength, setMeetingLength] = useState(30)
  const [startDate, setStartDate] = useState('')
  const [startTime, setStartTime] = useState('10:00')
  const [questions, setQuestions] = useState<string[]>([
    'Tell me about yourself and your background.',
    '', '', '', '',
  ])
  const [emailTemplate, setEmailTemplate] = useState(
    `Dear {{candidate_name}},

We are pleased to inform you that you have been shortlisted for the <strong>{{job_title}}</strong> role.

<strong>Interview Details:</strong>
{{interview_details}}

Please join using the link below:
<a href="{{meeting_link}}">{{meeting_link}}</a>

Please be on time and ensure a stable internet connection.

Best regards,
HR Team`
  )
  const [step, setStep] = useState<'type' | 'schedule' | 'questions' | 'email' | 'confirm'>('type')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [sendProgress, setSendProgress] = useState({ current: 0, total: 0, currentName: '' })
  const [sendErrors, setSendErrors] = useState<string[]>([])
  const [conflicts, setConflicts] = useState<{ slot: any; conflictsWith: any }[]>([])
  const [checkingConflicts, setCheckingConflicts] = useState(false)
  const [saveSetName, setSaveSetName] = useState('')
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [showLoadModal, setShowLoadModal] = useState(false)
  const settings = useSettingsStore()
  const questionBank = useQuestionBankStore()

  const shortlisted = job.candidates.filter(c => c.status === 'l2_shortlisted' || c.status === 'l1_shortlisted')
  const isAuthenticated = !!settings.googleTokens
  const availableSets = questionBank.getSetsForJob(job.id)

  useEffect(() => {
    if (startDate && shortlisted.length > 0) {
      checkScheduleConflicts()
    }
  }, [startDate, startTime, meetingLength])

  const checkScheduleConflicts = async () => {
    if (!startDate) return
    setCheckingConflicts(true)
    try {
      const slots = generateTimeSlots(startDate, startTime, shortlisted.length, meetingLength)
      const events = await fetchCalendarEvents(startDate)
      const result = detectConflicts(slots, events)
      setConflicts(result.conflicts)
    } catch {
      setConflicts([])
    }
    setCheckingConflicts(false)
  }

  const handleSaveQuestionSet = () => {
    if (!saveSetName.trim()) return
    const questionTemplates: QuestionTemplate[] = questions.map((q, i) => ({
      id: uuidv4(),
      text: q,
      category: 'general',
      isSample: i === 0,
      createdAt: new Date().toISOString(),
    }))
    questionBank.createSet(saveSetName.trim(), questionTemplates, job.id)
    setSaveSetName('')
    setShowSaveModal(false)
  }

  const handleLoadQuestionSet = (setId: string) => {
    const qSet = questionBank.getSet(setId)
    if (!qSet) return
    setQuestions(qSet.questions.map(q => q.text))
    setShowLoadModal(false)
  }

  const addQuestion = () => setQuestions([...questions, ''])
  const removeQuestion = (i: number) => setQuestions(questions.filter((_, idx) => idx !== i))
  const updateQuestion = (i: number, text: string) => {
    const updated = [...questions]
    updated[i] = text
    setQuestions(updated)
  }

  const handleAuthenticate = async () => {
    try {
      await authenticateGoogle()
    } catch (err: any) {
      console.error(err)
    }
  }

  const handleSendInvites = async () => {
    setSending(true)
    const errors: string[] = []
    const total = shortlisted.length
    setSendProgress({ current: 0, total, currentName: '' })

    const interviewAppUrl = settings.interviewAppUrl

    for (let i = 0; i < shortlisted.length; i++) {
      const candidate = shortlisted[i]
      setSendProgress({ current: i + 1, total, currentName: candidate.name })

      if (!candidate.email) {
        errors.push(`${candidate.name}: No email address`)
        continue
      }

      try {
        const slotStart = new Date(`${startDate}T${startTime}:00`)
        slotStart.setMinutes(slotStart.getMinutes() + i * (meetingLength + 15))
        const slotEnd = new Date(slotStart)
        slotEnd.setMinutes(slotEnd.getMinutes() + meetingLength)

        let meetingLink = ''
        const isHumanInterview = interviewType === 'human'

        if (isHumanInterview) {
          // Create Google Calendar event with Meet link
          const attendees = [candidate.email]
          if (interviewerEmail) attendees.push(interviewerEmail)

          const result = await createCalendarEvent({
            title: `Interview: ${candidate.name} — ${job.title}`,
            description: `Interview for ${job.title} position.\n\nCandidate: ${candidate.name}\n${candidate.email}`,
            startTime: slotStart.toISOString(),
            endTime: slotEnd.toISOString(),
            attendees,
            createMeetLink: true,
          })

          meetingLink = result.meetLink || result.htmlLink

          useJobStore.getState().updateCandidate(job.id, candidate.id, {
            status: 'interview_scheduled',
          })
        } else {
          // AI Interview — generate unique token and use Vercel app URL
          const token = uuidv4().slice(0, 8)
          meetingLink = interviewAppUrl
            ? `${interviewAppUrl}/interview?token=${token}&candidate=${encodeURIComponent(candidate.name)}`
            : `[Interview App URL not configured]`

          // POST configured questions to the interview app
          if (interviewAppUrl) {
            try {
              const realQuestions = questions.filter((q, idx) => idx > 0 && q.trim())
              const sampleQ = questions[0]?.trim() || undefined
              await fetch(`${interviewAppUrl}/api/questions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  token,
                  questions: realQuestions,
                  jobTitle: job.title,
                  sampleQuestion: sampleQ,
                }),
              })
            } catch {
              // Non-fatal — interview app will use fallback questions
            }
          }

          // Create calendar event without Meet link
          if (isAuthenticated) {
            await createCalendarEvent({
              title: `AI Interview: ${candidate.name} — ${job.title}`,
              description: `AI-conducted interview for ${job.title}.\n\nInterview link: ${meetingLink}`,
              startTime: slotStart.toISOString(),
              endTime: slotEnd.toISOString(),
              attendees: [candidate.email],
              createMeetLink: false,
            })
          }

          useJobStore.getState().updateCandidate(job.id, candidate.id, {
            status: 'interview_scheduled',
            interviewToken: token,
          })
        }

        // Format and send email
        const interviewDetails = `Date: ${slotStart.toLocaleDateString()}\nTime: ${slotStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}\nDuration: ${meetingLength} minutes\nType: ${isHumanInterview ? 'Video Interview (Google Meet)' : 'AI Audio Interview'}`

        const emailBody = emailTemplate
          .replace(/\{\{candidate_name\}\}/g, candidate.name)
          .replace(/\{\{job_title\}\}/g, job.title)
          .replace(/\{\{interview_details\}\}/g, interviewDetails.replace(/\n/g, '<br>'))
          .replace(/\{\{meeting_link\}\}/g, meetingLink)

        await sendEmail(
          candidate.email,
          `Interview Invitation — ${job.title}`,
          emailBody,
        )
      } catch (err: any) {
        errors.push(`${candidate.name}: ${err.message || 'Failed to send'}`)
      }
    }

    setSendErrors(errors)
    setSending(false)
    setSent(true)
  }

  const renderTypeSelection = () => (
    <div className="space-y-4">
      <h3 className="font-medium text-white">Who will conduct the interview?</h3>
      <div className="grid grid-cols-2 gap-4">
        <button
          onClick={() => { setInterviewType('human'); setStep('schedule') }}
          className={`p-6 rounded-xl border text-left transition-all hover:border-brand-500/30 ${
            interviewType === 'human' ? 'border-brand-500/50 bg-brand-500/10' : 'border-white/[0.06] bg-white/[0.02]'
          }`}
        >
          <Video size={24} className="text-brand-400 mb-3" />
          <p className="font-medium text-white mb-1">Human Interviewer</p>
          <p className="text-xs text-white/40">A Google Meet invite will be sent to both the candidate and interviewer</p>
        </button>
        <button
          onClick={() => { setInterviewType('app'); setStep('questions') }}
          className={`p-6 rounded-xl border text-left transition-all hover:border-violet-500/30 ${
            interviewType === 'app' ? 'border-violet-500/50 bg-violet-500/10' : 'border-white/[0.06] bg-white/[0.02]'
          }`}
        >
          <Mic size={24} className="text-violet-400 mb-3" />
          <p className="font-medium text-white mb-1">AI Interview App</p>
          <p className="text-xs text-white/40">Candidates receive a unique link to the audio interview app</p>
        </button>
      </div>
    </div>
  )

  const renderSchedule = () => (
    <div className="space-y-5">
      <h3 className="font-medium text-white">Schedule Configuration</h3>

      {interviewType === 'human' && (
        <div>
          <label className="text-sm text-white/70 block mb-2">Interviewer Email</label>
          <input
            type="email"
            value={interviewerEmail}
            onChange={(e) => setInterviewerEmail(e.target.value)}
            placeholder="interviewer@company.com"
            className="input-field"
          />
          <p className="text-xs text-white/30 mt-1">The interviewer will also receive the calendar invite</p>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="text-sm text-white/70 block mb-2">Meeting Length</label>
          <select
            value={meetingLength}
            onChange={(e) => setMeetingLength(parseInt(e.target.value))}
            className="input-field"
          >
            <option value={15}>15 minutes</option>
            <option value={30}>30 minutes</option>
            <option value={45}>45 minutes</option>
            <option value={60}>60 minutes</option>
          </select>
        </div>
        <div>
          <label className="text-sm text-white/70 block mb-2">Start Date</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="input-field" />
        </div>
        <div>
          <label className="text-sm text-white/70 block mb-2">Start Time</label>
          <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="input-field" />
        </div>
      </div>

      <div className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.06]">
        <p className="text-xs text-white/40">
          {shortlisted.length} interviews will be scheduled sequentially with {meetingLength}-minute slots and 15-minute breaks.
          {startDate && ` First interview: ${startDate} at ${startTime}`}
        </p>
      </div>

      {checkingConflicts && (
        <div className="flex items-center gap-2 text-xs text-white/40">
          <Loader2 size={12} className="animate-spin" /> Checking calendar for conflicts...
        </div>
      )}

      {conflicts.length > 0 && (
        <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/10">
          <div className="flex items-start gap-3">
            <AlertTriangle size={16} className="text-amber-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-400">Scheduling Conflicts Detected</p>
              <p className="text-xs text-white/40 mt-1">{conflicts.length} of {shortlisted.length} slots overlap with existing events:</p>
              <div className="mt-2 space-y-1">
                {conflicts.slice(0, 5).map((c, i) => (
                  <p key={i} className="text-xs text-white/50">
                    {new Date(c.slot.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} — conflicts with "{c.conflictsWith.summary}"
                  </p>
                ))}
                {conflicts.length > 5 && <p className="text-xs text-white/30">+{conflicts.length - 5} more</p>}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-end gap-3">
        <button onClick={() => setStep('type')} className="btn-secondary">Back</button>
        <button
          onClick={() => setStep('email')}
          disabled={!startDate}
          className="btn-primary disabled:opacity-30"
        >
          Configure Email
        </button>
      </div>
    </div>
  )

  const renderQuestions = () => (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-white">Interview Questions</h3>
          <p className="text-xs text-white/40 mt-1">First question is a sample warm-up — responses won't be scored</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowLoadModal(true)} className="btn-secondary flex items-center gap-2 text-sm py-2">
            <FolderOpen size={14} /> Load Set
          </button>
          <button onClick={() => setShowSaveModal(true)} className="btn-secondary flex items-center gap-2 text-sm py-2">
            <Save size={14} /> Save Set
          </button>
          <button onClick={addQuestion} className="btn-secondary flex items-center gap-2 text-sm py-2">
            <Plus size={14} /> Add
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {questions.map((q, i) => (
          <div key={i} className="flex items-start gap-3">
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-1 ${
              i === 0 ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-white/[0.04] border border-white/[0.06]'
            }`}>
              <span className={`text-xs font-medium ${i === 0 ? 'text-amber-400' : 'text-white/40'}`}>
                {i === 0 ? 'S' : i}
              </span>
            </div>
            <input
              type="text"
              value={q}
              onChange={(e) => updateQuestion(i, e.target.value)}
              placeholder={i === 0 ? 'Sample warm-up question (e.g., Tell me about yourself)' : `Question ${i}`}
              className="input-field flex-1"
            />
            {i > 0 && questions.length > 2 && (
              <button onClick={() => removeQuestion(i)} className="p-2 rounded-lg hover:bg-white/[0.06] mt-1">
                <X size={14} className="text-white/30" />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Save Question Set Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowSaveModal(false)}>
          <div className="glass-card p-6 w-96" onClick={e => e.stopPropagation()}>
            <h4 className="font-medium text-white mb-4">Save Question Set</h4>
            <input
              type="text"
              value={saveSetName}
              onChange={(e) => setSaveSetName(e.target.value)}
              placeholder="e.g., Frontend Engineer Interview"
              className="input-field mb-4"
              autoFocus
            />
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowSaveModal(false)} className="btn-secondary">Cancel</button>
              <button onClick={handleSaveQuestionSet} disabled={!saveSetName.trim()} className="btn-primary disabled:opacity-30">
                Save ({questions.filter(q => q.trim()).length} questions)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Load Question Set Modal */}
      {showLoadModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowLoadModal(false)}>
          <div className="glass-card p-6 w-96 max-h-[60vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h4 className="font-medium text-white mb-4">Load Question Set</h4>
            {availableSets.length === 0 ? (
              <p className="text-sm text-white/40 text-center py-6">No saved question sets yet</p>
            ) : (
              <div className="space-y-2">
                {availableSets.map(s => (
                  <button
                    key={s.id}
                    onClick={() => handleLoadQuestionSet(s.id)}
                    className="w-full p-3 rounded-lg border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05] text-left transition-colors"
                  >
                    <p className="text-sm font-medium text-white">{s.name}</p>
                    <p className="text-xs text-white/30 mt-0.5">{s.questions.length} questions · {new Date(s.createdAt).toLocaleDateString()}</p>
                  </button>
                ))}
              </div>
            )}
            <div className="flex justify-end mt-4">
              <button onClick={() => setShowLoadModal(false)} className="btn-secondary">Close</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-end gap-3">
        <button onClick={() => setStep('type')} className="btn-secondary">Back</button>
        <button onClick={() => setStep('schedule')} className="btn-primary">Set Schedule</button>
      </div>
    </div>
  )

  const renderEmail = () => (
    <div className="space-y-5">
      <div>
        <h3 className="font-medium text-white">Email Template</h3>
        <p className="text-xs text-white/40 mt-1">
          Emails will be sent from <span className="text-white/60">{settings.authenticatedEmail || 'your authenticated email'}</span>
        </p>
      </div>

      {!isAuthenticated && (
        <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/10">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <AlertCircle size={16} className="text-amber-400 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-400">Gmail Authentication Required</p>
                <p className="text-xs text-white/40 mt-1">Authenticate to send emails and create calendar events.</p>
              </div>
            </div>
            <button onClick={handleAuthenticate} className="btn-primary text-sm py-2 flex items-center gap-2">
              <Mail size={14} /> Authenticate
            </button>
          </div>
        </div>
      )}

      <div>
        <label className="text-sm text-white/70 block mb-2">Email Body</label>
        <textarea
          value={emailTemplate}
          onChange={(e) => setEmailTemplate(e.target.value)}
          rows={12}
          className="input-field font-mono text-xs leading-relaxed resize-none"
        />
        <div className="flex flex-wrap gap-2 mt-2">
          {['{{candidate_name}}', '{{job_title}}', '{{interview_details}}', '{{meeting_link}}'].map(tag => (
            <span key={tag} className="px-2 py-1 rounded bg-white/[0.04] text-[10px] text-white/40 font-mono">{tag}</span>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <button onClick={() => setStep(interviewType === 'app' ? 'questions' : 'schedule')} className="btn-secondary">Back</button>
        <button onClick={() => setStep('confirm')} disabled={!isAuthenticated} className="btn-primary disabled:opacity-30">
          Review & Confirm
        </button>
      </div>
    </div>
  )

  const renderConfirm = () => (
    <div className="space-y-5">
      <h3 className="font-medium text-white">Confirm & Send</h3>

      <div className="glass-card p-5 space-y-3">
        {[
          ['Interview Type', interviewType === 'human' ? 'Human (Google Meet)' : 'AI App (Audio)'],
          ['Candidates', `${shortlisted.length}`],
          ['Duration', `${meetingLength} min each`],
          ...(interviewType === 'human' && interviewerEmail ? [['Interviewer', interviewerEmail]] : []),
          ...(startDate ? [['Starting', `${startDate} at ${startTime}`]] : []),
          ['Sender', settings.authenticatedEmail],
        ].map(([label, value], i) => (
          <div key={i} className="flex justify-between text-sm">
            <span className="text-white/50">{label}</span>
            <span className="text-white">{value}</span>
          </div>
        ))}
      </div>

      {interviewType === 'app' && settings.interviewAppUrl && (
        <div className="p-3 rounded-lg bg-violet-500/5 border border-violet-500/10 flex items-center gap-2">
          <ExternalLink size={12} className="text-violet-400" />
          <p className="text-xs text-violet-400/80">Interview links will point to: {settings.interviewAppUrl}</p>
        </div>
      )}

      {sent ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="p-6 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-center"
        >
          <CheckCircle2 size={32} className="text-emerald-400 mx-auto mb-3" />
          <p className="font-medium text-white">Invites Sent Successfully!</p>
          <p className="text-xs text-white/40 mt-1">
            {shortlisted.length - sendErrors.length} of {shortlisted.length} candidates received their interview invitation
          </p>
          {sendErrors.length > 0 && (
            <div className="mt-4 text-left">
              <p className="text-xs text-red-400 mb-2">Failed ({sendErrors.length}):</p>
              {sendErrors.map((err, i) => (
                <p key={i} className="text-xs text-white/30">{err}</p>
              ))}
            </div>
          )}
        </motion.div>
      ) : (
        <div className="space-y-4">
          {sending && (
            <div className="p-4 rounded-lg bg-white/[0.03]">
              <div className="flex items-center gap-3 mb-2">
                <Loader2 size={16} className="text-brand-400 animate-spin" />
                <span className="text-sm text-white/70">Sending to {sendProgress.currentName}...</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                <div
                  className="h-full bg-brand-500 rounded-full transition-all"
                  style={{ width: `${(sendProgress.current / sendProgress.total) * 100}%` }}
                />
              </div>
              <p className="text-xs text-white/30 mt-1">{sendProgress.current} of {sendProgress.total}</p>
            </div>
          )}

          <div className="flex justify-end gap-3">
            <button onClick={() => setStep('email')} className="btn-secondary" disabled={sending}>Back</button>
            <button onClick={handleSendInvites} disabled={sending} className="btn-primary flex items-center gap-2">
              {sending ? (
                <><Loader2 size={16} className="animate-spin" /> Sending...</>
              ) : (
                <><Send size={16} /> Send {shortlisted.length} Invites</>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  )

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white mb-2">Interview Setup</h2>
        <p className="text-sm text-white/40">
          Configure interview type, schedule, and send invitations to {shortlisted.length} shortlisted candidates.
        </p>
      </div>

      <div className="glass-card p-6">
        {step === 'type' && renderTypeSelection()}
        {step === 'schedule' && renderSchedule()}
        {step === 'questions' && renderQuestions()}
        {step === 'email' && renderEmail()}
        {step === 'confirm' && renderConfirm()}
      </div>
    </div>
  )
}
