import { useState } from 'react'
import { FileSpreadsheet, Link, Loader2, CheckCircle2, AlertCircle, Users, LogIn } from 'lucide-react'
import { Job, Candidate, useJobStore } from '../../../stores/jobStore'
import { useSettingsStore } from '../../../stores/settingsStore'
import { authenticateGoogle, parseGoogleSheet } from '../../../lib/google'
import { parseSheetData, identifyKeyColumns } from '../../../lib/googleSheets'
import { v4 as uuidv4 } from 'uuid'

interface Props {
  job: Job
  onNext: () => void
}

export default function StepGoogleSheet({ job, onNext }: Props) {
  const [sheetUrl, setSheetUrl] = useState(job.sheetUrl || '')
  const [loading, setLoading] = useState(false)
  const [authenticating, setAuthenticating] = useState(false)
  const [parsed, setParsed] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<{ headers: string[]; rowCount: number; keyColumns: any } | null>(null)
  const { updateJob, addCandidates } = useJobStore()
  const settings = useSettingsStore()

  const isAuthenticated = !!settings.googleTokens

  const handleAuthenticate = async () => {
    setAuthenticating(true)
    setError('')
    try {
      const result = await authenticateGoogle()
      settings.setKey('authenticatedEmail', result.email)
    } catch (err: any) {
      setError(err.message || 'Authentication failed')
    } finally {
      setAuthenticating(false)
    }
  }

  const handleParse = async () => {
    if (!sheetUrl.trim()) return

    if (!settings.googleClientId || !settings.googleClientSecret) {
      setError('Please configure Google OAuth credentials in Settings first.')
      return
    }

    if (!isAuthenticated) {
      setError('Please authenticate with Google first using the button above.')
      return
    }

    setLoading(true)
    setError('')

    try {
      const { rows } = await parseGoogleSheet(sheetUrl.trim())
      const sheetData = parseSheetData(rows)
      const keyColumns = identifyKeyColumns(sheetData.headers)

      // Convert rows to candidates
      const candidates: Candidate[] = sheetData.rows.map(row => ({
        id: uuidv4(),
        jobId: job.id,
        name: keyColumns.nameColumn ? row[keyColumns.nameColumn] || 'Unknown' : 'Unknown',
        email: keyColumns.emailColumn ? row[keyColumns.emailColumn] : undefined,
        phone: keyColumns.phoneColumn ? row[keyColumns.phoneColumn] : undefined,
        resumeUrl: keyColumns.resumeColumn ? row[keyColumns.resumeColumn] : undefined,
        responses: Object.fromEntries(
          keyColumns.responseColumns.map(col => [col, row[col] || ''])
        ),
        status: 'applied',
        shortlistLevel: 0,
      }))

      setPreview({
        headers: sheetData.headers,
        rowCount: candidates.length,
        keyColumns,
      })
      setParsed(true)
      // Clear existing candidates before adding to prevent duplicates on re-parse
      updateJob(job.id, { sheetUrl: sheetUrl.trim(), candidates: [], candidateCount: 0 })
      addCandidates(job.id, candidates)
    } catch (err: any) {
      setError(err.message || 'Failed to parse Google Sheet')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white mb-2">Import Candidate Data</h2>
        <p className="text-sm text-white/40">
          Paste the Google Sheet link containing candidate responses. We'll automatically detect column headers and import all data.
        </p>
      </div>

      {/* Authentication Status */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl ${isAuthenticated ? 'bg-emerald-500/10' : 'bg-amber-500/10'} flex items-center justify-center`}>
              <LogIn size={18} className={isAuthenticated ? 'text-emerald-400' : 'text-amber-400'} />
            </div>
            <div>
              <h3 className="font-medium text-white text-sm">Google Authentication</h3>
              {isAuthenticated ? (
                <p className="text-xs text-emerald-400/80">Connected as {settings.authenticatedEmail}</p>
              ) : (
                <p className="text-xs text-white/40">Required to access Google Sheets</p>
              )}
            </div>
          </div>
          {!isAuthenticated && (
            <button
              onClick={handleAuthenticate}
              disabled={authenticating || !settings.googleClientId}
              className="btn-primary text-sm py-2 flex items-center gap-2 disabled:opacity-30"
            >
              {authenticating ? <Loader2 size={14} className="animate-spin" /> : <LogIn size={14} />}
              {authenticating ? 'Authenticating...' : 'Connect Google'}
            </button>
          )}
        </div>
        {!settings.googleClientId && (
          <p className="text-xs text-amber-400/60 mt-3 flex items-center gap-1.5">
            <AlertCircle size={12} />
            Configure Google OAuth credentials in Settings first
          </p>
        )}
      </div>

      {/* URL Input */}
      <div className="glass-card p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
            <FileSpreadsheet size={20} className="text-emerald-400" />
          </div>
          <div>
            <h3 className="font-medium text-white">Google Sheet URL</h3>
            <p className="text-xs text-white/40">The sheet should contain candidate responses from your form</p>
          </div>
        </div>

        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Link size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" />
            <input
              type="text"
              value={sheetUrl}
              onChange={(e) => { setSheetUrl(e.target.value); setParsed(false); setError('') }}
              placeholder="https://docs.google.com/spreadsheets/d/..."
              className="input-field pl-10"
            />
          </div>
          <button
            onClick={handleParse}
            disabled={!sheetUrl.trim() || loading || !isAuthenticated}
            className="btn-primary flex items-center gap-2 disabled:opacity-30"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />}
            {loading ? 'Parsing...' : 'Parse Sheet'}
          </button>
        </div>

        {error && (
          <div className="mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center gap-2">
            <AlertCircle size={14} className="text-red-400 shrink-0" />
            <p className="text-xs text-red-400">{error}</p>
          </div>
        )}
      </div>

      {/* Preview */}
      {parsed && preview && (
        <div className="glass-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-emerald-400" />
              <h3 className="font-medium text-white">Sheet Parsed Successfully</h3>
            </div>
            <div className="flex items-center gap-2 text-xs text-white/40">
              <Users size={12} />
              {preview.rowCount} candidates found
            </div>
          </div>

          <div>
            <p className="text-xs text-white/40 mb-2">Detected columns:</p>
            <div className="flex flex-wrap gap-2">
              {preview.headers.map((header, i) => {
                const isKey = header === preview.keyColumns.nameColumn || header === preview.keyColumns.emailColumn ||
                  header === preview.keyColumns.phoneColumn || header === preview.keyColumns.resumeColumn
                return (
                  <span key={i} className={`px-3 py-1.5 rounded-lg text-xs ${
                    isKey ? 'bg-brand-500/10 border border-brand-500/20 text-brand-400' : 'bg-white/[0.04] border border-white/[0.06] text-white/60'
                  }`}>
                    {header}
                    {header === preview.keyColumns.nameColumn && ' (Name)'}
                    {header === preview.keyColumns.emailColumn && ' (Email)'}
                    {header === preview.keyColumns.resumeColumn && ' (Resume)'}
                  </span>
                )
              })}
            </div>
          </div>

          <div className="p-3 rounded-lg bg-brand-500/5 border border-brand-500/10">
            <p className="text-xs text-brand-400/80">
              Auto-detected {preview.keyColumns.responseColumns.length} response columns for screening.
              {!preview.keyColumns.nameColumn && ' Warning: Could not detect a Name column — candidates will be labeled "Unknown".'}
            </p>
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={onNext}
          disabled={!parsed}
          className="btn-primary disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Continue to Job Description
        </button>
      </div>
    </div>
  )
}
