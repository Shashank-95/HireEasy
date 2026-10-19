import { useState, useRef, useMemo } from 'react'
import { FileText, Upload, CheckCircle2, X, File, Type, SlidersHorizontal, AlertTriangle, Info, EyeOff } from 'lucide-react'
import { Job, ScreeningCriteria, DEFAULT_CRITERIA, useJobStore } from '../../../stores/jobStore'
import { extractTextFromPdf } from '../../../lib/pdfParser'
import { evaluateCriteria, FILTER_LABELS, PEDIGREE_COLUMN } from '../../../lib/screeningFilters'
import { formatCtc, formatExperience, formatNotice } from '../../../lib/candidateParsing'

interface Props {
  job: Job
  onNext: () => void
}

export default function StepJobDescription({ job, onNext }: Props) {
  const [file, setFile] = useState<File | null>(job.jdFilePath ? ({ name: job.jdFilePath, size: 0 } as File) : null)
  const [jdText, setJdText] = useState(job.description || '')
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<'upload' | 'paste'>(job.description && !job.jdFilePath ? 'paste' : 'upload')
  const [parseWarning, setParseWarning] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const { updateJob } = useJobStore()

  const criteria: ScreeningCriteria = job.screeningCriteria || DEFAULT_CRITERIA
  const parsed = jdText.trim().length > 50

  const setCriteria = (patch: Partial<ScreeningCriteria>) => {
    updateJob(job.id, { screeningCriteria: { ...criteria, ...patch } })
  }

  // Coverage AND actual range of each attribute. Showing the real distribution
  // stops the recruiter setting a threshold that silently excludes everyone —
  // e.g. asking for 3+ years when the form's dropdown caps at "2+ years".
  const coverage = useMemo(() => {
    const c = job.candidates
    if (c.length === 0) return null
    const range = (vals: number[]) => {
      if (vals.length === 0) return null
      const s = [...vals].sort((a, b) => a - b)
      return { min: s[0], median: s[Math.floor(s.length / 2)], max: s[s.length - 1] }
    }
    return {
      total: c.length,
      ctc: c.filter(x => x.ctcExpected !== undefined).length,
      exp: c.filter(x => x.experienceYears !== undefined).length,
      notice: c.filter(x => x.noticePeriodDays !== undefined).length,
      location: c.filter(x => x.location).length,
      ctcRange: range(c.map(x => x.ctcExpected).filter((v): v is number => v !== undefined)),
      expRange: range(c.map(x => x.experienceYears).filter((v): v is number => v !== undefined)),
      noticeRange: range(c.map(x => x.noticePeriodDays).filter((v): v is number => v !== undefined)),
    }
  }, [job.candidates])

  // Live filter impact — recomputed as the recruiter moves the inputs
  const impact = useMemo(() => {
    if (!criteria.enabled || job.candidates.length === 0) return null
    const byRule: Record<string, number> = {}
    let failing = 0
    for (const cand of job.candidates) {
      const { failures } = evaluateCriteria(cand, criteria)
      if (failures.length > 0) {
        failing++
        for (const f of failures) byRule[f] = (byRule[f] || 0) + 1
      }
    }
    return { failing, passing: job.candidates.length - failing, byRule }
  }, [criteria, job.candidates])

  /** Which answer columns blind screening would hide from the model. */
  const blindedColumns = useMemo(
    () => (job.columnMapping?.responseColumns || []).filter(c => PEDIGREE_COLUMN.test(c)),
    [job.columnMapping]
  )

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0]
    if (!selected) return

    setFile(selected)
    setLoading(true)
    setParseWarning('')

    try {
      let text = ''
      if (selected.type === 'application/pdf') {
        text = await extractTextFromPdf(selected)
      } else {
        text = await selected.text()
      }

      // Detect a failed extraction and steer the user to paste instead
      if (text.startsWith('[PDF content from:') || text.trim().length < 100) {
        setParseWarning(
          'We could not extract readable text from this file. Switch to "Paste text" and paste the JD directly — screening accuracy depends on it.'
        )
        setMode('paste')
        setJdText('')
        setLoading(false)
        return
      }

      setJdText(text)
      updateJob(job.id, { jdFilePath: selected.name, description: text })
    } catch {
      setParseWarning('Could not read this file. Please paste the job description text instead.')
      setMode('paste')
    } finally {
      setLoading(false)
    }
  }

  const handlePasteChange = (text: string) => {
    setJdText(text)
    updateJob(job.id, { description: text, jdFilePath: undefined })
  }

  const handleRemoveFile = () => {
    setFile(null)
    setJdText('')
    setParseWarning('')
    updateJob(job.id, { jdFilePath: undefined, description: undefined })
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const dropped = e.dataTransfer.files?.[0]
    if (dropped) {
      const dt = new DataTransfer()
      dt.items.add(dropped)
      if (fileRef.current) {
        fileRef.current.files = dt.files
        handleFileSelect({ target: { files: dt.files } } as any)
      }
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white mb-2">Job Description & Criteria</h2>
        <p className="text-sm text-white/40">
          The JD drives skill extraction and AI scoring. Hard criteria filter candidates deterministically — before any AI spend.
        </p>
      </div>

      {/* ---------- JD input ---------- */}
      <div className="glass-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={() => setMode('upload')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
              mode === 'upload' ? 'bg-brand-500/15 text-brand-400 border border-brand-500/25' : 'text-white/40 hover:text-white/60 border border-transparent'
            }`}
          >
            <Upload size={12} /> Upload file
          </button>
          <button
            onClick={() => setMode('paste')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
              mode === 'paste' ? 'bg-brand-500/15 text-brand-400 border border-brand-500/25' : 'text-white/40 hover:text-white/60 border border-transparent'
            }`}
          >
            <Type size={12} /> Paste text
          </button>
        </div>

        {mode === 'upload' ? (
          !file ? (
            <div
              onClick={() => fileRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              className="border-2 border-dashed border-white/[0.08] rounded-xl p-12 text-center cursor-pointer hover:border-brand-500/30 hover:bg-brand-500/[0.02] transition-all duration-300"
            >
              <div className="w-14 h-14 rounded-2xl bg-white/[0.04] flex items-center justify-center mx-auto mb-4">
                <Upload size={24} className="text-white/30" />
              </div>
              <p className="text-sm font-medium text-white/60 mb-1">Drop your JD here or click to browse</p>
              <p className="text-xs text-white/30">PDF, DOCX or TXT</p>
            </div>
          ) : (
            <div className="flex items-center justify-between p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center">
                  <File size={18} className="text-red-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">{file.name}</p>
                  <p className="text-xs text-white/40">
                    {file.size ? `${(file.size / 1024).toFixed(1)} KB · ` : ''}{jdText.length} chars extracted
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {loading ? (
                  <div className="w-4 h-4 border-2 border-brand-400/30 border-t-brand-400 rounded-full animate-spin" />
                ) : parsed ? (
                  <CheckCircle2 size={16} className="text-emerald-400" />
                ) : (
                  <AlertTriangle size={16} className="text-amber-400" />
                )}
                <button onClick={handleRemoveFile} className="p-2 rounded-lg hover:bg-white/[0.06] transition-colors">
                  <X size={14} className="text-white/40" />
                </button>
              </div>
            </div>
          )
        ) : (
          <div>
            <textarea
              value={jdText}
              onChange={(e) => handlePasteChange(e.target.value)}
              placeholder="Paste the full job description here — responsibilities, requirements, qualifications…"
              rows={10}
              className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 text-sm text-white/80 placeholder-white/20 outline-none focus:border-brand-500/40 transition-colors resize-y leading-relaxed"
            />
            <div className="flex items-center justify-between mt-2">
              <p className="text-xs text-white/30">{jdText.length} characters</p>
              {parsed && (
                <p className="text-xs text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 size={11} /> Ready for skill extraction
                </p>
              )}
            </div>
          </div>
        )}

        {parseWarning && (
          <div className="mt-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-start gap-2">
            <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-400">{parseWarning}</p>
          </div>
        )}

        <input ref={fileRef} type="file" accept=".pdf,.txt,.doc,.docx" onChange={handleFileSelect} className="hidden" />

        {mode === 'upload' && jdText && parsed && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <FileText size={12} className="text-brand-400" />
                <span className="text-xs text-white/50">Extracted preview</span>
              </div>
            </div>
            <div className="max-h-32 overflow-y-auto rounded-lg bg-white/[0.02] p-3">
              <p className="text-xs text-white/40 leading-relaxed whitespace-pre-wrap">
                {jdText.slice(0, 1200)}{jdText.length > 1200 ? '…' : ''}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ---------- Hard screening criteria ---------- */}
      <div className="glass-card p-6">
        <div className="flex items-start justify-between mb-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
              <SlidersHorizontal size={18} className="text-amber-400" />
            </div>
            <div>
              <h3 className="font-medium text-white">Hard Screening Criteria</h3>
              <p className="text-xs text-white/40">Deterministic filters applied before AI scoring — saves cost and enforces non-negotiables</p>
            </div>
          </div>
          <button
            onClick={() => setCriteria({ enabled: !criteria.enabled })}
            className={`relative w-11 h-6 rounded-full transition-colors shrink-0 mt-1 ${
              criteria.enabled ? 'bg-brand-500' : 'bg-white/[0.1]'
            }`}
          >
            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
              criteria.enabled ? 'translate-x-[22px]' : 'translate-x-0.5'
            }`} />
          </button>
        </div>

        {criteria.enabled && (
          <div className="mt-5 space-y-5">
            {/* Budget */}
            <CriteriaRow
              label="Maximum budget (CTC)"
              hint={coverage
                ? `${coverage.ctc}/${coverage.total} have CTC data` +
                  (coverage.ctcRange ? ` · pool ranges ${formatCtc(coverage.ctcRange.min)} – ${formatCtc(coverage.ctcRange.max)}, median ${formatCtc(coverage.ctcRange.median)}` : '')
                : undefined}
              warn={!!coverage && coverage.ctc === 0}
              warnText="No CTC column mapped — this filter will not apply. Map it in the previous step."
            >
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={criteria.maxCtc ?? ''}
                  onChange={(e) => setCriteria({ maxCtc: e.target.value === '' ? undefined : parseFloat(e.target.value) })}
                  placeholder="No limit"
                  className="w-28 bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-brand-500/40"
                />
                <span className="text-xs text-white/40">LPA</span>
                {criteria.maxCtc !== undefined && (
                  <span className="text-xs text-white/30">≈ {formatCtc(criteria.maxCtc)}</span>
                )}
              </div>
            </CriteriaRow>

            {/* Experience band */}
            <CriteriaRow
              label="Experience range"
              hint={coverage
                ? `${coverage.exp}/${coverage.total} have experience data` +
                  (coverage.expRange ? ` · pool ranges ${formatExperience(coverage.expRange.min)} – ${formatExperience(coverage.expRange.max)}` : '')
                : undefined}
              warn={!!coverage && coverage.exp === 0}
              warnText="No experience column mapped — this filter will not apply."
            >
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={criteria.minExperience ?? ''}
                  onChange={(e) => setCriteria({ minExperience: e.target.value === '' ? undefined : parseFloat(e.target.value) })}
                  placeholder="Min"
                  className="w-20 bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-brand-500/40"
                />
                <span className="text-xs text-white/30">to</span>
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={criteria.maxExperience ?? ''}
                  onChange={(e) => setCriteria({ maxExperience: e.target.value === '' ? undefined : parseFloat(e.target.value) })}
                  placeholder="Max"
                  className="w-20 bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-brand-500/40"
                />
                <span className="text-xs text-white/40">years</span>
              </div>
            </CriteriaRow>

            {/* Notice period */}
            <CriteriaRow
              label="Maximum notice period"
              hint={coverage
                ? `${coverage.notice}/${coverage.total} have notice data` +
                  (coverage.noticeRange ? ` · pool ranges ${formatNotice(coverage.noticeRange.min)} – ${formatNotice(coverage.noticeRange.max)}` : '')
                : undefined}
              warn={!!coverage && coverage.notice === 0}
              warnText="No notice period column mapped — this filter will not apply."
            >
              <div className="flex items-center gap-2">
                {[
                  { label: 'Any', value: undefined },
                  { label: 'Immediate', value: 0 },
                  { label: '30d', value: 30 },
                  { label: '60d', value: 60 },
                  { label: '90d', value: 90 },
                ].map(opt => (
                  <button
                    key={opt.label}
                    onClick={() => setCriteria({ maxNoticePeriod: opt.value })}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      criteria.maxNoticePeriod === opt.value
                        ? 'border-brand-500/50 bg-brand-500/10 text-brand-400'
                        : 'border-white/[0.06] bg-white/[0.02] text-white/50 hover:bg-white/[0.04]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </CriteriaRow>

            {/* Location */}
            <CriteriaRow
              label="Acceptable locations"
              hint="Comma-separated. Leave blank to accept any location."
            >
              <div className="space-y-2">
                <input
                  type="text"
                  value={criteria.locations.join(', ')}
                  onChange={(e) => setCriteria({
                    locations: e.target.value.split(',').map(s => s.trim()).filter(Boolean),
                  })}
                  placeholder="Bangalore, Mumbai, Remote"
                  className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 outline-none focus:border-brand-500/40"
                />
                {criteria.locations.length > 0 && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={criteria.allowRemote}
                      onChange={(e) => setCriteria({ allowRemote: e.target.checked })}
                      className="accent-brand-500"
                    />
                    <span className="text-xs text-white/50">Also accept candidates who answered "remote" or "anywhere"</span>
                  </label>
                )}
              </div>
            </CriteriaRow>

            {/* Completeness */}
            <CriteriaRow label="Required fields">
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={criteria.requireEmail}
                    onChange={(e) => setCriteria({ requireEmail: e.target.checked })}
                    className="accent-brand-500"
                  />
                  <span className="text-xs text-white/50">Must have email</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={criteria.requireResume}
                    onChange={(e) => setCriteria({ requireResume: e.target.checked })}
                    className="accent-brand-500"
                  />
                  <span className="text-xs text-white/50">Must have resume</span>
                </label>
              </div>
            </CriteriaRow>

            {/* Mode */}
            <CriteriaRow label="When a candidate fails">
              <div className="flex gap-2">
                {[
                  { value: 'reject' as const, label: 'Reject them', desc: 'Removed before AI scoring' },
                  { value: 'flag' as const, label: 'Flag only', desc: 'Still scored, shown with a warning' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setCriteria({ mode: opt.value })}
                    className={`flex-1 p-3 rounded-lg border text-left transition-all ${
                      criteria.mode === opt.value
                        ? 'border-brand-500/50 bg-brand-500/10'
                        : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]'
                    }`}
                  >
                    <p className={`text-xs font-medium ${criteria.mode === opt.value ? 'text-brand-400' : 'text-white/60'}`}>
                      {opt.label}
                    </p>
                    <p className="text-[10px] text-white/30 mt-0.5">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </CriteriaRow>

            {/* Live impact */}
            {impact && (
              <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-white/60">Impact on your current pool</span>
                  <span className="text-sm">
                    <span className="text-emerald-400 font-bold">{impact.passing}</span>
                    <span className="text-white/30"> pass · </span>
                    <span className="text-rose-400 font-bold">{impact.failing}</span>
                    <span className="text-white/30"> filtered</span>
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-rose-500/20 overflow-hidden">
                  <div
                    className="h-full bg-emerald-500/60 rounded-full transition-all duration-300"
                    style={{ width: `${(impact.passing / job.candidates.length) * 100}%` }}
                  />
                </div>
                {Object.keys(impact.byRule).length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {Object.entries(impact.byRule)
                      .sort((a, b) => b[1] - a[1])
                      .map(([rule, count]) => (
                        <span key={rule} className="px-2 py-1 rounded-md text-[11px] bg-rose-500/10 border border-rose-500/15 text-rose-300/80">
                          {FILTER_LABELS[rule] || rule}: {count}
                        </span>
                      ))}
                  </div>
                )}
                {impact.passing === 0 && (
                  <p className="text-xs text-rose-400 mt-3 flex items-center gap-1.5">
                    <AlertTriangle size={12} />
                    Your criteria exclude everyone. Loosen a filter before continuing.
                  </p>
                )}
                {criteria.mode === 'reject' && impact.failing > 0 && (
                  <p className="text-[11px] text-white/30 mt-3 flex items-center gap-1.5">
                    <Info size={11} />
                    Saves {impact.failing} AI call{impact.failing === 1 ? '' : 's'} at screening time.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ---------- Blind screening ---------- */}
      <div className="glass-card p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center">
              <EyeOff size={18} className="text-violet-400" />
            </div>
            <div>
              <h3 className="font-medium text-white">Blind Screening</h3>
              <p className="text-xs text-white/40">
                Withhold identity and pedigree signals from the AI — you still see everything
              </p>
            </div>
          </div>
          <button
            role="switch"
            aria-checked={!!job.blindScreening}
            aria-label="Blind screening"
            onClick={() => updateJob(job.id, { blindScreening: !job.blindScreening })}
            className={`relative w-11 h-6 rounded-full transition-colors shrink-0 mt-1 ${
              job.blindScreening ? 'bg-violet-500' : 'bg-white/[0.1]'
            }`}
          >
            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
              job.blindScreening ? 'translate-x-[22px]' : 'translate-x-0.5'
            }`} />
          </button>
        </div>

        {job.blindScreening && (
          <div className="mt-4 space-y-3">
            <p className="text-xs text-white/50 leading-relaxed">
              Answers about college, degree, nationality, gender or age are removed from the AI prompt at
              L1 and L2, along with the candidate's name and their resume contact details. The model scores
              only demonstrated capability — you keep full visibility in the candidate view.
            </p>
            {blindedColumns.length > 0 ? (
              <div>
                <p className="text-[11px] text-white/30 mb-1.5">Hidden from the AI in this sheet:</p>
                <div className="flex flex-wrap gap-1.5">
                  {blindedColumns.map(c => (
                    <span key={c} className="px-2 py-1 rounded-md text-[11px] bg-violet-500/10 border border-violet-500/20 text-violet-300/80">
                      {c.length > 50 ? c.slice(0, 50) + '…' : c}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-white/25">
                No pedigree columns detected in this sheet — nothing extra to hide.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <button
          onClick={onNext}
          disabled={!parsed}
          className="btn-primary disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Continue to Skills Configuration
        </button>
      </div>
    </div>
  )
}

function CriteriaRow({ label, hint, warn, warnText, children }: {
  label: string
  hint?: string
  warn?: boolean
  warnText?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div className="w-52 shrink-0">
        <p className="text-sm text-white/70">{label}</p>
        {hint && <p className="text-[10px] text-white/25 mt-0.5">{hint}</p>}
        {warn && warnText && (
          <p className="text-[10px] text-amber-400/70 mt-1 flex items-start gap-1">
            <AlertTriangle size={9} className="mt-0.5 shrink-0" />
            {warnText}
          </p>
        )}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  )
}
