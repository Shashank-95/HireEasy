import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type LlmProvider = 'openai' | 'anthropic' | 'gemini' | 'groq'
export type AiDetectionProvider = 'sapling' | 'gptzero' | 'originality' | 'copyleaks'

interface SettingsStore {
  openaiKey: string
  anthropicKey: string
  geminiKey: string
  groqKey: string
  deepgramKey: string
  aiDetectionKey: string
  preferredLlm: LlmProvider
  aiDetectionProvider: AiDetectionProvider
  googleClientId: string
  googleClientSecret: string
  authenticatedEmail: string
  googleTokens: string | null
  interviewAppUrl: string
  setKey: (key: string, value: string) => void
  setPreferredLlm: (provider: LlmProvider) => void
  setAiDetectionProvider: (provider: AiDetectionProvider) => void
  isConfigured: () => boolean
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set, get) => ({
      openaiKey: '',
      anthropicKey: '',
      geminiKey: '',
      groqKey: '',
      deepgramKey: '',
      aiDetectionKey: '',
      preferredLlm: 'openai',
      aiDetectionProvider: 'sapling',
      googleClientId: '',
      googleClientSecret: '',
      authenticatedEmail: '',
      googleTokens: null,
      interviewAppUrl: 'https://interview-app-roan.vercel.app',

      setKey: (key, value) => set({ [key]: value }),
      setPreferredLlm: (provider) => set({ preferredLlm: provider }),
      setAiDetectionProvider: (provider) => set({ aiDetectionProvider: provider }),

      isConfigured: () => {
        const state = get()
        const hasLlmKey =
          (state.preferredLlm === 'openai' && state.openaiKey) ||
          (state.preferredLlm === 'anthropic' && state.anthropicKey) ||
          (state.preferredLlm === 'gemini' && state.geminiKey) ||
          (state.preferredLlm === 'groq' && state.groqKey)
        return !!hasLlmKey
      },
    }),
    {
      name: 'hireeasy-settings',
    }
  )
)
