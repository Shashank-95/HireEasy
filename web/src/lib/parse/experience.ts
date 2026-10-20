import type { Confidence } from './money'

/**
 * A range, not a number. "2+ years" from a dropdown means "at least 2, could
 * be 10" — collapsing that to 2 would wrongly pass a 10-year veteran for a
 * 0–2 year role. Open-ended answers carry `maxYears: null` so the eligibility
 * stage knows to verify them against the resume.
 */
export type ExperienceParse =
  | { kind: 'years'; minYears: number; maxYears: number | null; confidence: Confidence; note?: string }
  | { kind: 'unknown'; note: string }

const NUM = String.raw`(\d+(?:\.\d+)?)`

export function parseExperience(raw: string | undefined | null): ExperienceParse {
  const original = (raw ?? '').trim()
  if (!original) return { kind: 'unknown', note: 'blank' }
  const s = original.toLowerCase().replace(/[–—]/g, '-').replace(/\s+/g, ' ')

  // Word-anchored: an unanchored "0 year" matches inside "10 years"
  if (/\bfresher\b|fresh graduate|no (?:work )?experience|\bnone\b|^0$|^\s*0\s*(?:years?|yrs?)\s*$/.test(s)) {
    return { kind: 'years', minYears: 0, maxYears: 0, confidence: 'high' }
  }

  // "2+ years", "5+ yrs", "more than 3 years"
  const plus = s.match(new RegExp(`${NUM}\\s*\\+\\s*(?:years?|yrs?|y)?`)) || s.match(new RegExp(`(?:more than|over|above)\\s*${NUM}\\s*(?:years?|yrs?)`))
  if (plus) {
    return { kind: 'years', minYears: Number(plus[1]), maxYears: null, confidence: 'high', note: 'open-ended — verify from resume' }
  }

  // "0-1 years", "1 to 2 yrs"
  const range = s.match(new RegExp(`${NUM}\\s*(?:-|to)\\s*${NUM}\\s*(?:years?|yrs?|y)?\\b`))
  if (range && !/month/.test(s.slice(range.index! + range[0].length, range.index! + range[0].length + 8))) {
    const a = Number(range[1]), b = Number(range[2])
    return { kind: 'years', minYears: Math.min(a, b), maxYears: Math.max(a, b), confidence: 'high' }
  }

  // "3 years 6 months", "3y 6m"
  const combo = s.match(new RegExp(`${NUM}\\s*(?:years?|yrs?|y)\\b.*?${NUM}\\s*(?:months?|mos?|m)\\b`))
  if (combo) {
    const y = Number(combo[1]) + Number(combo[2]) / 12
    return { kind: 'years', minYears: round1(y), maxYears: round1(y), confidence: 'high' }
  }

  // "18 months", "6 mos"
  const months = s.match(new RegExp(`${NUM}\\s*(?:months?|mos?)\\b`))
  if (months && !/years?|yrs?/.test(s)) {
    const y = Number(months[1]) / 12
    return { kind: 'years', minYears: round1(y), maxYears: round1(y), confidence: 'high' }
  }

  const yrs = s.match(new RegExp(`${NUM}\\s*(?:years?|yrs?|y)\\b`))
  if (yrs) {
    const y = Number(yrs[1])
    return { kind: 'years', minYears: y, maxYears: y, confidence: 'high' }
  }

  // Bare number: "3" — almost always years, but a year like "2019" is not
  const bare = s.match(/^\d+(?:\.\d+)?$/)
  if (bare) {
    const y = Number(s)
    if (y <= 50) return { kind: 'years', minYears: y, maxYears: y, confidence: 'medium', note: 'no unit given — read as years' }
  }

  return { kind: 'unknown', note: 'could not read experience' }
}

/**
 * Notice period in days, as a range. Dropdown buckets ("15-30 days", "60+
 * days") stay ranges; the eligibility check compares the earliest the
 * candidate could join against the role's limit.
 */
export type NoticeParse =
  | { kind: 'days'; minDays: number; maxDays: number | null; confidence: Confidence; note?: string }
  | { kind: 'unknown'; note: string }

export function parseNotice(raw: string | undefined | null): NoticeParse {
  const original = (raw ?? '').trim()
  if (!original) return { kind: 'unknown', note: 'blank' }
  const s = original.toLowerCase().replace(/[–—]/g, '-').replace(/\s+/g, ' ')

  // "Immediate / within a week"
  if (/immediate|immediately|asap|right away|available now|\bnil\b|\bnone\b|^0\s*(?:days?)?$/.test(s)) {
    return { kind: 'days', minDays: 0, maxDays: /week/.test(s) ? 7 : 0, confidence: 'high' }
  }

  const unitDays = (u: string | undefined) => (!u ? null : /^mon|^mth/.test(u) ? 30 : /^w/.test(u) ? 7 : 1)
  const UNIT = String.raw`(months?|mons?|mths?|weeks?|wks?|days?)`

  // The standard form's own options: "Up to 15 days", "More than 90 days"
  const upTo = s.match(new RegExp(`(?:up\\s*to|within|less than|under)\\s*${NUM}\\s*${UNIT}?`))
  if (upTo) {
    return { kind: 'days', minDays: 0, maxDays: Number(upTo[1]) * (unitDays(upTo[2]) ?? 1), confidence: 'high' }
  }
  const moreThan = s.match(new RegExp(`(?:more than|over|above)\\s*${NUM}\\s*${UNIT}?`))
  if (moreThan) {
    return { kind: 'days', minDays: Number(moreThan[1]) * (unitDays(moreThan[2]) ?? 1) + 1, maxDays: null, confidence: 'high' }
  }

  const plus = s.match(new RegExp(`${NUM}\\s*\\+\\s*${UNIT}?`))
  if (plus) {
    const mult = unitDays(plus[2]) ?? 1
    return { kind: 'days', minDays: Number(plus[1]) * mult + 1, maxDays: null, confidence: 'high' }
  }

  const range = s.match(new RegExp(`${NUM}\\s*(?:-|to)\\s*${NUM}\\s*${UNIT}?`))
  if (range) {
    const mult = unitDays(range[3]) ?? 1
    return { kind: 'days', minDays: Number(range[1]) * mult, maxDays: Number(range[2]) * mult, confidence: range[3] ? 'high' : 'medium' }
  }

  const single = s.match(new RegExp(`${NUM}\\s*${UNIT}?`))
  if (single) {
    const n = Number(single[1])
    const mult = unitDays(single[2])
    if (mult !== null) return { kind: 'days', minDays: n * mult, maxDays: n * mult, confidence: 'high' }
    // Bare number: small values are months ("2"), larger are days ("45")
    const days = n <= 6 ? n * 30 : n
    return { kind: 'days', minDays: days, maxDays: days, confidence: 'medium', note: 'no unit given' }
  }

  return { kind: 'unknown', note: 'could not read notice period' }
}

const round1 = (n: number) => Math.round(n * 10) / 10
