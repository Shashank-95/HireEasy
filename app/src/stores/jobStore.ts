import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { v4 as uuidv4 } from 'uuid'

export interface Skill {
  id: string
  name: string
  weight: number
  type: 'technical' | 'non-technical' | 'behavioral'
}

export interface Candidate {
  id: string
  jobId: string
  name: string
  email?: string
  phone?: string
  resumeUrl?: string
  responses: Record<string, string>
  aiDetectionScore?: number
  l1Score?: number
  l2Score?: number
  finalScore?: number
  status: 'applied' | 'l1_shortlisted' | 'l2_shortlisted' | 'interview_scheduled' | 'interviewed' | 'hired' | 'rejected'
  shortlistLevel: number
  interviewToken?: string
  interviewTranscripts?: { question: string; transcript: string }[]
  interviewScore?: number
  interviewFeedback?: string
  manualRatings?: Record<string, number>
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
}

interface JobStore {
  jobs: Job[]
  createJob: (title: string, department?: string) => string
  updateJob: (jobId: string, data: Partial<Job>) => void
  deleteJob: (jobId: string) => void
  getJob: (jobId: string) => Job | undefined
  addCandidates: (jobId: string, candidates: Candidate[]) => void
  updateCandidate: (jobId: string, candidateId: string, data: Partial<Candidate>) => void
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
    }
    set(state => ({ jobs: [...state.jobs, newJob] }))
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
    }
  )
)
