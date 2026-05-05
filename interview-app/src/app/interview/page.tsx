'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import InterviewRoom from '../../components/InterviewRoom'

function InterviewContent() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token') || ''
  const candidateName = searchParams.get('candidate') || 'Candidate'

  return <InterviewRoom token={token} candidateName={candidateName} />
}

export default function InterviewPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-brand-400/30 border-t-brand-400 rounded-full animate-spin" />
      </div>
    }>
      <InterviewContent />
    </Suspense>
  )
}
