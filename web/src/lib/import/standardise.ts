import { parseMoney } from '../parse/money'
import { parseExperience, parseNotice } from '../parse/experience'
import { NOTICE_OPTIONS } from '../templates/applicationForm'
import type { Field } from './mapping'

/**
 * Converts whatever a candidate typed into the standard form's values, and
 * records every change. Nothing is altered silently: HR sees each raw value
 * next to what the tool turned it into, and why.
 */
export interface Change {
  field: Field
  from: string
  to: string
  note: string
  /** True when a person should glance at it: a guess, a split, or lost detail */
  check: boolean
}

export interface Standardised {
  values: Partial<Record<Field, string>>
  changes: Change[]
}

const rupees = (lpa: number) => String(Math.round(lpa * 1e5))

function salary(field: Field, raw: string | undefined, changes: Change[]): string {
  const from = (raw ?? '').trim()
  if (!from) return ''
  const p = parseMoney(from)
  const log = (to: string, note: string, check: boolean) => {
    if (to !== from) changes.push({ field, from, to, note, check })
    return to
  }
  switch (p.kind) {
    case 'none':
      return log('0', 'no current pay', false)
    case 'unknown':
      return log('', 'no figure given — left blank', false)
    case 'foreign':
      return log('', 'non-INR amount — left blank, compare manually', true)
    case 'amount': {
      const to = rupees(p.minLpa)
      const range = p.minLpa !== p.maxLpa ? ` (range ${p.minLpa}–${p.maxLpa} L — lowest figure used)` : ''
      const unsure = p.confidence === 'high' ? '' : ` — ${p.note ?? 'uncertain'}, please check`
      return log(to, `converted to full rupees${range}${unsure}`, p.confidence !== 'high' || !!range)
    }
  }
}

function experience(raw: string | undefined, changes: Change[]): string {
  const from = (raw ?? '').trim()
  if (!from) return ''
  const p = parseExperience(from)
  if (p.kind === 'unknown') {
    changes.push({ field: 'experience', from, to: '', note: 'could not read — left blank', check: true })
    return ''
  }
  // A bucket can't become one number without inventing data — keep it as a range
  const to = p.maxYears === null ? `${p.minYears}+` : p.minYears === p.maxYears ? String(p.minYears) : `${p.minYears}-${p.maxYears}`
  if (to !== from) {
    const note =
      p.maxYears === null ? 'open-ended answer kept as a range — actual years will be read from the resume'
      : p.minYears !== p.maxYears ? 'kept as a range — the old form asked for a bracket, not a number'
      : 'converted to years'
    changes.push({ field: 'experience', from, to, note, check: p.maxYears === null })
  }
  return to
}

/** Map any notice answer onto the standard options, rounding toward the later date. */
function notice(raw: string | undefined, changes: Change[]): string {
  const from = (raw ?? '').trim()
  if (!from) return ''
  const p = parseNotice(from)
  if (p.kind === 'unknown') {
    changes.push({ field: 'notice', from, to: '', note: 'could not read — left blank', check: true })
    return ''
  }
  const latest = p.maxDays ?? Infinity
  const to =
    // "Immediate" only when they said immediate — "within a week" is not
    latest === 0 ? NOTICE_OPTIONS[0]
    : latest <= 15 ? NOTICE_OPTIONS[1]
    : latest <= 30 ? NOTICE_OPTIONS[2]
    : latest <= 60 ? NOTICE_OPTIONS[3]
    : latest <= 90 ? NOTICE_OPTIONS[4]
    : NOTICE_OPTIONS[5]
  if (to !== from) {
    const lost = p.maxDays === null && latest === Infinity && to !== NOTICE_OPTIONS[5] ? ' — exact length unknown' : ''
    changes.push({ field: 'notice', from, to, note: `mapped to the nearest standard option${lost}`, check: !!lost })
  }
  return to
}

/**
 * "BITS Pilani, Mechanical Engineering, 2024" → college / degree / year.
 * Free text, so the split is a best guess and always flagged for a glance.
 */
export function splitEducation(raw: string | undefined): { college: string; degree: string; year: string } {
  let s = (raw ?? '').trim()
  if (!s) return { college: '', degree: '', year: '' }
  // "2019-2023" is a study period: the graduation year is the end of it
  s = s.replace(/\b(19[89]\d|20[0-4]\d)\s*(?:-|–|to)\s*(19[89]\d|20[0-4]\d)\b/g, '$2')
  const years = [...s.matchAll(/\b(19[89]\d|20[0-4]\d)\b/g)]
  const year = years.at(-1)?.[1] ?? ''
  const rest = s
    .replace(/\b(19[89]\d|20[0-4]\d)\b/g, ' ')
    // Labels people add around the year
    .replace(/\b(?:pass(?:ing|ed)?[\s-]*out(?:\s*year)?|graduat(?:ed|ion)(?:\s*year)?|batch(?:\s*of)?|class\s*of|year)\b/gi, ' ')
    .replace(/\(\s*\)/g, ' ')
    .trim()
  const clean = (p: string) => p.replace(/^[\s&,.|;:()-]+|[\s&,.|;:(-]+$/g, '').replace(/\s+/g, ' ').trim()
  const parts = rest.split(/\s*[,|;\n]\s*|\s+[-–]\s+/).map(clean).filter(Boolean)
  return { college: parts[0] ?? clean(rest), degree: parts.slice(1).join(', '), year }
}

export function standardise(fields: Partial<Record<Field, string>>): Standardised {
  const changes: Change[] = []
  const values: Partial<Record<Field, string>> = { ...fields }

  values.expectedSalary = salary('expectedSalary', fields.expectedSalary, changes)
  values.currentSalary = salary('currentSalary', fields.currentSalary, changes)
  values.experience = experience(fields.experience, changes)
  values.notice = notice(fields.notice, changes)

  // Old forms asked for college, course and year in one box
  if (fields.education && !fields.degree && !fields.graduationYear) {
    const e = splitEducation(fields.education)
    values.education = e.college
    values.degree = e.degree
    values.graduationYear = e.year
    changes.push({
      field: 'education',
      from: fields.education,
      to: [e.college, e.degree, e.year].filter(Boolean).join(' | '),
      note: 'split into college, degree and graduation year',
      check: !e.degree || !e.year,
    })
  }

  for (const k of Object.keys(values) as Field[]) if (values[k] === '') delete values[k]
  return { values, changes }
}
