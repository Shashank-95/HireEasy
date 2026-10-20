'use client'
import { useState, useTransition } from 'react'
import { FileUp, Link2 } from 'lucide-react'
import { commitImportAction, previewImportAction } from './actions'
import type { ImportPreview, CommitResult } from '@/lib/data/imports'
import { FIELD_LABELS, FIELDS, type ColumnMapping, type Field } from '@/lib/import/mapping'
import { Badge, Button, Card, CardHeader, cx, Input, Notice, Select } from '@/components/ui'

type Source = { url: string } | { csv: string; fileName: string }

/** Fields worth showing first: the ones eligibility and contact depend on. */
const KEY_FIELDS: Field[] = ['name', 'email', 'phone', 'resume', 'expectedSalary', 'currentSalary', 'experience', 'notice', 'location', 'education']

export function ImportWizard({ roleId, questions, compact }: { roleId: string; questions: { id: string; text: string }[]; compact: boolean }) {
  const [open, setOpen] = useState(!compact)
  const [mode, setMode] = useState<'link' | 'file'>('link')
  const [url, setUrl] = useState('')
  const [source, setSource] = useState<Source | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [mapping, setMapping] = useState<ColumnMapping | null>(null)
  const [links, setLinks] = useState<Record<string, string>>({})
  const [result, setResult] = useState<CommitResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const reset = () => {
    setSource(null)
    setPreview(null)
    setMapping(null)
    setResult(null)
    setError(null)
  }

  const load = (src: Source) =>
    start(async () => {
      setError(null)
      setResult(null)
      const r = await previewImportAction(roleId, src)
      if (r.error || !r.preview) return setError(r.error ?? 'Could not read the sheet.')
      setSource(src)
      setPreview(r.preview)
      setMapping(r.preview.mapping)
      setLinks(r.preview.questionLinks)
    })

  const onFile = async (file: File | undefined) => {
    if (!file) return
    if (!/\.csv$/i.test(file.name)) return setError('Upload a .csv file. In Google Sheets: File → Download → Comma-separated values.')
    load({ csv: await file.text(), fileName: file.name })
  }

  const commit = () =>
    start(async () => {
      if (!source || !mapping) return
      setError(null)
      const r = await commitImportAction(roleId, source, mapping, links)
      if (r.error || !r.result) return setError(r.error ?? 'Import failed.')
      setResult(r.result)
      setPreview(null)
    })

  if (!open) {
    return (
      <div className="mb-6 flex justify-end">
        <Button variant="secondary" onClick={() => setOpen(true)}><FileUp size={15} /> Add or refresh applications</Button>
      </div>
    )
  }

  const setField = (f: Field, col: string) =>
    setMapping(m => {
      if (!m) return m
      const fields = { ...m.fields }
      if (col) fields[f] = col
      else delete fields[f]
      // A column can only feed one field; free it from the others
      for (const k of Object.keys(fields) as Field[]) if (k !== f && fields[k] === col) delete fields[k]
      const used = new Set(Object.values(fields))
      // A column now feeding a field can't also be a question's answers
      setLinks(l => Object.fromEntries(Object.entries(l).filter(([, c]) => !used.has(c))))
      return { ...m, fields, questionColumns: preview!.headers.filter(h => !used.has(h) && !m.ignoredColumns.includes(h)) }
    })

  const linkedCount = Object.keys(links).length
  const fieldOptions = preview?.headers ?? []

  return (
    <Card className="mb-6">
      <CardHeader
        title="Add applications"
        description="Use the Google Sheet your form writes to. Adding the same sheet again later picks up new applicants and keeps every decision already made."
        action={compact && <Button variant="ghost" size="sm" onClick={() => { setOpen(false); reset() }}>Close</Button>}
      />
      <div className="space-y-4 p-5">
        {!preview && !result && (
          <>
            <div className="inline-grid grid-cols-2 rounded-lg bg-surface-2 p-1 text-[13px] font-medium">
              {(['link', 'file'] as const).map(m => (
                <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)} className={cx('flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5', mode === m ? 'bg-surface shadow-sm' : 'text-muted')}>
                  {m === 'link' ? <><Link2 size={14} /> Sheet link</> : <><FileUp size={14} /> Upload CSV</>}
                </button>
              ))}
            </div>
            {mode === 'link' ? (
              <form
                className="flex flex-col gap-2 sm:flex-row"
                onSubmit={e => {
                  e.preventDefault()
                  if (url.trim()) load({ url })
                }}
              >
                <Input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" aria-label="Google Sheet link" />
                <Button type="submit" disabled={pending || !url.trim()}>{pending ? 'Reading…' : 'Read sheet'}</Button>
              </form>
            ) : (
              <label className="flex cursor-pointer flex-col items-center gap-1 rounded-xl border border-dashed border-line px-6 py-8 text-center hover:bg-surface-2">
                <FileUp size={20} className="text-muted" />
                <span className="text-sm font-medium">{pending ? 'Reading…' : 'Choose a CSV file'}</span>
                <span className="text-[12px] text-muted">Google Sheets: File → Download → Comma-separated values</span>
                <input type="file" accept=".csv,text/csv" aria-label="Choose a CSV file of applications" className="sr-only" onChange={e => { onFile(e.target.files?.[0]); e.target.value = '' }} />
              </label>
            )}
            <p className="text-[12px] text-muted">The link needs “Anyone with the link can view” sharing. If your sheet is private, upload the CSV instead.</p>
          </>
        )}

        {error && <Notice tone="danger">{error}</Notice>}

        {preview && mapping && (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg bg-surface-2 px-4 py-3"><p className="text-2xl font-semibold tabular-nums">{preview.applicantRows}</p><p className="text-[12px] text-muted">applicants found</p></div>
              <div className="rounded-lg bg-surface-2 px-4 py-3"><p className="text-2xl font-semibold tabular-nums">{preview.emptyRows}</p><p className="text-[12px] text-muted">empty form submissions skipped</p></div>
              <div className="rounded-lg bg-surface-2 px-4 py-3"><p className="text-2xl font-semibold tabular-nums">{linkedCount}/{questions.length}</p><p className="text-[12px] text-muted">screening questions linked</p></div>
            </div>

            <div>
              <h3 className="text-sm font-semibold">1. Check the columns</h3>
              <p className="mb-3 text-[12px] text-muted">We matched these automatically. Change any that look wrong — the sample shows what’s in that column.</p>
              <div className="divide-y divide-line rounded-lg border border-line">
                {[...KEY_FIELDS, ...FIELDS.filter(f => !KEY_FIELDS.includes(f))].map(f => {
                  const col = mapping.fields[f] ?? ''
                  return (
                    <div key={f} className="grid gap-2 px-3 py-2.5 sm:grid-cols-[160px_1fr] sm:items-center">
                      <span className="text-[13px] font-medium">{FIELD_LABELS[f]}{(f === 'name' || f === 'email') && <span className="text-danger"> *</span>}</span>
                      <div className="min-w-0">
                        <Select value={col} onChange={e => setField(f, e.target.value)} aria-label={FIELD_LABELS[f]}>
                          <option value="">— Not in this sheet —</option>
                          {fieldOptions.map(h => <option key={h} value={h}>{h.length > 80 ? h.slice(0, 80) + '…' : h}</option>)}
                        </Select>
                        {col && preview.samples[col]?.length > 0 && <p className="mt-1 truncate text-[12px] text-faint">e.g. {preview.samples[col].join(' · ')}</p>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold">2. Link the screening questions</h3>
              <p className="mb-3 text-[12px] text-muted">Each of the role’s questions needs the sheet column holding its answers. Wording may differ slightly from your form — that’s fine.</p>
              <div className="space-y-2">
                {questions.map((q, i) => (
                  <div key={q.id} className="rounded-lg border border-line p-3">
                    <p className="text-[13px]"><Badge tone="accent">Q{i + 1}</Badge> <span className="ml-1">{q.text.length > 160 ? q.text.slice(0, 160) + '…' : q.text}</span></p>
                    <Select
                      className="mt-2"
                      value={links[q.id] ?? ''}
                      aria-label={`Answers column for question ${i + 1}`}
                      onChange={e => setLinks(l => {
                        const n = { ...l }
                        for (const k of Object.keys(n)) if (n[k] === e.target.value) delete n[k]
                        if (e.target.value) n[q.id] = e.target.value
                        else delete n[q.id]
                        return n
                      })}
                    >
                      <option value="">— Not answered in this sheet —</option>
                      {mapping.questionColumns.map(h => <option key={h} value={h}>{h.length > 100 ? h.slice(0, 100) + '…' : h}</option>)}
                    </Select>
                  </div>
                ))}
              </div>
              {linkedCount < questions.length && (
                <Notice tone="warn" className="mt-3">
                  {questions.length - linkedCount} question(s) have no answers column. Those questions will be skipped when scoring — candidates are scored only on what they actually answered.
                </Notice>
              )}
            </div>

            {mapping.ignoredColumns.length > 0 && (
              <p className="text-[12px] text-muted">Ignored as form metadata: {mapping.ignoredColumns.join(', ')}.</p>
            )}

            <p className="text-right text-[12px] text-muted">Importing checks everyone’s eligibility straight away.</p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" onClick={reset}>Start over</Button>
              <Button onClick={commit} disabled={pending || (!mapping.fields.name && !mapping.fields.email)}>
                {pending ? 'Importing…' : `Import ${preview.applicantRows} applicants`}
              </Button>
            </div>
          </div>
        )}

        {result && (
          <div className="space-y-3">
            <Notice tone="success" title="Import complete">
              {result.added} new applicant{result.added === 1 ? '' : 's'}{result.updated ? `, ${result.updated} updated` : ''}
              {result.duplicates ? `, ${result.duplicates} repeat application${result.duplicates === 1 ? '' : 's'} merged` : ''}
              {result.emptyRows ? `, ${result.emptyRows} empty submissions skipped` : ''}. Eligibility is already checked.
            </Notice>
            {result.needsGlance > 0 && (
              <Notice tone="warn">
                {result.needsGlance} applicant{result.needsGlance === 1 ? ' has' : 's have'} an answer we had to interpret (like a salary range or “2+ years”). See <a className="underline" href={`/roles/${roleId}/applicants/changes`}>What we changed</a>.
              </Notice>
            )}
            <div className="flex justify-end"><Button variant="secondary" onClick={reset}>Import another sheet</Button></div>
          </div>
        )}
      </div>
    </Card>
  )
}
