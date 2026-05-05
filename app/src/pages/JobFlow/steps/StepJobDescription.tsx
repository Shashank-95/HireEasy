import { useState, useRef } from 'react'
import { FileText, Upload, CheckCircle2, X, File } from 'lucide-react'
import { Job, useJobStore } from '../../../stores/jobStore'
import { extractTextFromPdf } from '../../../lib/pdfParser'

interface Props {
  job: Job
  onNext: () => void
}

export default function StepJobDescription({ job, onNext }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [parsed, setParsed] = useState(!!job.description)
  const [jdText, setJdText] = useState(job.description || '')
  const [loading, setLoading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const { updateJob } = useJobStore()

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0]
    if (!selected) return

    setFile(selected)
    setLoading(true)

    try {
      let text = ''
      if (selected.type === 'application/pdf') {
        text = await extractTextFromPdf(selected)
      } else {
        text = await selected.text()
      }

      setJdText(text)
      setParsed(true)
      updateJob(job.id, { jdFilePath: selected.name, description: text })
    } catch {
      setJdText(`[Content from ${selected.name}]`)
      setParsed(true)
      updateJob(job.id, { jdFilePath: selected.name, description: `[Content from ${selected.name}]` })
    } finally {
      setLoading(false)
    }
  }

  const handleRemoveFile = () => {
    setFile(null)
    setParsed(false)
    setJdText('')
    updateJob(job.id, { jdFilePath: undefined, description: undefined })
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const dropped = e.dataTransfer.files?.[0]
    if (dropped && dropped.type === 'application/pdf') {
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
        <h2 className="text-xl font-bold text-white mb-2">Upload Job Description</h2>
        <p className="text-sm text-white/40">
          Upload the job description in PDF format. This will be used to evaluate candidate fit against role requirements.
        </p>
      </div>

      <div className="glass-card p-6">
        {!file ? (
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
            <p className="text-xs text-white/30">PDF format recommended</p>
          </div>
        ) : (
          <div className="flex items-center justify-between p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center">
                <File size={18} className="text-red-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-white">{file.name}</p>
                <p className="text-xs text-white/40">{(file.size / 1024).toFixed(1)} KB · PDF</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {loading ? (
                <div className="w-4 h-4 border-2 border-brand-400/30 border-t-brand-400 rounded-full animate-spin" />
              ) : (
                <CheckCircle2 size={16} className="text-emerald-400" />
              )}
              <button onClick={handleRemoveFile} className="p-2 rounded-lg hover:bg-white/[0.06] transition-colors">
                <X size={14} className="text-white/40" />
              </button>
            </div>
          </div>
        )}

        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.txt,.doc,.docx"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {jdText && (
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <FileText size={14} className="text-brand-400" />
              <h3 className="text-sm font-medium text-white/70">Extracted Content</h3>
            </div>
            <span className="text-xs text-white/30">{jdText.length} characters</span>
          </div>
          <div className="max-h-48 overflow-y-auto rounded-lg bg-white/[0.02] p-4">
            <p className="text-xs text-white/50 leading-relaxed whitespace-pre-wrap">{jdText.slice(0, 2000)}{jdText.length > 2000 ? '...' : ''}</p>
          </div>
        </div>
      )}

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
