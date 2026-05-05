import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { v4 as uuidv4 } from 'uuid'

export interface QuestionTemplate {
  id: string
  text: string
  category: string
  isSample: boolean
  createdAt: string
}

export interface QuestionSet {
  id: string
  name: string
  jobId?: string
  questions: QuestionTemplate[]
  createdAt: string
}

interface QuestionBankStore {
  sets: QuestionSet[]
  createSet: (name: string, questions: QuestionTemplate[], jobId?: string) => string
  deleteSet: (setId: string) => void
  updateSet: (setId: string, data: Partial<QuestionSet>) => void
  getSet: (setId: string) => QuestionSet | undefined
  getSetsForJob: (jobId: string) => QuestionSet[]
  getGlobalSets: () => QuestionSet[]
}

export const useQuestionBankStore = create<QuestionBankStore>()(
  persist(
    (set, get) => ({
      sets: [],

      createSet: (name, questions, jobId) => {
        const id = uuidv4()
        const newSet: QuestionSet = {
          id,
          name,
          jobId,
          questions,
          createdAt: new Date().toISOString(),
        }
        set(state => ({ sets: [...state.sets, newSet] }))
        return id
      },

      deleteSet: (setId) => {
        set(state => ({ sets: state.sets.filter(s => s.id !== setId) }))
      },

      updateSet: (setId, data) => {
        set(state => ({
          sets: state.sets.map(s => s.id === setId ? { ...s, ...data } : s),
        }))
      },

      getSet: (setId) => get().sets.find(s => s.id === setId),

      getSetsForJob: (jobId) => get().sets.filter(s => s.jobId === jobId || !s.jobId),

      getGlobalSets: () => get().sets.filter(s => !s.jobId),
    }),
    {
      name: 'hireeasy-question-bank',
    }
  )
)
