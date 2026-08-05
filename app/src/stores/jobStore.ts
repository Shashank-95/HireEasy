import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { v4 as uuidv4 } from 'uuid'
import { useStatsStore } from './statsStore'
import { idbStorage } from '../lib/idbStorage'

export interface Skill {
  id: string
  name: string
  weight: number
  type: 'technical' | 'non-technical' | 'behavioral'
}

/** Full audit trail of why a candidate scored what they scored. */
export interface ScreeningDetail {
  skillScores: Record<string, number>
  qualitySignals: {
    specificity: number
    quantification: number
    relevance: number
    communication: number
    depth: number
  }
  redFlags: string[]
  tier: 'STRONG_YES' | 'YES' | 'MAYBE' | 'NO'
  topStrengths: string[]
  concerns: string[]
  summary: string
  /** Score before AI-detection penalty was applied */
  rawScore: number
  /** Multiplier applied due to AI detection */
  aiPenalty: number
  error?: string
}

export interface Candidate {
  id: string
  jobId: string
  name: string
  email?: string
  phone?: string
  resumeUrl?: string
  responses: Record<string, string>

  // --- Structured screening attributes parsed from the sheet ---
  /** Expected CTC, normalised to LPA (lakhs per annum) */
  ctcExpected?: number
  /** Raw CTC text as it appeared in the sheet */
  ctcRaw?: string
  /** Total years of experience */
  experienceYears?: number
  experienceRaw?: string
  /** Notice period in days (0 = immediate) */
  noticePeriodDays?: number
  noticePeriodRaw?: string
  location?: string

  aiDetectionScore?: number
  l1Score?: number
  l1Percentile?: number
  l2Score?: number
  l2Percentile?: number
  finalScore?: number
  status: 'applied' | 'l1_shortlisted' | 'l2_shortlisted' | 'interview_scheduled' | 'interviewed' | 'hired' | 'rejected'
  shortlistLevel: number

  /** Full LLM evaluation audit trail */
  screeningDetail?: ScreeningDetail
  /** Hard-filter rules this candidate failed (empty/undefined = passed all) */
  filterFailures?: string[]
  /** Recruiter override that beats the algorithm */
  manualDecision?: 'promoted' | 'rejected'
  manualNote?: string

  interviewToken?: string
  interviewTranscripts?: { question: string; transcript: string }[]
  interviewScore?: number
  interviewFeedback?: string
  manualRatings?: Record<string, number>
}

/** Deterministic hard filters applied before any LLM spend. */
export interface ScreeningCriteria {
  enabled: boolean
  /** Max acceptable expected CTC in LPA. undefined = no limit */
  maxCtc?: number
  minExperience?: number
  maxExperience?: number
  /** Max acceptable notice period in days */
  maxNoticePeriod?: number
  /** Acceptable locations (case-insensitive substring match). Empty = anywhere */
  locations: string[]
  /** Treat "remote"/"anywhere" as always matching the location filter */
  allowRemote: boolean
  requireResume: boolean
  requireEmail: boolean
  /** 'reject' removes them entirely; 'flag' keeps them but penalises the score */
  mode: 'reject' | 'flag'
}

export const DEFAULT_CRITERIA: ScreeningCriteria = {
  enabled: false,
  locations: [],
  allowRemote: true,
  requireResume: false,
  requireEmail: true,
  mode: 'reject',
}

/** Which sheet column feeds which candidate field. */
export interface ColumnMapping {
  name?: string
  email?: string
  phone?: string
  resume?: string
  ctc?: string
  experience?: string
  noticePeriod?: string
  location?: string
  /** Columns fed to the LLM as screening answers */
  responseColumns: string[]
  /** Columns explicitly ignored by the user */
  ignoredColumns: string[]
}

export interface InterviewRound {
  id: string
  jobId: string
  roundNumber: number
  type: 'human' | 'app'
  scheduledDate?: string
  meetingLength?: number
  interviewerEmail?: string
  useAppInterview: boolean
  status: 'pending' | 'in_progress' | 'completed'
  questions: { id: string; text: string; isSample: boolean; order: number }[]
}

export interface Job {
  id: string
  title: string
  department?: string
  description?: string
  jdFilePath?: string
  sheetUrl?: string
  status: 'active' | 'completed' | 'paused'
  createdAt: string
  technicalSkills: Skill[]
  nonTechSkills: Skill[]
  behavioralSkills: Skill[]
  candidates: Candidate[]
  interviewRounds: InterviewRound[]
  candidateCount?: number
  shortlistedCount?: number
  hiredCount?: number
  currentStep: number
  /** Hard filters applied before LLM screening */
  screeningCriteria?: ScreeningCriteria
  /** User-confirmed sheet column mapping */
  columnMapping?: ColumnMapping
  /** Percentile cutoff chosen at L1 */
  l1PercentileCutoff?: number
}

interface JobStore {
  jobs: Job[]
  createJob: (title: string, department?: string) => string
  updateJob: (jobId: string, data: Partial<Job>) => void
  deleteJob: (jobId: string) => void
  getJob: (jobId: string) => Job | undefined
  addCandidates: (jobId: string, candidates: Candidate[]) => void
  updateCandidate: (jobId: string, candidateId: string, data: Partial<Candidate>) => void
  /** Apply many candidate patches in ONE store write — essential at 1000+ scale */
  bulkUpdateCandidates: (jobId: string, patches: { id: string; data: Partial<Candidate> }[]) => void
  addInterviewRound: (jobId: string, round: Omit<InterviewRound, 'id'>) => void
}

export const useJobStore = create<JobStore>()(
  persist(
    (set, get) => ({
      jobs: [],

  createJob: (title, department) => {
    const id = uuidv4()
    const newJob: Job = {
      id,
      title,
      department,
      status: 'active',
      createdAt: new Date().toISOString(),
      technicalSkills: [],
      nonTechSkills: [],
      behavioralSkills: [],
      candidates: [],
      interviewRounds: [],
      candidateCount: 0,
      shortlistedCount: 0,
      hiredCount: 0,
      currentStep: 0,
      screeningCriteria: { ...DEFAULT_CRITERIA },
      l1PercentileCutoff: 90,
    }
    set(state => ({ jobs: [...state.jobs, newJob] }))
    useStatsStore.getState().recordJobCreated()
    return id
  },

  updateJob: (jobId, data) => {
    set(state => ({
      jobs: state.jobs.map(job =>
        job.id === jobId ? { ...job, ...data } : job
      ),
    }))
  },

  deleteJob: (jobId) => {
    // Snapshot the job's stats into lifetime stats before deletion so impact is preserved
    const jobToDelete = get().jobs.find(j => j.id === jobId)
    if (jobToDelete) {
      useStatsStore.getState().archiveJobStats({
        candidateCount: jobToDelete.candidateCount || 0,
        shortlistedCount: jobToDelete.shortlistedCount || 0,
        hiredCount: jobToDelete.hiredCount || 0,
      })
    }
    set(state => ({ jobs: state.jobs.filter(job => job.id !== jobId) }))
  },

  getJob: (jobId) => {
    return get().jobs.find(job => job.id === jobId)
  },

  addCandidates: (jobId, candidates) => {
    set(state => ({
      jobs: state.jobs.map(job =>
        job.id === jobId
          ? { ...job, candidates: [...job.candidates, ...candidates], candidateCount: job.candidates.length + candidates.length }
          : job
      ),
    }))
  },

  updateCandidate: (jobId, candidateId, data) => {
    set(state => ({
      jobs: state.jobs.map(job =>
        job.id === jobId
          ? {
              ...job,
              candidates: job.candidates.map(c =>
                c.id === candidateId ? { ...c, ...data } : c
              ),
            }
          : job
      ),
    }))
  },

  bulkUpdateCandidates: (jobId, patches) => {
    if (patches.length === 0) return
    const patchMap = new Map(patches.map(p => [p.id, p.data]))
    set(state => ({
      jobs: state.jobs.map(job =>
        job.id === jobId
          ? {
              ...job,
              candidates: job.candidates.map(c => {
                const patch = patchMap.get(c.id)
                return patch ? { ...c, ...patch } : c
              }),
            }
          : job
      ),
    }))
  },

  addInterviewRound: (jobId, round) => {
    const id = uuidv4()
    set(state => ({
      jobs: state.jobs.map(job =>
        job.id === jobId
          ? { ...job, interviewRounds: [...job.interviewRounds, { ...round, id }] }
          : job
      ),
    }))
  },
    }),
    {
      name: 'hireeasy-jobs',
      storage: createJSONStorage(() => idbStorage),
    }
  )
)
