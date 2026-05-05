import { useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import Layout from './components/layout/Layout'
import Dashboard from './pages/Dashboard/Dashboard'
import JobFlow from './pages/JobFlow/JobFlow'
import Settings from './pages/Settings/Settings'
import InterviewResults from './pages/InterviewResults/InterviewResults'
import OAuthCallback from './pages/OAuthCallback'
import { initDbSync, teardownDbSync } from './lib/dbSync'

export default function App() {
  useEffect(() => {
    initDbSync()
    return () => teardownDbSync()
  }, [])

  return (
    <Routes>
      <Route path="/oauth-callback" element={<OAuthCallback />} />
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/job/:jobId/*" element={<JobFlow />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/results/:jobId" element={<InterviewResults />} />
      </Route>
    </Routes>
  )
}
