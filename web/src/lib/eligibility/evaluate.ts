import { parseMoney, formatMoney, type MoneyParse } from '../parse/money'
import { parseExperience, parseNotice, type ExperienceParse, type NoticeParse } from '../parse/experience'

/**
 * Per-role eligibility settings. Every number here is entered by HR for the
 * role — nothing is assumed. A criterion that is not enabled never affects a
 * candidate.
 */
export interface EligibilityCriteria {
  budget: { enabled: boolean; maxLpa: number; tolerancePct: number; action: 'exclude' | 'review' }
  experience: { enabled: boolean; minYears: number; maxYears: number | null; tolerancePct: number; action: 'exclude' | 'review' }
  notice: { enabled: boolean; maxDays: number; tolerancePct: number; action: 'exclude' | 'review' }
  location: { enabled: boolean; allowed: string[]; action: 'exclude' | 'review' }
}

export const EMPTY_CRITERIA: EligibilityCriteria = {
  budget: { enabled: false, maxLpa: 0, tolerancePct: 0, action: 'exclude' },
  experience: { enabled: false, minYears: 0, maxYears: null, tolerancePct: 0, action: 'exclude' },
  notice: { enabled: false, maxDays: 0, tolerancePct: 0, action: 'exclude' },
  location: { enabled: false, allowed: [], action: 'exclude' },
}

export type Verdict = 'pass' | 'review' | 'exclude'

export interface CriterionResult {
  criterion: 'budget' | 'experience' | 'notice' | 'location'
  verdict: Verdict
  /** Plain-English reason shown to HR, always citing the candidate's own words */
  reason: string
  /** Something to check later without blocking now (e.g. verify "2+ years" from resume) */
  flag?: string
}

export interface CandidateFacts {
  expectedSalary?: string
  experience?: string
  notice?: string
  location?: string
}

export interface EligibilityResult {
  verdict: Verdict
  results: CriterionResult[]
  flags: string[]
  parsed: { salary: MoneyParse; experience: ExperienceParse; notice: NoticeParse }
}

const fmtL = (n: number) => `₹${Math.round(n * 100) / 100} L`
const quote = (s: string | undefined) => `"${(s ?? '').trim().slice(0, 80)}"`

/** A ceiling "+ tolerance". 11 L with 20% → 13.2 L. */
const withTolerance = (limit: number, pct: number) => Math.round(limit * (1 + pct / 100) * 100) / 100

/**
 * How far above the limit a figure can be before we stop trusting it.
 * "8000000" against a 13 L limit is more likely an extra zero than a real
 * 80 L ask — a human should look rather than the system excluding.
 */
const TYPO_MULTIPLE = 3

function checkBudget(c: EligibilityCriteria['budget'], raw: string | undefined, p: MoneyParse): CriterionResult {
  const limit = withTolerance(c.maxLpa, c.tolerancePct)
  const limitText = `budget ${fmtL(c.maxLpa)} + ${c.tolerancePct}% = ${fmtL(limit)}`

  if (p.kind === 'none' || p.kind === 'unknown') {
    return { criterion: 'budget', verdict: 'pass', reason: `Expected salary not stated (${quote(raw)})`, flag: 'Salary not stated' }
  }
  if (p.kind === 'foreign') {
    return { criterion: 'budget', verdict: 'review', reason: `Salary in another currency: ${quote(raw)} — compare manually against ${limitText}` }
  }

  // Judge the lowest figure a candidate said they'd accept
  const ask = p.minLpa
  if (ask <= limit) {
    const flag = p.maxLpa > limit ? `Upper end of range (${formatMoney(p)}) is above ${fmtL(limit)}` : undefined
    return { criterion: 'budget', verdict: 'pass', reason: `Expects ${formatMoney(p)} — within ${limitText}`, flag }
  }

  const over = `Expects ${formatMoney(p)} (${quote(raw)}) — above ${limitText}`
  if (p.confidence !== 'high') {
    return { criterion: 'budget', verdict: 'review', reason: `${over}. Figure is ambiguous${p.note ? ` (${p.note})` : ''}, so not excluded automatically` }
  }
  if (ask > limit * TYPO_MULTIPLE) {
    return { criterion: 'budget', verdict: 'review', reason: `${over}. Unusually high — possibly a typo, so not excluded automatically` }
  }
  return { criterion: 'budget', verdict: c.action, reason: over }
}

function checkExperience(c: EligibilityCriteria['experience'], raw: string | undefined, p: ExperienceParse): CriterionResult {
  if (p.kind === 'unknown') {
    return { criterion: 'experience', verdict: 'pass', reason: `Experience not readable (${quote(raw)})`, flag: 'Experience unknown — check resume' }
  }
  const tol = c.tolerancePct / 100
  const lower = Math.round(c.minYears * (1 - tol) * 10) / 10
  const upper = c.maxYears === null ? null : Math.round(c.maxYears * (1 + tol) * 10) / 10
  const roleText = c.maxYears === null ? `${c.minYears}+ yrs` : `${c.minYears}–${c.maxYears} yrs`
  const said = quote(raw)

  // Too junior: even their maximum is below the floor
  if (p.maxYears !== null && p.maxYears < lower) {
    const reason = `Has ${said} — below the role's ${roleText} (with ${c.tolerancePct}% tolerance, min ${lower} yrs)`
    return { criterion: 'experience', verdict: p.confidence === 'high' ? c.action : 'review', reason }
  }
  // Too senior: even their minimum is above the ceiling
  if (upper !== null && p.minYears > upper) {
    const reason = `Has ${said} — above the role's ${roleText} (with ${c.tolerancePct}% tolerance, max ${upper} yrs)`
    return { criterion: 'experience', verdict: p.confidence === 'high' ? c.action : 'review', reason }
  }
  // "2+ years" against a 0–2 role: can't decide from the form alone
  if (p.maxYears === null && upper !== null) {
    return {
      criterion: 'experience',
      verdict: 'pass',
      reason: `Said ${said} — open-ended, will verify actual years from the resume`,
      flag: `Verify experience from resume (role max ${upper} yrs)`,
    }
  }
  return { criterion: 'experience', verdict: 'pass', reason: `Has ${said} — fits ${roleText}` }
}

function checkNotice(c: EligibilityCriteria['notice'], raw: string | undefined, p: NoticeParse): CriterionResult {
  if (p.kind === 'unknown') {
    return { criterion: 'notice', verdict: 'pass', reason: `Notice period not readable (${quote(raw)})`, flag: 'Notice period unknown' }
  }
  const limit = Math.round(c.maxDays * (1 + c.tolerancePct / 100))
  const limitText = `${c.maxDays} days + ${c.tolerancePct}% = ${limit} days`
  if (p.minDays > limit) {
    const reason = `Can join in ${quote(raw)} — beyond ${limitText}`
    return { criterion: 'notice', verdict: p.confidence === 'high' ? c.action : 'review', reason }
  }
  const flag = p.maxDays === null || p.maxDays > limit ? `Notice may run past ${limit} days (${quote(raw)})` : undefined
  return { criterion: 'notice', verdict: 'pass', reason: `Can join in ${quote(raw)} — within ${limitText}`, flag }
}

const normPlace = (s: string) => s.trim().toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ')

function checkLocation(c: EligibilityCriteria['location'], raw: string | undefined): CriterionResult {
  const loc = normPlace(raw ?? '')
  if (!loc) return { criterion: 'location', verdict: 'pass', reason: 'Location not given', flag: 'Location unknown' }
  const allowed = c.allowed.map(normPlace).filter(Boolean)
  if (allowed.length === 0) return { criterion: 'location', verdict: 'pass', reason: 'Any location accepted' }
  // Whole-word match one way only: "India" must not satisfy "Bangalore, India"
  const ok = allowed.some(a => loc === a || new RegExp(`\\b${a}\\b`).test(loc))
  return ok
    ? { criterion: 'location', verdict: 'pass', reason: `Location ${quote(raw)} is accepted` }
    : { criterion: 'location', verdict: c.action, reason: `Location ${quote(raw)} is not in the accepted list (${c.allowed.join(', ')})` }
}

const SEVERITY: Record<Verdict, number> = { pass: 0, review: 1, exclude: 2 }

export function evaluateEligibility(facts: CandidateFacts, criteria: EligibilityCriteria): EligibilityResult {
  const parsed = {
    salary: parseMoney(facts.expectedSalary),
    experience: parseExperience(facts.experience),
    notice: parseNotice(facts.notice),
  }

  const results: CriterionResult[] = []
  if (criteria.budget.enabled) results.push(checkBudget(criteria.budget, facts.expectedSalary, parsed.salary))
  if (criteria.experience.enabled) results.push(checkExperience(criteria.experience, facts.experience, parsed.experience))
  if (criteria.notice.enabled) results.push(checkNotice(criteria.notice, facts.notice, parsed.notice))
  if (criteria.location.enabled) results.push(checkLocation(criteria.location, facts.location))

  const verdict = results.reduce<Verdict>((v, r) => (SEVERITY[r.verdict] > SEVERITY[v] ? r.verdict : v), 'pass')
  const flags = results.map(r => r.flag).filter((f): f is string => !!f)
  return { verdict, results, flags, parsed }
}
