import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface LifetimeStats {
  // Cumulative counters that persist even after jobs are deleted
  totalJobsCreated: number
  totalCandidatesProcessed: number
  totalShortlisted: number
  totalHired: number

  // Increment when a job is created
  recordJobCreated: () => void

  // Snapshot a job's final stats when it's deleted (so they're not lost)
  archiveJobStats: (stats: {
    candidateCount: number
    shortlistedCount: number
    hiredCount: number
  }) => void
}

export const useStatsStore = create<LifetimeStats>()(
  persist(
    (set) => ({
      totalJobsCreated: 0,
      totalCandidatesProcessed: 0,
      totalShortlisted: 0,
      totalHired: 0,

      recordJobCreated: () => set((state) => ({
        totalJobsCreated: state.totalJobsCreated + 1,
      })),

      archiveJobStats: (stats) => set((state) => ({
        totalCandidatesProcessed: state.totalCandidatesProcessed + (stats.candidateCount || 0),
        totalShortlisted: state.totalShortlisted + (stats.shortlistedCount || 0),
        totalHired: state.totalHired + (stats.hiredCount || 0),
      })),
    }),
    { name: 'hireeasy-lifetime-stats' }
  )
)
