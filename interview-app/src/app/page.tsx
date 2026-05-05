'use client'

import { useState } from 'react'
import { Mic, Shield } from 'lucide-react'
import InterviewRoom from '../components/InterviewRoom'

export default function Home() {
  const [started, setStarted] = useState(false)
  const [token, setToken] = useState('')

  // In production, token comes from URL params: /interview?token=xxx
  // For demo, we show a landing page

  if (started) {
    return <InterviewRoom token={token} />
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center">
        {/* Logo */}
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center mx-auto mb-6">
          <Mic size={28} className="text-white" />
        </div>

        <h1 className="text-3xl font-bold text-white mb-2">HireEasy Interview</h1>
        <p className="text-white/40 mb-8">Audio-based interview assessment</p>

        {/* Instructions */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6 text-left mb-6 space-y-4">
          <h2 className="font-semibold text-white text-sm">Before you begin:</h2>
          <ul className="space-y-3 text-sm text-white/60">
            <li className="flex items-start gap-3">
              <span className="w-5 h-5 rounded-full bg-brand-500/20 text-brand-400 flex items-center justify-center shrink-0 text-xs mt-0.5">1</span>
              Ensure you're in a quiet environment with a working microphone
            </li>
            <li className="flex items-start gap-3">
              <span className="w-5 h-5 rounded-full bg-brand-500/20 text-brand-400 flex items-center justify-center shrink-0 text-xs mt-0.5">2</span>
              The first question is a sample to test your audio — it won't be scored
            </li>
            <li className="flex items-start gap-3">
              <span className="w-5 h-5 rounded-full bg-brand-500/20 text-brand-400 flex items-center justify-center shrink-0 text-xs mt-0.5">3</span>
              Speak clearly and take your time answering each question
            </li>
            <li className="flex items-start gap-3">
              <span className="w-5 h-5 rounded-full bg-brand-500/20 text-brand-400 flex items-center justify-center shrink-0 text-xs mt-0.5">4</span>
              You cannot go back to a previous question once you move forward
            </li>
          </ul>
        </div>

        {/* Privacy note */}
        <div className="flex items-center justify-center gap-2 text-xs text-white/30 mb-6">
          <Shield size={12} />
          <span>Your responses are securely recorded and only shared with the hiring team</span>
        </div>

        <button
          onClick={() => setStarted(true)}
          className="w-full py-4 bg-brand-600 hover:bg-brand-500 text-white font-semibold rounded-xl transition-all duration-200 hover:shadow-lg hover:shadow-brand-500/25 active:scale-[0.98]"
        >
          Start Interview
        </button>
      </div>
    </div>
  )
}
