'use client'
import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, MessageCircle, Plus, Trash2 } from 'lucide-react'
import type { AiRound, HumanRound, InterviewQuestion, Rubric, RoleSpec, ScreeningQuestion, Skill } from '@/lib/templates/types'
import { LIMITS } from '@/lib/templates/types'
import { checkReadiness, type ReadinessIssue } from '@/lib/templates/readiness'
import { Badge, Button, Card, cx, Field, Input, Notice, Select, Textarea } from '@/components/ui'

type SaveResult = { error?: string; ok?: string }

const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}`

const SECTIONS = [
  { id: 'basics', label: 'Basics' },
  { id: 'eligibility', label: 'Eligibility' },
  { id: 'responsibilities', label: 'Responsibilities' },
  { id: 'skills', label: 'Skills' },
  { id: 'screening', label: 'Screening questions' },
  { id: 'interviews', label: 'Interview plan' },
  { id: 'colleges', label: 'Preferred colleges' },
] as const

const ISSUE_SECTION: Record<string, string> = {
  Basics: 'basics',
  Eligibility: 'eligibility',
  Responsibilities: 'responsibilities',
  'Must-haves': 'skills',
  'Good-to-haves': 'skills',
  'Screening questions': 'screening',
  'Interview plan': 'interviews',
  'Interview rounds': 'interviews',
}

export function SpecEditor({ initial, onSave, readOnly = false, forTemplate = false, extraDirty = false, onDiscard }: { initial: RoleSpec; onSave: (spec: RoleSpec) => Promise<SaveResult>; readOnly?: boolean; forTemplate?: boolean; extraDirty?: boolean; onDiscard?: () => void }) {
  const [spec, setSpec] = useState<RoleSpec>(initial)
  const [saved, setSaved] = useState(JSON.stringify(initial))
  const [result, setResult] = useState<SaveResult | null>(null)
  const [pending, start] = useTransition()
  const dirty = JSON.stringify(spec) !== saved || extraDirty
  const issues = useMemo(() => checkReadiness(spec, { forTemplate }), [spec, forTemplate])

  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const set = (fn: (s: RoleSpec) => void) =>
    setSpec(prev => {
      const next = structuredClone(prev)
      fn(next)
      return next
    })

  const save = () =>
    start(async () => {
      const r = await onSave(spec)
      setResult(r)
      if (!r.error) setSaved(JSON.stringify(spec))
    })

  const props = { spec, set, readOnly }

  return (
    <div className={cx('lg:grid lg:grid-cols-[1fr_300px] lg:gap-8', !readOnly && 'pb-20')}>
      <div className="min-w-0 space-y-6">
        <nav className="-mx-1 flex gap-1 overflow-x-auto pb-1 lg:hidden">
          {SECTIONS.map(s => (
            <a key={s.id} href={`#${s.id}`} className="shrink-0 rounded-full border border-line bg-surface px-3 py-1 text-[12px] text-muted">{s.label}</a>
          ))}
        </nav>
        <BasicsSection {...props} />
        <EligibilitySection {...props} />
        <ResponsibilitiesSection {...props} />
        <SkillsSection {...props} />
        <ScreeningSection {...props} />
        <InterviewPlanSection {...props} />
        <CollegesSection {...props} />
      </div>

      <aside className="mt-6 lg:mt-0">
        {/* Sticky, but never taller than the space above the save bar */}
        <div className={cx('space-y-4 lg:sticky lg:top-6 lg:flex lg:flex-col lg:space-y-0 lg:gap-4', readOnly ? 'lg:max-h-[calc(100dvh-3rem)]' : 'lg:max-h-[calc(100dvh-7.5rem)]')}>
          <Readiness issues={issues} forTemplate={forTemplate} />
          <nav className="hidden shrink-0 rounded-xl border border-line bg-surface p-2 lg:block">
            {SECTIONS.map(s => (
              <a key={s.id} href={`#${s.id}`} className="block rounded-md px-2.5 py-1.5 text-[13px] text-muted hover:bg-surface-2 hover:text-ink">{s.label}</a>
            ))}
          </nav>
        </div>
      </aside>

      {!readOnly && (
        <div data-savebar className="fixed inset-x-0 bottom-14 z-20 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur lg:bottom-0 lg:left-60">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 lg:px-6">
            <p className="min-w-0 truncate text-[13px] text-muted">
              {result?.error ? <span className="text-danger">{result.error}</span> : dirty ? 'Unsaved changes' : result?.ok ?? 'All changes saved'}
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => window.dispatchEvent(new Event('hireeasy:ask'))} aria-label="Ask HireEasy"><MessageCircle size={16} /><span className="hidden sm:inline">Ask</span></Button>
              {dirty && <Button variant="ghost" onClick={() => { setSpec(JSON.parse(saved)); onDiscard?.() }}>Discard</Button>}
              <Button onClick={save} disabled={!dirty || pending}>{pending ? 'Saving…' : 'Save changes'}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ───────────────────────── readiness ───────────────────────── */

function Readiness({ issues, forTemplate }: { issues: ReadinessIssue[]; forTemplate: boolean }) {
  const blocks = issues.filter(i => i.severity === 'block')
  const warns = issues.filter(i => i.severity === 'warn')
  // The list scrolls inside the sticky column; say so when items are hidden below
  const listRef = useRef<HTMLUListElement>(null)
  const [moreBelow, setMoreBelow] = useState(false)
  useEffect(() => {
    const el = listRef.current
    if (!el) return
    const check = () => setMoreBelow(el.scrollHeight - el.scrollTop - el.clientHeight > 4)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    el.addEventListener('scroll', check, { passive: true })
    return () => {
      ro.disconnect()
      el.removeEventListener('scroll', check)
    }
  }, [issues.length])
  return (
    <Card className="p-4 lg:flex lg:min-h-0 lg:flex-col">
      <div className="flex items-center gap-2">
        {blocks.length ? <AlertTriangle size={16} className="text-danger" /> : <CheckCircle2 size={16} className="text-success" />}
        <p className="text-sm font-semibold">{blocks.length ? `${blocks.length} to fix ${forTemplate ? 'before using this template' : 'before going live'}` : forTemplate ? 'Template is complete' : 'Ready to go live'}</p>
      </div>
      <p className="mt-1 text-[12px] text-muted">The checklist keeps every role consistent so the AI scores fairly.</p>
      {issues.length > 0 && (
        <ul ref={listRef} className="mt-3 max-h-[50vh] space-y-2 overflow-y-auto overscroll-contain lg:max-h-none lg:min-h-0 lg:flex-1">
          {[...blocks, ...warns].map((i, k) => (
            <li key={k}>
              <a href={`#${ISSUE_SECTION[i.section] ?? 'basics'}`} className="block rounded-lg bg-surface-2 px-3 py-2 text-[12px] hover:brightness-95">
                <span className="flex items-center gap-1.5 font-medium">
                  <Badge tone={i.severity === 'block' ? 'danger' : 'warn'}>{i.severity === 'block' ? 'Fix' : 'Check'}</Badge>
                  {i.section}
                </span>
                <span className="mt-1 block text-ink">{i.message}</span>
                <span className="mt-0.5 block text-muted">{i.fix}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
      {moreBelow && <p className="mt-2 shrink-0 text-center text-[12px] text-muted">More below — scroll the list ↓</p>}
    </Card>
  )
}

/* ───────────────────────── shared bits ───────────────────────── */

interface SectionProps {
  spec: RoleSpec
  set: (fn: (s: RoleSpec) => void) => void
  readOnly: boolean
}

function Section({ id, title, help, children }: { id: string; title: string; help: ReactNode; children: ReactNode }) {
  return (
    <Card id={id} className="scroll-mt-24 p-5">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      <p className="mb-4 mt-0.5 text-[13px] text-muted">{help}</p>
      <fieldset className="space-y-4">{children}</fieldset>
    </Card>
  )
}

function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx('relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50', checked ? 'bg-accent' : 'bg-line')}
    >
      <span className={cx('absolute left-0 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-[22px]' : 'translate-x-0.5')} />
    </button>
  )
}

const num = (v: string, fallback = 0) => (v === '' || Number.isNaN(Number(v)) ? fallback : Number(v))

/**
 * Keeps what the person typed (including an empty box mid-edit); only a real
 * number is committed. Clearing "150" to type "200" no longer snaps to the minimum.
 */
function NumberInput({ value, onChange, min, max, step, suffix, disabled }: { value: number; onChange: (n: number) => void; min?: number; max?: number; step?: number; suffix?: string; disabled?: boolean }) {
  const shown = Number.isFinite(value) ? String(value) : ''
  const [text, setText] = useState(shown)
  const [synced, setSynced] = useState(shown)
  if (shown !== synced) {
    // Changed from outside (Discard, another control): show the new value
    setSynced(shown)
    if (num(text, NaN) !== value) setText(shown)
  }
  return (
    <div className="relative">
      <Input
        type="number"
        inputMode="decimal"
        value={text}
        min={min}
        max={max}
        step={step ?? 'any'}
        disabled={disabled}
        onChange={e => {
          setText(e.target.value)
          const n = num(e.target.value, NaN)
          if (Number.isFinite(n)) onChange(n)
        }}
        onBlur={() => {
          if (!Number.isFinite(num(text, NaN))) setText(shown)
        }}
        className={suffix ? 'pr-14' : ''}
      />
      {suffix && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[12px] text-faint">{suffix}</span>}
    </div>
  )
}

/** Comma-separated list that keeps your typing (commas, spaces) and parses it as you go. */
function ListInput({ value, onChange, disabled, placeholder }: { value: string[]; onChange: (v: string[]) => void; disabled?: boolean; placeholder?: string }) {
  const parse = (t: string) => t.split(',').map(x => x.trim()).filter(Boolean)
  const joined = value.join(', ')
  const [text, setText] = useState(joined)
  const [synced, setSynced] = useState(joined)
  if (joined !== synced) {
    setSynced(joined)
    if (parse(text).join(', ') !== joined) setText(joined)
  }
  return (
    <Input
      value={text}
      disabled={disabled}
      placeholder={placeholder}
      onChange={e => {
        setText(e.target.value)
        const v = parse(e.target.value)
        setSynced(v.join(', '))
        onChange(v)
      }}
      onBlur={() => setText(joined)}
    />
  )
}

function IconButton({ onClick, label, children, disabled }: { onClick: () => void; label: string; children: ReactNode; disabled?: boolean }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled} className="rounded-md p-1.5 text-faint hover:bg-surface-2 hover:text-ink disabled:opacity-30">
      {children}
    </button>
  )
}

function RubricEditor({ rubric, onChange, disabled, spoken }: { rubric: Rubric; onChange: (r: Rubric) => void; disabled?: boolean; spoken?: boolean }) {
  const labels = { 1: 'Weak (1)', 3: 'Average (3)', 5: 'Strong (5)' } as const
  return (
    <div className="rounded-lg border border-line bg-surface-2/50 p-3">
      <p className="mb-2 text-[12px] font-medium text-ink">Answer key</p>
      <p className="mb-3 text-[12px] text-muted">Describe what each level {spoken ? 'sounds' : 'looks'} like. The AI scores every candidate against these — be concrete.</p>
      <div className="grid gap-3 md:grid-cols-3">
        {([1, 3, 5] as const).map(k => (
          <Field key={k} label={labels[k]}>
            <Textarea rows={4} value={rubric[k]} disabled={disabled} onChange={e => onChange({ ...rubric, [k]: e.target.value })} />
          </Field>
        ))}
      </div>
    </div>
  )
}

function SkillPicker({ skills, value, onChange, max, disabled }: { skills: Skill[]; value: string[]; onChange: (ids: string[]) => void; max?: number; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {skills.map(s => {
        const on = value.includes(s.id)
        const full = !on && max !== undefined && value.length >= max
        return (
          <button
            key={s.id}
            type="button"
            disabled={disabled || full}
            onClick={() => onChange(on ? value.filter(v => v !== s.id) : [...value, s.id])}
            className={cx('rounded-full border px-2.5 py-1 text-[12px] transition-colors disabled:opacity-40', on ? 'border-accent bg-accent-soft text-accent-text' : 'border-line text-muted hover:text-ink')}
          >
            {s.name || 'Unnamed skill'}
          </button>
        )
      })}
      {skills.length === 0 && <span className="text-[12px] text-faint">Add skills first.</span>}
    </div>
  )
}

/* ───────────────────────── sections ───────────────────────── */

function BasicsSection({ spec, set, readOnly }: SectionProps) {
  const b = spec.basics
  return (
    <Section id="basics" title="Basics" help="What the role is. The level sets expectations for the AI's scoring.">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Job title"><Input value={b.title} disabled={readOnly} onChange={e => set(s => void (s.basics.title = e.target.value))} /></Field>
        <Field label="Team"><Input value={b.team} disabled={readOnly} onChange={e => set(s => void (s.basics.team = e.target.value))} /></Field>
        <Field label="Level">
          <Select value={b.level} disabled={readOnly} onChange={e => set(s => void (s.basics.level = e.target.value as RoleSpec['basics']['level']))}>
            <option value="intern">Intern</option>
            <option value="entry">Entry (0–2 yrs)</option>
            <option value="mid">Mid (2–5 yrs)</option>
            <option value="senior">Senior (5–8 yrs)</option>
            <option value="lead">Lead (8+ yrs)</option>
          </Select>
        </Field>
        <Field label="Employment type">
          <Select value={b.employmentType} disabled={readOnly} onChange={e => set(s => void (s.basics.employmentType = e.target.value as RoleSpec['basics']['employmentType']))}>
            <option value="full_time">Full-time</option>
            <option value="internship">Internship</option>
            <option value="contract">Contract</option>
          </Select>
        </Field>
        <Field label="Work mode">
          <Select value={b.workMode} disabled={readOnly} onChange={e => set(s => void (s.basics.workMode = e.target.value as RoleSpec['basics']['workMode']))}>
            <option value="remote">Remote</option>
            <option value="hybrid">Hybrid</option>
            <option value="onsite">On-site</option>
          </Select>
        </Field>
        <Field label="City" hint={b.workMode === 'remote' ? 'Optional for remote roles.' : undefined}>
          <Input value={b.city} disabled={readOnly} onChange={e => set(s => void (s.basics.city = e.target.value))} placeholder="e.g. Bengaluru" />
        </Field>
      </div>
      <Field label="The opportunity" hint="Two or three lines on why the role exists. Shown at the top of the job description.">
        <Textarea rows={3} value={spec.opportunity} disabled={readOnly} onChange={e => set(s => void (s.opportunity = e.target.value))} />
      </Field>
    </Section>
  )
}

function CriterionCard({ title, enabled, onToggle, action, onAction, children, readOnly, summary }: { title: string; enabled: boolean; onToggle: (v: boolean) => void; action: 'exclude' | 'review'; onAction: (a: 'exclude' | 'review') => void; children: ReactNode; readOnly: boolean; summary?: string }) {
  return (
    <div className={cx('rounded-lg border p-4', enabled ? 'border-line' : 'border-dashed border-line opacity-80')}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{title}</p>
          {enabled && summary && <p className="text-[12px] text-muted">{summary}</p>}
        </div>
        <Toggle checked={enabled} onChange={onToggle} label={`Check ${title.toLowerCase()}`} disabled={readOnly} />
      </div>
      {enabled && (
        <div className="mt-4 space-y-4">
          {children}
          <Field label="If a candidate is outside the range" hint="Out-of-range candidates are listed with the exact reason and can be restored in one click.">
            <Select value={action} disabled={readOnly} onChange={e => onAction(e.target.value as 'exclude' | 'review')}>
              <option value="exclude">Exclude them automatically</option>
              <option value="review">Hold them for someone to review</option>
            </Select>
          </Field>
        </div>
      )}
    </div>
  )
}

function EligibilitySection({ spec, set, readOnly }: SectionProps) {
  const { budget, experience, notice, location } = spec.eligibility
  const total = budget.fixedLpa + budget.variableLpa
  const base = budget.compareAgainst === 'fixed' ? budget.fixedLpa : total
  const limit = Math.round(base * (1 + budget.tolerancePct / 100) * 100) / 100
  const expUpper = experience.maxYears === null ? null : Math.round(experience.maxYears * (1 + experience.tolerancePct / 100) * 10) / 10
  const noticeLimit = Math.round(notice.maxDays * (1 + notice.tolerancePct / 100))
  return (
    <Section id="eligibility" title="Eligibility" help="Hard limits checked before any AI scoring. Every number here is yours to set — tolerance lets near-misses through.">
      <CriterionCard
        title="Budget"
        enabled={budget.enabled}
        readOnly={readOnly}
        summary={total > 0 ? `Accepts expected CTC up to ₹${limit} L (${budget.tolerancePct}% over ₹${base} L)` : 'Enter the budget'}
        onToggle={v => set(s => void (s.eligibility.budget.enabled = v))}
        action={budget.action}
        onAction={a => set(s => void (s.eligibility.budget.action = a))}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Fixed pay" hint="Per year, in lakhs."><NumberInput value={budget.fixedLpa} min={0} suffix="LPA" disabled={readOnly} onChange={n => set(s => void (s.eligibility.budget.fixedLpa = n))} /></Field>
          <Field label="Variable pay" hint="Bonus or incentives, per year."><NumberInput value={budget.variableLpa} min={0} suffix="LPA" disabled={readOnly} onChange={n => set(s => void (s.eligibility.budget.variableLpa = n))} /></Field>
          <Field label="Compare the candidate's ask against">
            <Select value={budget.compareAgainst} disabled={readOnly} onChange={e => set(s => void (s.eligibility.budget.compareAgainst = e.target.value as 'total' | 'fixed'))}>
              <option value="total">Total CTC (fixed + variable)</option>
              <option value="fixed">Fixed pay only</option>
            </Select>
          </Field>
          <Field label="Tolerance" hint="How far over budget is still OK."><NumberInput value={budget.tolerancePct} min={0} max={50} suffix="%" disabled={readOnly} onChange={n => set(s => void (s.eligibility.budget.tolerancePct = Math.min(50, n)))} /></Field>
        </div>
        <p className="text-[12px] text-muted">Salaries typed as ranges are judged on their lowest figure. Unclear answers (“18”, “as per norms”) are never excluded automatically.</p>
      </CriterionCard>

      <CriterionCard
        title="Experience"
        enabled={experience.enabled}
        readOnly={readOnly}
        summary={`${experience.minYears}–${experience.maxYears ?? '∞'} yrs${expUpper !== null ? `, accepts up to ${expUpper} yrs` : ''}`}
        onToggle={v => set(s => void (s.eligibility.experience.enabled = v))}
        action={experience.action}
        onAction={a => set(s => void (s.eligibility.experience.action = a))}
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Minimum"><NumberInput value={experience.minYears} min={0} suffix="yrs" disabled={readOnly} onChange={n => set(s => void (s.eligibility.experience.minYears = n))} /></Field>
          <Field label="Maximum" hint="Leave blank for no upper limit.">
            <Input type="number" min={0} value={experience.maxYears ?? ''} disabled={readOnly} onChange={e => set(s => void (s.eligibility.experience.maxYears = e.target.value === '' ? null : num(e.target.value)))} />
          </Field>
          <Field label="Tolerance"><NumberInput value={experience.tolerancePct} min={0} max={50} suffix="%" disabled={readOnly} onChange={n => set(s => void (s.eligibility.experience.tolerancePct = Math.min(50, n)))} /></Field>
        </div>
        <p className="text-[12px] text-muted">Open answers like “2+ years” aren’t excluded from the form alone — actual years are read from the resume.</p>
      </CriterionCard>

      <CriterionCard
        title="Notice period"
        enabled={notice.enabled}
        readOnly={readOnly}
        summary={`Up to ${notice.maxDays} days, accepts up to ${noticeLimit}`}
        onToggle={v => set(s => void (s.eligibility.notice.enabled = v))}
        action={notice.action}
        onAction={a => set(s => void (s.eligibility.notice.action = a))}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Longest acceptable notice"><NumberInput value={notice.maxDays} min={0} suffix="days" disabled={readOnly} onChange={n => set(s => void (s.eligibility.notice.maxDays = n))} /></Field>
          <Field label="Tolerance"><NumberInput value={notice.tolerancePct} min={0} max={50} suffix="%" disabled={readOnly} onChange={n => set(s => void (s.eligibility.notice.tolerancePct = Math.min(50, n)))} /></Field>
        </div>
      </CriterionCard>

      <CriterionCard
        title="Location"
        enabled={location.enabled}
        readOnly={readOnly}
        summary={location.allowed.length ? `Accepts: ${location.allowed.join(', ')}` : 'Add locations'}
        onToggle={v => set(s => void (s.eligibility.location.enabled = v))}
        action={location.action}
        onAction={a => set(s => void (s.eligibility.location.action = a))}
      >
        <Field label="Accepted countries or cities" hint="Comma-separated, e.g. India, Bengaluru. Matched as whole words.">
          <ListInput value={location.allowed} disabled={readOnly} placeholder="e.g. Bengaluru, Pune, Remote" onChange={v => set(s => void (s.eligibility.location.allowed = v))} />
        </Field>
      </CriterionCard>
    </Section>
  )
}

function ResponsibilitiesSection({ spec, set, readOnly }: SectionProps) {
  const total = spec.responsibilities.reduce((n, r) => n + r.bullets.filter(Boolean).length, 0)
  return (
    <Section id="responsibilities" title="Responsibilities" help={`Group the work into a few themes. ${LIMITS.responsibilities.min}–${LIMITS.responsibilities.max} bullets in total keeps the JD scannable (now ${total}).`}>
      {spec.responsibilities.map((r, i) => (
        <div key={i} className="rounded-lg border border-line p-3">
          <div className="flex items-center gap-2">
            <Input value={r.theme} placeholder="Theme, e.g. Data and research" disabled={readOnly} onChange={e => set(s => void (s.responsibilities[i].theme = e.target.value))} />
            {!readOnly && <IconButton label="Remove theme" onClick={() => set(s => void s.responsibilities.splice(i, 1))}><Trash2 size={15} /></IconButton>}
          </div>
          <Textarea
            className="mt-2"
            rows={Math.max(2, r.bullets.length + 1)}
            value={r.bullets.join('\n')}
            disabled={readOnly}
            placeholder="One responsibility per line"
            onChange={e => set(s => void (s.responsibilities[i].bullets = e.target.value.split('\n')))}
            onBlur={() => set(s => void (s.responsibilities[i].bullets = s.responsibilities[i].bullets.map(b => b.trim()).filter(Boolean)))}
          />
        </div>
      ))}
      {!readOnly && (
        <Button variant="secondary" size="sm" onClick={() => set(s => void s.responsibilities.push({ theme: '', bullets: [] }))}><Plus size={14} /> Add theme</Button>
      )}
    </Section>
  )
}

function SkillRow({ skill, onChange, onRemove, onMove, moveLabel, readOnly }: { skill: Skill; onChange: (s: Skill) => void; onRemove: () => void; onMove: () => void; moveLabel: string; readOnly: boolean }) {
  const toggle = (k: Skill['assessedBy'][number]) =>
    onChange({ ...skill, assessedBy: skill.assessedBy.includes(k) ? skill.assessedBy.filter(x => x !== k) : [...skill.assessedBy, k] })
  return (
    <div className="rounded-lg border border-line p-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
        <Input value={skill.name} placeholder="Skill name, e.g. SQL" disabled={readOnly} onChange={e => onChange({ ...skill, name: e.target.value })} />
        <Select value={skill.importance} disabled={readOnly} onChange={e => onChange({ ...skill, importance: e.target.value as Skill['importance'] })} aria-label="Importance">
          <option value="high">High importance</option>
          <option value="medium">Medium importance</option>
          <option value="low">Low importance</option>
        </Select>
      </div>
      <Input className="mt-2" value={skill.description} placeholder="What “good” looks like for this role" disabled={readOnly} onChange={e => onChange({ ...skill, description: e.target.value })} />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
          <span className="text-muted">Checked in:</span>
          {(['screening', 'resume', 'interview'] as const).map(k => (
            <button
              key={k}
              type="button"
              disabled={readOnly}
              onClick={() => toggle(k)}
              className={cx('rounded-full border px-2.5 py-0.5', skill.assessedBy.includes(k) ? 'border-accent bg-accent-soft text-accent-text' : 'border-line text-muted')}
            >
              {k === 'screening' ? 'Screening answers' : k === 'resume' ? 'Resume' : 'AI interview'}
            </button>
          ))}
        </div>
        {!readOnly && (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={onMove}>{moveLabel}</Button>
            <IconButton label="Remove skill" onClick={onRemove}><Trash2 size={15} /></IconButton>
          </div>
        )}
      </div>
    </div>
  )
}

function SkillsSection({ spec, set, readOnly }: SectionProps) {
  const unlink = (s: RoleSpec, id: string) => {
    s.screeningQuestions.forEach(q => (q.skillIds = q.skillIds.filter(x => x !== id)))
    s.interviewRounds.forEach(r => r.kind === 'ai' && r.questions.forEach(q => (q.skillIds = q.skillIds.filter(x => x !== id))))
  }
  const list = (key: 'mustHaves' | 'goodToHaves', other: 'mustHaves' | 'goodToHaves', moveLabel: string) =>
    spec[key].map((sk, i) => (
      <SkillRow
        key={sk.id}
        skill={sk}
        readOnly={readOnly}
        moveLabel={moveLabel}
        onChange={v => set(s => void (s[key][i] = v))}
        onRemove={() => set(s => { unlink(s, sk.id); s[key].splice(i, 1) })}
        onMove={() => set(s => { const [m] = s[key].splice(i, 1); s[other].push(m) })}
      />
    ))
  return (
    <Section id="skills" title="Skills" help="Every skill must say where it's checked. A skill nobody checks gives every candidate the same score and just adds noise.">
      <div>
        <h3 className="mb-2 text-[13px] font-semibold">Must-haves <span className="font-normal text-muted">({LIMITS.mustHaves.min}–{LIMITS.mustHaves.max})</span></h3>
        <div className="space-y-3">{list('mustHaves', 'goodToHaves', 'Make good-to-have')}</div>
        {!readOnly && (
          <Button className="mt-3" variant="secondary" size="sm" onClick={() => set(s => void s.mustHaves.push({ id: uid('skill'), name: '', description: '', importance: 'medium', assessedBy: ['screening'] }))}>
            <Plus size={14} /> Add must-have
          </Button>
        )}
      </div>
      <div className="border-t border-line pt-4">
        <h3 className="mb-2 text-[13px] font-semibold">Good-to-haves <span className="font-normal text-muted">(up to {LIMITS.goodToHaves.max}, count half as much)</span></h3>
        <div className="space-y-3">{list('goodToHaves', 'mustHaves', 'Make must-have')}</div>
        {!readOnly && (
          <Button className="mt-3" variant="secondary" size="sm" onClick={() => set(s => void s.goodToHaves.push({ id: uid('skill'), name: '', description: '', importance: 'low', assessedBy: ['resume'] }))}>
            <Plus size={14} /> Add good-to-have
          </Button>
        )}
      </div>
    </Section>
  )
}

function ScreeningSection({ spec, set, readOnly }: SectionProps) {
  const skills = [...spec.mustHaves, ...spec.goodToHaves]
  const blank = (): ScreeningQuestion => ({ id: uid('q'), text: '', wordLimit: 100, skillIds: [], importance: 'medium', rubric: { 1: '', 3: '', 5: '' } })
  return (
    <Section
      id="screening"
      title="Screening questions"
      help={`${LIMITS.screeningQuestions.min}–${LIMITS.screeningQuestions.max} scenario questions on the application form. Each tests 1–2 skills and has an answer key, so every candidate is judged by the same standard.`}
    >
      {spec.screeningQuestions.map((q, i) => (
        <div key={q.id} className="rounded-lg border border-line p-4">
          <div className="mb-2 flex items-center justify-between">
            <Badge tone="accent">Question {i + 1}</Badge>
            {!readOnly && (
              <div className="flex">
                <IconButton label="Move up" disabled={i === 0} onClick={() => set(s => void s.screeningQuestions.splice(i - 1, 0, ...s.screeningQuestions.splice(i, 1)))}><ChevronUp size={15} /></IconButton>
                <IconButton label="Move down" disabled={i === spec.screeningQuestions.length - 1} onClick={() => set(s => void s.screeningQuestions.splice(i + 1, 0, ...s.screeningQuestions.splice(i, 1)))}><ChevronDown size={15} /></IconButton>
                <IconButton label="Remove question" onClick={() => set(s => void s.screeningQuestions.splice(i, 1))}><Trash2 size={15} /></IconButton>
              </div>
            )}
          </div>
          <Textarea rows={3} value={q.text} disabled={readOnly} placeholder="A realistic scenario the candidate must reason through" onChange={e => set(s => void (s.screeningQuestions[i].text = e.target.value))} />
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Word limit"><NumberInput value={q.wordLimit} min={30} max={300} suffix="words" disabled={readOnly} onChange={n => set(s => void (s.screeningQuestions[i].wordLimit = Math.round(n)))} /></Field>
            <Field label="Importance">
              <Select value={q.importance} disabled={readOnly} onChange={e => set(s => void (s.screeningQuestions[i].importance = e.target.value as Skill['importance']))}>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </Select>
            </Field>
          </div>
          <div className="mt-3">
            <p className="mb-1.5 text-[13px] font-medium">Tests these skills <span className="font-normal text-muted">(pick 1–2)</span></p>
            <SkillPicker skills={skills} value={q.skillIds} max={2} disabled={readOnly} onChange={ids => set(s => void (s.screeningQuestions[i].skillIds = ids))} />
          </div>
          <div className="mt-3">
            <RubricEditor rubric={q.rubric} disabled={readOnly} onChange={r => set(s => void (s.screeningQuestions[i].rubric = r))} />
          </div>
        </div>
      ))}
      {!readOnly && <Button variant="secondary" size="sm" onClick={() => set(s => void s.screeningQuestions.push(blank()))}><Plus size={14} /> Add question</Button>}
      <Notice tone="info" title="Questions must also be on your application form">
        Use the exact wording in Typeform (see the “Application form” card). Imported answers are linked to these questions automatically.
      </Notice>
    </Section>
  )
}

function AdvanceRuleFields({ rule, onChange, disabled, what }: { rule: { minScore: number; maxAdvance: number }; onChange: (r: { minScore: number; maxAdvance: number }) => void; disabled?: boolean; what: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Score bar" hint="0–100. Candidates just under the bar still go through for a closer look.">
        <NumberInput value={rule.minScore} min={0} max={100} disabled={disabled} onChange={n => onChange({ ...rule, minScore: Math.min(100, Math.max(0, Math.round(n))) })} />
      </Field>
      <Field label={`Most who can move to ${what}`} hint="The best scorers above the bar, up to this many. The rest are waitlisted.">
        <NumberInput value={rule.maxAdvance} min={1} disabled={disabled} onChange={n => onChange({ ...rule, maxAdvance: Math.max(1, Math.round(n)) })} />
      </Field>
    </div>
  )
}

function InterviewPlanSection({ spec, set, readOnly }: SectionProps) {
  const skills = [...spec.mustHaves, ...spec.goodToHaves]
  const rounds = spec.interviewRounds
  const nextName = (i: number) => (rounds[i + 1] ? rounds[i + 1].name : 'the final decision')
  const newAi = (): AiRound => ({
    kind: 'ai',
    id: uid('ai'),
    name: `AI round ${rounds.filter(r => r.kind === 'ai').length + 1}`,
    questions: [],
    maxFollowUps: 1,
    deadlineHours: 72,
    reminderHoursBefore: 24,
    advance: { minScore: 70, maxAdvance: 10 },
  })
  const newHuman = (): HumanRound => ({ kind: 'human', id: uid('hm'), name: 'Interview with the hiring manager', interviewerEmails: [], durationMin: 45 })
  const blankQ = (): InterviewQuestion => ({ id: uid('iq'), text: '', skillIds: [], timeLimitSec: 120, rubric: { 1: '', 3: '', 5: '' } })

  return (
    <Section id="interviews" title="Interview plan" help="The rounds after screening, in order. AI rounds run on their own; when a round with a person comes up, HR is notified to pick a time and the tool sends the Google Meet invite.">
      <div className="rounded-lg border border-line p-4">
        <p className="text-sm font-medium">After screening</p>
        <p className="mb-3 text-[12px] text-muted">Screening combines the application answers and the resume.</p>
        <AdvanceRuleFields rule={spec.screeningAdvance} what={rounds[0]?.name ?? 'the first round'} disabled={readOnly} onChange={r => set(s => void (s.screeningAdvance = r))} />
      </div>

      {rounds.map((r, i) => (
        <div key={r.id} className={cx('rounded-lg border p-4', r.kind === 'ai' ? 'border-accent/30' : 'border-line')}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Badge tone={r.kind === 'ai' ? 'accent' : 'info'}>Round {i + 1} · {r.kind === 'ai' ? 'AI interview' : 'With a person'}</Badge>
            </div>
            {!readOnly && (
              <div className="flex">
                <IconButton label="Move up" disabled={i === 0} onClick={() => set(s => void s.interviewRounds.splice(i - 1, 0, ...s.interviewRounds.splice(i, 1)))}><ChevronUp size={15} /></IconButton>
                <IconButton label="Move down" disabled={i === rounds.length - 1} onClick={() => set(s => void s.interviewRounds.splice(i + 1, 0, ...s.interviewRounds.splice(i, 1)))}><ChevronDown size={15} /></IconButton>
                <IconButton label="Remove round" onClick={() => set(s => void s.interviewRounds.splice(i, 1))}><Trash2 size={15} /></IconButton>
              </div>
            )}
          </div>
          <Field label="Round name"><Input value={r.name} disabled={readOnly} onChange={e => set(s => void (s.interviewRounds[i].name = e.target.value))} /></Field>

          {r.kind === 'human' ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_160px]">
              <Field label="Interviewer emails" hint="The Google Meet invite goes to them and the candidate. Comma-separated.">
                <ListInput
                  value={r.interviewerEmails}
                  disabled={readOnly}
                  placeholder="name@company.com, other@company.com"
                  onChange={v => set(s => { const x = s.interviewRounds[i]; if (x.kind === 'human') x.interviewerEmails = v })}
                />
              </Field>
              <Field label="Length"><NumberInput value={r.durationMin} min={15} max={120} suffix="min" disabled={readOnly} onChange={n => set(s => { const x = s.interviewRounds[i]; if (x.kind === 'human') x.durationMin = Math.round(n) })} /></Field>
            </div>
          ) : (
            <div className="mt-3 space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Follow-ups per question" hint="The AI probes vague answers.">
                  <Select value={r.maxFollowUps} disabled={readOnly} onChange={e => set(s => { const x = s.interviewRounds[i]; if (x.kind === 'ai') x.maxFollowUps = Number(e.target.value) })}>
                    <option value={0}>None — fixed questions</option>
                    <option value={1}>Up to 1</option>
                    <option value={2}>Up to 2</option>
                  </Select>
                </Field>
                <Field label="Time to complete" hint="After the invite is sent."><NumberInput value={r.deadlineHours} min={12} max={336} suffix="hours" disabled={readOnly} onChange={n => set(s => { const x = s.interviewRounds[i]; if (x.kind === 'ai') x.deadlineHours = Math.round(n) })} /></Field>
                <Field label="Reminder" hint="Hours before the deadline. 0 = none."><NumberInput value={r.reminderHoursBefore} min={0} max={72} suffix="hours" disabled={readOnly} onChange={n => set(s => { const x = s.interviewRounds[i]; if (x.kind === 'ai') x.reminderHoursBefore = Math.round(n) })} /></Field>
              </div>
              <AdvanceRuleFields rule={r.advance} what={nextName(i)} disabled={readOnly} onChange={v => set(s => { const x = s.interviewRounds[i]; if (x.kind === 'ai') x.advance = v })} />
              <div className="space-y-3">
                <p className="text-[13px] font-medium">Questions the AI asks <span className="font-normal text-muted">({LIMITS.interviewQuestions.min}–{LIMITS.interviewQuestions.max}, spoken aloud)</span></p>
                {r.questions.map((q, qi) => (
                  <div key={q.id} className="rounded-lg bg-surface-2/60 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-[12px] font-medium text-muted">Question {qi + 1}</span>
                      {!readOnly && <IconButton label="Remove question" onClick={() => set(s => { const x = s.interviewRounds[i]; if (x.kind === 'ai') x.questions.splice(qi, 1) })}><Trash2 size={14} /></IconButton>}
                    </div>
                    <Textarea rows={2} value={q.text} disabled={readOnly} placeholder="Ask it the way you'd say it out loud" onChange={e => set(s => { const x = s.interviewRounds[i]; if (x.kind === 'ai') x.questions[qi].text = e.target.value })} />
                    <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_160px]">
                      <div>
                        <p className="mb-1.5 text-[13px] font-medium">Tests</p>
                        <SkillPicker skills={skills} value={q.skillIds} max={2} disabled={readOnly} onChange={ids => set(s => { const x = s.interviewRounds[i]; if (x.kind === 'ai') x.questions[qi].skillIds = ids })} />
                      </div>
                      <Field label="Answer time"><NumberInput value={q.timeLimitSec} min={30} max={300} suffix="sec" disabled={readOnly} onChange={n => set(s => { const x = s.interviewRounds[i]; if (x.kind === 'ai') x.questions[qi].timeLimitSec = Math.round(n) })} /></Field>
                    </div>
                    <div className="mt-3">
                      <RubricEditor spoken rubric={q.rubric} disabled={readOnly} onChange={rb => set(s => { const x = s.interviewRounds[i]; if (x.kind === 'ai') x.questions[qi].rubric = rb })} />
                    </div>
                  </div>
                ))}
                {!readOnly && <Button variant="secondary" size="sm" onClick={() => set(s => { const x = s.interviewRounds[i]; if (x.kind === 'ai') x.questions.push(blankQ()) })}><Plus size={14} /> Add question</Button>}
              </div>
            </div>
          )}
        </div>
      ))}

      {!readOnly && (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => set(s => void s.interviewRounds.push(newAi()))}><Plus size={14} /> Add AI round</Button>
          <Button variant="secondary" size="sm" onClick={() => set(s => void s.interviewRounds.push(newHuman()))}><Plus size={14} /> Add round with a person</Button>
        </div>
      )}
    </Section>
  )
}

function CollegesSection({ spec, set, readOnly }: SectionProps) {
  return (
    <Section id="colleges" title="Preferred colleges" help="Optional. Short forms are understood — “IIM” matches every Indian Institute of Management, “BITS” every BITS campus.">
      <Field label="Colleges" hint="One per line.">
        <Textarea
          rows={5}
          value={spec.preferredColleges.join('\n')}
          disabled={readOnly}
          placeholder={'IIM\nBITS Pilani\nIIT Delhi'}
          onChange={e => set(s => void (s.preferredColleges = e.target.value.split('\n')))}
          onBlur={() => set(s => void (s.preferredColleges = s.preferredColleges.map(c => c.trim()).filter(Boolean)))}
        />
      </Field>
      <Field label="Score bonus" hint="Points added to the screening score (0 = shown as a tag only, no effect on ranking).">
        <NumberInput value={spec.preferredCollegeBonus} min={0} max={10} suffix="points" disabled={readOnly} onChange={n => set(s => void (s.preferredCollegeBonus = Math.min(10, Math.max(0, Math.round(n)))))} />
      </Field>
    </Section>
  )
}
