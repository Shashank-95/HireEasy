import { useState, useEffect, useRef } from 'react'
import { Plus, X, GripVertical, Sliders, AlertCircle, Sparkles, Loader2, RefreshCw } from 'lucide-react'
import { motion } from 'framer-motion'
import { Job, Skill, useJobStore } from '../../../stores/jobStore'
import { useSettingsStore } from '../../../stores/settingsStore'
import { extractSkillsFromJD } from '../../../lib/llm'
import { v4 as uuidv4 } from 'uuid'

interface Props {
  job: Job
  onNext: () => void
}

function SkillRow({ skill, onUpdate, onRemove }: { skill: Skill; onUpdate: (data: Partial<Skill>) => void; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.02] border border-white/[0.04] group">
      <GripVertical size={14} className="text-white/20 cursor-grab" />
      <input
        type="text"
        value={skill.name}
        onChange={(e) => onUpdate({ name: e.target.value })}
        placeholder="Skill name"
        className="flex-1 bg-transparent text-sm text-white placeholder-white/20 outline-none"
      />
      <div className="flex items-center gap-2 w-40">
        <input
          type="range"
          min={1}
          max={100}
          value={skill.weight}
          onChange={(e) => onUpdate({ weight: parseInt(e.target.value) })}
          className="flex-1 accent-brand-500 h-1"
        />
        <span className="text-xs text-white/40 w-8 text-right">{skill.weight}%</span>
      </div>
      <button
        onClick={onRemove}
        className="p-1.5 rounded-md opacity-0 group-hover:opacity-100 hover:bg-white/[0.06] transition-all"
      >
        <X size={12} className="text-white/40" />
      </button>
    </div>
  )
}

function SkillSection({ title, subtitle, skills, type, required, showWarning, onAdd, onUpdate, onRemove }: {
  title: string
  subtitle: string
  skills: Skill[]
  type: string
  required: boolean
  showWarning: boolean
  onAdd: () => void
  onUpdate: (id: string, data: Partial<Skill>) => void
  onRemove: (id: string) => void
}) {
  const totalWeight = skills.reduce((acc, s) => acc + s.weight, 0)
  const isValid = skills.length === 0 || totalWeight === 100

  return (
    <div className="glass-card p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-white">{title}</h3>
            {required && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 font-medium">REQUIRED</span>}
            {!required && <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] text-white/30 font-medium">OPTIONAL</span>}
          </div>
          <p className="text-xs text-white/40 mt-1">{subtitle}</p>
        </div>
        {skills.length > 0 && (
          <div className="flex items-center gap-1.5">
            <Sliders size={12} className={isValid ? 'text-emerald-400/60' : 'text-amber-400/60'} />
            <span className={`text-xs font-medium ${isValid ? 'text-emerald-400' : 'text-amber-400'}`}>
              Total: {totalWeight}%
            </span>
          </div>
        )}
      </div>

      <div className="space-y-2 mb-3">
        {skills.map(skill => (
          <SkillRow
            key={skill.id}
            skill={skill}
            onUpdate={(data) => onUpdate(skill.id, data)}
            onRemove={() => onRemove(skill.id)}
          />
        ))}
      </div>

      {showWarning && !isValid && skills.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 mb-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <AlertCircle size={13} className="text-amber-400 shrink-0" />
          <p className="text-xs text-amber-400">
            Adjust skill weights to total exactly 100% to proceed. Currently at {totalWeight}%.
          </p>
        </div>
      )}

      <button
        onClick={onAdd}
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-white/40 hover:text-white/60 hover:bg-white/[0.04] transition-all w-full justify-center border border-dashed border-white/[0.08]"
      >
        <Plus size={12} />
        Add Skill
      </button>
    </div>
  )
}

export default function StepSkills({ job, onNext }: Props) {
  const { updateJob } = useJobStore()
  const settings = useSettingsStore()
  const [techSkills, setTechSkills] = useState<Skill[]>(job.technicalSkills)
  const [nonTechSkills, setNonTechSkills] = useState<Skill[]>(job.nonTechSkills)
  const [behavioralSkills, setBehavioralSkills] = useState<Skill[]>(job.behavioralSkills)
  const [attempted, setAttempted] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [extractError, setExtractError] = useState('')
  const [extractedNotice, setExtractedNotice] = useState(false)
  const autoExtractAttempted = useRef(false)

  const handleExtractSkills = async (force = false) => {
    if (!job.description || job.description.trim().length < 50) {
      setExtractError('Job description is too short to extract skills accurately. Please upload a JD first.')
      return
    }
    if (!settings.isConfigured()) {
      setExtractError('Configure an LLM provider in Settings first.')
      return
    }

    // If force=false and skills already exist, don't overwrite
    if (!force && (techSkills.length > 0 || nonTechSkills.length > 0)) return

    setExtracting(true)
    setExtractError('')

    try {
      const extracted = await extractSkillsFromJD(job.title, job.description, job.department)

      const toSkill = (s: { name: string; weight: number }, type: Skill['type']): Skill => ({
        id: uuidv4(),
        name: s.name,
        weight: s.weight,
        type,
      })

      setTechSkills(extracted.technical.map(s => toSkill(s, 'technical')))
      setNonTechSkills(extracted.nonTechnical.map(s => toSkill(s, 'non-technical')))
      setBehavioralSkills(extracted.behavioral.map(s => toSkill(s, 'behavioral')))
      setExtractedNotice(true)
    } catch (err: any) {
      console.error('Skill extraction failed:', err)
      setExtractError(err.message || 'Failed to extract skills from JD. You can add them manually.')
    } finally {
      setExtracting(false)
    }
  }

  // Auto-extract on first mount if skills are empty AND we have a JD
  useEffect(() => {
    if (autoExtractAttempted.current) return
    if (techSkills.length > 0 || nonTechSkills.length > 0 || behavioralSkills.length > 0) return
    if (!job.description || job.description.trim().length < 50) return
    if (!settings.isConfigured()) return

    autoExtractAttempted.current = true
    handleExtractSkills(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const addSkill = (type: 'technical' | 'non-technical' | 'behavioral') => {
    const newSkill: Skill = { id: uuidv4(), name: '', weight: 25, type }
    if (type === 'technical') setTechSkills([...techSkills, newSkill])
    else if (type === 'non-technical') setNonTechSkills([...nonTechSkills, newSkill])
    else setBehavioralSkills([...behavioralSkills, newSkill])
  }

  const updateSkill = (type: string, id: string, data: Partial<Skill>) => {
    const updater = (skills: Skill[]) => skills.map(s => s.id === id ? { ...s, ...data } : s)
    if (type === 'technical') setTechSkills(updater(techSkills))
    else if (type === 'non-technical') setNonTechSkills(updater(nonTechSkills))
    else setBehavioralSkills(updater(behavioralSkills))
  }

  const removeSkill = (type: string, id: string) => {
    const filter = (skills: Skill[]) => skills.filter(s => s.id !== id)
    if (type === 'technical') setTechSkills(filter(techSkills))
    else if (type === 'non-technical') setNonTechSkills(filter(nonTechSkills))
    else setBehavioralSkills(filter(behavioralSkills))
  }

  const namedTech = techSkills.filter(s => s.name.trim())
  const namedNonTech = nonTechSkills.filter(s => s.name.trim())
  const namedBehavioral = behavioralSkills.filter(s => s.name.trim())

  const techTotal = namedTech.reduce((a, s) => a + s.weight, 0)
  const nonTechTotal = namedNonTech.reduce((a, s) => a + s.weight, 0)
  const behavioralTotal = namedBehavioral.reduce((a, s) => a + s.weight, 0)

  const techValid = namedTech.length > 0 && techTotal === 100
  const nonTechValid = namedNonTech.length > 0 && nonTechTotal === 100
  const behavioralValid = namedBehavioral.length === 0 || behavioralTotal === 100

  const canContinue = techValid && nonTechValid && behavioralValid

  const handleContinue = () => {
    if (!canContinue) {
      setAttempted(true)
      return
    }
    updateJob(job.id, {
      technicalSkills: namedTech,
      nonTechSkills: namedNonTech,
      behavioralSkills: namedBehavioral,
    })
    onNext()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white mb-2">Skills & Weightage</h2>
          <p className="text-sm text-white/40">
            Define the skills required for this role and assign weights. Each section must total exactly 100%.
          </p>
        </div>
        {job.description && job.description.trim().length > 50 && settings.isConfigured() && (
          <button
            onClick={() => handleExtractSkills(true)}
            disabled={extracting}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium bg-brand-500/10 hover:bg-brand-500/20 border border-brand-500/20 text-brand-300 transition-all disabled:opacity-50 shrink-0"
            title="Re-suggest skills from the job description"
          >
            {extracting ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            {extracting ? 'Analyzing JD…' : 'Re-suggest from JD'}
          </button>
        )}
      </div>

      {/* Extraction in progress */}
      {extracting && techSkills.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-6 flex items-center gap-4"
        >
          <div className="w-10 h-10 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center shrink-0">
            <Sparkles size={18} className="text-brand-400 animate-pulse" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-white">Analyzing job description...</p>
            <p className="text-xs text-white/40 mt-0.5">
              AI is extracting the most critical technical, non-technical, and behavioral skills with weighted importance.
            </p>
          </div>
          <Loader2 size={16} className="text-brand-400 animate-spin" />
        </motion.div>
      )}

      {/* Extraction success notice */}
      {extractedNotice && !extracting && (techSkills.length > 0 || nonTechSkills.length > 0) && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-3 p-4 rounded-xl bg-brand-500/[0.06] border border-brand-500/20"
        >
          <Sparkles size={16} className="text-brand-400 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm text-brand-200">Skills auto-extracted from your job description</p>
            <p className="text-xs text-white/40 mt-0.5">
              Weights reflect each skill's importance based on the JD. Edit, add, or remove skills as needed — your customization will be saved.
            </p>
          </div>
          <button
            onClick={() => setExtractedNotice(false)}
            className="text-white/30 hover:text-white/60 transition-colors"
          >
            <X size={14} />
          </button>
        </motion.div>
      )}

      {/* Extraction error */}
      {extractError && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <AlertCircle size={14} className="text-amber-400 shrink-0" />
          <p className="text-xs text-amber-400">{extractError}</p>
        </div>
      )}

      <SkillSection
        title="Critical Technical Skills"
        subtitle="Hard skills and technical competencies required for the role"
        skills={techSkills}
        type="technical"
        required={true}
        showWarning={attempted}
        onAdd={() => addSkill('technical')}
        onUpdate={(id, data) => updateSkill('technical', id, data)}
        onRemove={(id) => removeSkill('technical', id)}
      />

      <SkillSection
        title="Critical Non-Technical Skills"
        subtitle="Soft skills, communication, and interpersonal abilities"
        skills={nonTechSkills}
        type="non-technical"
        required={true}
        showWarning={attempted}
        onAdd={() => addSkill('non-technical')}
        onUpdate={(id, data) => updateSkill('non-technical', id, data)}
        onRemove={(id) => removeSkill('non-technical', id)}
      />

      <SkillSection
        title="Behavioral Skills"
        subtitle="Cultural fit, work ethic, and behavioral traits"
        skills={behavioralSkills}
        type="behavioral"
        required={false}
        showWarning={attempted}
        onAdd={() => addSkill('behavioral')}
        onUpdate={(id, data) => updateSkill('behavioral', id, data)}
        onRemove={(id) => removeSkill('behavioral', id)}
      />

      <div className="flex justify-end">
        <button
          onClick={handleContinue}
          disabled={attempted && !canContinue}
          className="btn-primary disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Start L1 Screening
        </button>
      </div>
    </div>
  )
}
