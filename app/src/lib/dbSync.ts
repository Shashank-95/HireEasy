import { useJobStore } from '../stores/jobStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useQuestionBankStore } from '../stores/questionBankStore'

// Window.electronAPI is declared in google.ts — we access via type assertion here
const getElectronAPI = () => (window as any).electronAPI as {
  dbLoadJobs: () => Promise<any[]>
  dbSaveJobs: (jobs: any[]) => Promise<{ success: boolean }>
  dbLoadSettings: () => Promise<any>
  dbSaveSettings: (settings: any) => Promise<{ success: boolean }>
  dbLoadQuestionSets: () => Promise<any[]>
  dbSaveQuestionSets: (sets: any[]) => Promise<{ success: boolean }>
  dbGetPath: () => Promise<string>
} | undefined

const isElectron = () => typeof window !== 'undefined' && !!(window as any).electronAPI?.dbLoadJobs

let jobUnsub: (() => void) | null = null
let settingsUnsub: (() => void) | null = null
let questionBankUnsub: (() => void) | null = null

export async function initDbSync() {
  if (!isElectron()) return

  // Load initial data from Electron DB
  try {
    const [savedJobs, savedSettings, savedSets] = await Promise.all([
      getElectronAPI()!.dbLoadJobs(),
      getElectronAPI()!.dbLoadSettings(),
      getElectronAPI()!.dbLoadQuestionSets(),
    ])

    if (savedJobs && savedJobs.length > 0) {
      const currentJobs = useJobStore.getState().jobs
      if (currentJobs.length === 0) {
        useJobStore.setState({ jobs: savedJobs })
      }
    }

    if (savedSettings && Object.keys(savedSettings).length > 0) {
      const currentSettings = useSettingsStore.getState()
      if (!currentSettings.openaiKey && !currentSettings.anthropicKey) {
        useSettingsStore.setState(savedSettings)
      }
    }

    if (savedSets && savedSets.length > 0) {
      const currentSets = useQuestionBankStore.getState().sets
      if (currentSets.length === 0) {
        useQuestionBankStore.setState({ sets: savedSets })
      }
    }
  } catch {
    // Silent — localStorage persist serves as fallback
  }

  // Subscribe to state changes and sync to DB
  let saveJobsTimer: ReturnType<typeof setTimeout> | null = null
  jobUnsub = useJobStore.subscribe((state) => {
    if (saveJobsTimer) clearTimeout(saveJobsTimer)
    saveJobsTimer = setTimeout(() => {
      getElectronAPI()!.dbSaveJobs(state.jobs).catch(() => {})
    }, 1000)
  })

  let saveSettingsTimer: ReturnType<typeof setTimeout> | null = null
  settingsUnsub = useSettingsStore.subscribe((state) => {
    if (saveSettingsTimer) clearTimeout(saveSettingsTimer)
    saveSettingsTimer = setTimeout(() => {
      const { setKey, setPreferredLlm, setAiDetectionProvider, isConfigured, ...persistable } = state as any
      getElectronAPI()!.dbSaveSettings(persistable).catch(() => {})
    }, 1000)
  })

  let saveSetsTimer: ReturnType<typeof setTimeout> | null = null
  questionBankUnsub = useQuestionBankStore.subscribe((state) => {
    if (saveSetsTimer) clearTimeout(saveSetsTimer)
    saveSetsTimer = setTimeout(() => {
      getElectronAPI()!.dbSaveQuestionSets(state.sets).catch(() => {})
    }, 1000)
  })
}

export function teardownDbSync() {
  jobUnsub?.()
  settingsUnsub?.()
  questionBankUnsub?.()
}
