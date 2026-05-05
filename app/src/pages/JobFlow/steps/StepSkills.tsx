import { useState } from 'react'
import { Plus, X, GripVertical, Sliders, AlertCircle } from 'lucide-react'
import { Job, Skill, useJobStore } from '../../../stores/jobStore'
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
  const [techSkills, setTechSkills] = useState<Skill[]>(job.technicalSkills)
  const [nonTechSkills, setNonTechSkills] = useState<Skill[]>(job.nonTechSkills)
  const [behavioralSkills, setBehavioralSkills] = useState<Skill[]>(job.behavioralSkills)
  const [attempted, setAttempted] = useState(false)

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
      <div>
        <h2 className="text-xl font-bold text-white mb-2">Skills & Weightage</h2>
        <p className="text-sm text-white/40">
          Define the skills required for this role and assign weights. Each section must total exactly 100%.
        </p>
      </div>

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
