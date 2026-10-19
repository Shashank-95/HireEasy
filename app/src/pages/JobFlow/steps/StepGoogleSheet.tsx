import { useState } from 'react'
import { FileSpreadsheet, Link, Loader2, CheckCircle2, AlertCircle, Users, LogIn, Settings2, ChevronDown } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Job, Candidate, ColumnMapping, useJobStore } from '../../../stores/jobStore'
import { useSettingsStore } from '../../../stores/settingsStore'
import { authenticateGoogle, parseGoogleSheet } from '../../../lib/google'
import { parseSheetData, identifyKeyColumns, isNoiseColumn } from '../../../lib/googleSheets'
import { parseCtcToLPA, parseExperienceYears, parseNoticePeriodDays, formatCtc, formatExperience, formatNotice } from '../../../lib/candidateParsing'
import { dedupeCandidates } from '../../../lib/dedupe'
import { v4 as uuidv4 } from 'uuid'

interface Props {
  job: Job
  onNext: () => void
}

/** Fields the user can map a sheet column onto. */
const MAPPABLE_FIELDS: { key: keyof Omit<ColumnMapping, 'responseColumns' | 'ignoredColumns'>; label: string; hint: string; required?: boolean }[] = [
  { key: 'name', label: 'Name', hint: 'Candidate full name', required: true },
  { key: 'email', label: 'Email', hint: 'Used to send interview invites', required: true },
  { key: 'phone', label: 'Phone', hint: 'Optional contact number' },
  { key: 'resume', label: 'Resume', hint: 'Link to CV/resume file' },
  { key: 'ctc', label: 'Expected CTC', hint: 'Enables budget filtering' },
  { key: 'experience', label: 'Experience', hint: 'Enables experience-band filtering' },
  { key: 'noticePeriod', label: 'Notice Period', hint: 'Enables availability filtering' },
  { key: 'location', label: 'Location', hint: 'Enables location filtering' },
]

export default function StepGoogleSheet({ job, onNext }: Props) {
  const [sheetUrl, setSheetUrl] = useState(job.sheetUrl || '')
  const [loading, setLoading] = useState(false)
  const [authenticating, setAuthenticating] = useState(false)
  const [parsed, setParsed] = useState(!!job.columnMapping && job.candidates.length > 0)
  const [error, setError] = useState('')
  const [headers, setHeaders] = useState<string[]>(job.columnMapping ? allMappedHeaders(job.columnMapping) : [])
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([])
  const [mapping, setMapping] = useState<ColumnMapping | null>(job.columnMapping || null)
  const [showMapping, setShowMapping] = useState(false)
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

      if (sheetData.rows.length === 0) {
        setError('The sheet appears to be empty or only contains a header row.')
        setLoading(false)
        return
      }

      const detected = identifyKeyColumns(sheetData.headers)
      const autoMapping: ColumnMapping = {
        name: detected.nameColumn || undefined,
        email: detected.emailColumn || undefined,
        phone: detected.phoneColumn || undefined,
        resume: detected.resumeColumn || undefined,
        ctc: detected.ctcColumn || undefined,
        experience: detected.experienceColumn || undefined,
        noticePeriod: detected.noticePeriodColumn || undefined,
        location: detected.locationColumn || undefined,
        responseColumns: detected.responseColumns,
        ignoredColumns: [],
      }

      setHeaders(sheetData.headers)
      setRawRows(sheetData.rows)
      setMapping(autoMapping)
      setParsed(true)
      setShowMapping(true)
      commitCandidates(autoMapping, sheetData.rows, sheetData.headers)
    } catch (err: any) {
      setError(err.message || 'Failed to parse Google Sheet')
    } finally {
      setLoading(false)
    }
  }

  /** Rebuild candidates from the current mapping. Cheap — no network calls. */
  const commitCandidates = (m: ColumnMapping, rows: Record<string, string>[], hdrs: string[]) => {
    const assigned = new Set(
      [m.name, m.email, m.phone, m.resume, m.ctc, m.experience, m.noticePeriod, m.location].filter(Boolean) as string[]
    )
    const responseColumns = hdrs.filter(
      h => !assigned.has(h) && !m.ignoredColumns.includes(h) && !isNoiseColumn(h)
    )

    const candidates: Candidate[] = rows.map(row => {
      const ctcRaw = m.ctc ? row[m.ctc] : undefined
      const expRaw = m.experience ? row[m.experience] : undefined
      const noticeRaw = m.noticePeriod ? row[m.noticePeriod] : undefined

      return {
        id: uuidv4(),
        jobId: job.id,
        name: (m.name ? row[m.name] : '')?.trim() || 'Unknown',
        email: m.email ? row[m.email]?.trim() : undefined,
        phone: m.phone ? row[m.phone]?.trim() : undefined,
        resumeUrl: m.resume ? row[m.resume]?.trim() : undefined,
        ctcRaw,
        ctcExpected: parseCtcToLPA(ctcRaw),
        experienceRaw: expRaw,
        experienceYears: parseExperienceYears(expRaw),
        noticePeriodRaw: noticeRaw,
        noticePeriodDays: parseNoticePeriodDays(noticeRaw),
        location: m.location ? row[m.location]?.trim() : undefined,
        responses: Object.fromEntries(responseColumns.map(col => [col, row[col] || ''])),
        status: 'applied' as const,
        shortlistLevel: 0,
      }
    })

    // Collapse repeat applications from the same person. Answer-level duplicate
    // detection only catches copy-paste; the same candidate applying twice with
    // reworded answers would otherwise burn a second AI call and take two slots.
    const { unique, removed } = dedupeCandidates(candidates)
    const byEmail = removed.filter(r => r.matchedOn === 'email').length
    const byPhone = removed.filter(r => r.matchedOn === 'phone').length

    const finalMapping = { ...m, responseColumns }
    updateJob(job.id, {
      sheetUrl: sheetUrl.trim(),
      candidates: [],
      candidateCount: 0,
      columnMapping: finalMapping,
      dedupeSummary: removed.length > 0 ? { removed: removed.length, byEmail, byPhone } : undefined,
    })
    addCandidates(job.id, unique)
    setMapping(finalMapping)
  }

  const updateMapping = (field: string, value: string) => {
    if (!mapping) return
    const next = { ...mapping, [field]: value || undefined }
    commitCandidates(next, rawRows, headers)
  }

  // Live parse-quality preview so the user can verify the mapping is right
  const parseStats = (() => {
    if (!mapping || job.candidates.length === 0) return null
    const cands = job.candidates
    return {
      withEmail: cands.filter(c => c.email).length,
      withCtc: cands.filter(c => c.ctcExpected !== undefined).length,
      withExp: cands.filter(c => c.experienceYears !== undefined).length,
      withNotice: cands.filter(c => c.noticePeriodDays !== undefined).length,
      total: cands.length,
    }
  })()

  const sampleCandidate = job.candidates[0]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white mb-2">Import Candidate Data</h2>
        <p className="text-sm text-white/40">
          Paste your Google Sheet link. We'll auto-detect the columns — you can correct any mapping before continuing.
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

      {/* Parse result + column mapping */}
      {parsed && mapping && (
        <div className="glass-card overflow-hidden">
          <div className="p-6 pb-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-400" />
                <h3 className="font-medium text-white">Sheet Parsed Successfully</h3>
              </div>
              <div className="flex items-center gap-3 text-xs">
                {job.dedupeSummary && (
                  <span className="px-2 py-1 rounded-md bg-violet-500/10 border border-violet-500/20 text-violet-300">
                    {job.dedupeSummary.removed} repeat application{job.dedupeSummary.removed === 1 ? '' : 's'} merged
                  </span>
                )}
                <span className="flex items-center gap-1.5 text-white/40">
                  <Users size={12} />
                  {job.candidates.length} unique candidates
                </span>
              </div>
            </div>

            {/* Parse quality — tells the user immediately if a mapping is wrong */}
            {parseStats && (
              <div className="grid grid-cols-4 gap-2 mb-4">
                {[
                  { label: 'Emails', got: parseStats.withEmail, key: 'email' },
                  { label: 'CTC', got: parseStats.withCtc, key: 'ctc' },
                  { label: 'Experience', got: parseStats.withExp, key: 'experience' },
                  { label: 'Notice', got: parseStats.withNotice, key: 'noticePeriod' },
                ].map(stat => {
                  const mapped = !!(mapping as any)[stat.key]
                  const pct = Math.round((stat.got / parseStats.total) * 100)
                  const good = !mapped || pct >= 70
                  return (
                    <div key={stat.key} className={`p-3 rounded-lg border text-center ${
                      !mapped ? 'bg-white/[0.02] border-white/[0.05]'
                        : good ? 'bg-emerald-500/5 border-emerald-500/15'
                        : 'bg-amber-500/5 border-amber-500/20'
                    }`}>
                      <p className={`text-sm font-bold ${!mapped ? 'text-white/25' : good ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {mapped ? `${pct}%` : '—'}
                      </p>
                      <p className="text-[10px] text-white/40 mt-0.5">{stat.label}</p>
                    </div>
                  )
                })}
              </div>
            )}

            <button
              onClick={() => setShowMapping(!showMapping)}
              className="w-full flex items-center justify-between px-4 py-3 rounded-lg bg-white/[0.03] hover:bg-white/[0.05] border border-white/[0.06] transition-colors"
            >
              <div className="flex items-center gap-2">
                <Settings2 size={14} className="text-brand-400" />
                <span className="text-sm text-white/80">Column Mapping</span>
                <span className="text-xs text-white/30">
                  {mapping.responseColumns.length} columns feed the AI screening
                </span>
              </div>
              <ChevronDown size={14} className={`text-white/40 transition-transform ${showMapping ? 'rotate-180' : ''}`} />
            </button>
          </div>

          <AnimatePresence>
            {showMapping && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="overflow-hidden border-t border-white/[0.06]"
              >
                <div className="p-6 space-y-3">
                  <p className="text-xs text-white/40 mb-3">
                    Everything not mapped below is sent to the AI as a screening answer.
                    Mapping CTC, experience and notice period unlocks hard filters in the next step.
                  </p>

                  {MAPPABLE_FIELDS.map(field => {
                    const value = (mapping as any)[field.key] || ''
                    const missing = field.required && !value
                    return (
                      <div key={field.key} className="flex items-center gap-3">
                        <div className="w-36 shrink-0">
                          <p className={`text-sm ${missing ? 'text-amber-400' : 'text-white/70'}`}>
                            {field.label}
                            {field.required && <span className="text-rose-400/60 ml-0.5">*</span>}
                          </p>
                          <p className="text-[10px] text-white/25">{field.hint}</p>
                        </div>
                        <select
                          value={value}
                          onChange={(e) => updateMapping(field.key, e.target.value)}
                          className={`flex-1 bg-white/[0.03] border rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-brand-500/40 transition-colors ${
                            missing ? 'border-amber-500/30' : 'border-white/[0.06]'
                          }`}
                        >
                          <option value="" className="bg-[#1a1a20]">— Not mapped —</option>
                          {headers.map(h => (
                            <option key={h} value={h} className="bg-[#1a1a20]">{h}</option>
                          ))}
                        </select>
                        {/* Show what the first candidate parsed to, so errors are obvious */}
                        {value && sampleCandidate && (
                          <div className="w-28 shrink-0 text-right">
                            <p className="text-[10px] text-white/25">sample</p>
                            <p className="text-xs text-brand-300 truncate">
                              {field.key === 'ctc' ? formatCtc(sampleCandidate.ctcExpected)
                                : field.key === 'experience' ? formatExperience(sampleCandidate.experienceYears)
                                : field.key === 'noticePeriod' ? formatNotice(sampleCandidate.noticePeriodDays)
                                : field.key === 'name' ? sampleCandidate.name
                                : field.key === 'email' ? (sampleCandidate.email || '—')
                                : field.key === 'location' ? (sampleCandidate.location || '—')
                                : field.key === 'phone' ? (sampleCandidate.phone || '—')
                                : (sampleCandidate.resumeUrl ? 'linked' : '—')}
                            </p>
                          </div>
                        )}
                      </div>
                    )
                  })}

                  <div className="pt-3 mt-3 border-t border-white/[0.06]">
                    <p className="text-xs text-white/40 mb-2">
                      Screening questions sent to the AI ({mapping.responseColumns.length}):
                    </p>
                    <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                      {mapping.responseColumns.map((col, i) => (
                        <span key={i} className="px-2 py-1 rounded-md text-[11px] bg-brand-500/10 border border-brand-500/15 text-brand-300/80">
                          {col.length > 45 ? col.substring(0, 45) + '…' : col}
                        </span>
                      ))}
                      {mapping.responseColumns.length === 0 && (
                        <span className="text-xs text-amber-400">
                          No screening questions detected — the AI will have nothing to evaluate.
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
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

function allMappedHeaders(m: ColumnMapping): string[] {
  return [
    ...[m.name, m.email, m.phone, m.resume, m.ctc, m.experience, m.noticePeriod, m.location].filter(Boolean) as string[],
    ...m.responseColumns,
  ]
}
