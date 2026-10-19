import { Candidate, ScreeningCriteria } from '../stores/jobStore'
import { locationMatches, formatCtc, formatExperience, formatNotice } from './candidateParsing'

export interface FilterResult {
  /** Rule keys the candidate failed */
  failures: string[]
  /** Human-readable reasons, aligned with `failures` */
  reasons: string[]
}

/**
 * Deterministic hard filters. These run BEFORE any LLM call so we never spend
 * tokens (or rank highly) a candidate who is structurally disqualified —
 * over budget, wrong experience band, unreachable, etc.
 *
 * Missing data never fails a filter. If a candidate didn't answer the CTC
 * question we can't prove they're over budget, so we let the LLM stage judge them.
 * This avoids silently rejecting good candidates because of a blank column.
 */
export function evaluateCriteria(
  candidate: Candidate,
  criteria: ScreeningCriteria | undefined,
): FilterResult {
  const failures: string[] = []
  const reasons: string[] = []

  if (!criteria || !criteria.enabled) return { failures, reasons }

  // --- Budget ---
  if (criteria.maxCtc !== undefined && candidate.ctcExpected !== undefined) {
    if (candidate.ctcExpected > criteria.maxCtc) {
      failures.push('ctc')
      reasons.push(
        `Expects ${formatCtc(candidate.ctcExpected)} — over the ${formatCtc(criteria.maxCtc)} budget`
      )
    }
  }

  // --- Experience band ---
  if (candidate.experienceYears !== undefined) {
    if (criteria.minExperience !== undefined && candidate.experienceYears < criteria.minExperience) {
      failures.push('min_experience')
      reasons.push(
        `${formatExperience(candidate.experienceYears)} experience — below the ${criteria.minExperience} yr minimum`
      )
    }
    if (criteria.maxExperience !== undefined && candidate.experienceYears > criteria.maxExperience) {
      failures.push('max_experience')
      reasons.push(
        `${formatExperience(candidate.experienceYears)} experience — above the ${criteria.maxExperience} yr ceiling`
      )
    }
  }

  // --- Notice period ---
  if (criteria.maxNoticePeriod !== undefined && candidate.noticePeriodDays !== undefined) {
    if (candidate.noticePeriodDays > criteria.maxNoticePeriod) {
      failures.push('notice_period')
      reasons.push(
        `${formatNotice(candidate.noticePeriodDays)} notice — exceeds the ${formatNotice(criteria.maxNoticePeriod)} limit`
      )
    }
  }

  // --- Location ---
  if (criteria.locations.length > 0 && candidate.location) {
    if (!locationMatches(candidate.location, criteria.locations, criteria.allowRemote)) {
      failures.push('location')
      reasons.push(`Located in "${candidate.location}" — outside ${criteria.locations.join(', ')}`)
    }
  }

  // --- Reachability ---
  if (criteria.requireEmail && !candidate.email?.trim()) {
    failures.push('no_email')
    reasons.push('No email address — cannot be contacted')
  }

  if (criteria.requireResume && !candidate.resumeUrl?.trim()) {
    failures.push('no_resume')
    reasons.push('No resume attached')
  }

  return { failures, reasons }
}

/**
 * Effort/quality filters that don't depend on the recruiter's criteria.
 * These catch blank submissions, one-word answers, and copy-paste duplicates.
 */
export function evaluateEffort(
  candidate: Candidate,
  duplicateFingerprints: Map<string, number>,
): FilterResult {
  const failures: string[] = []
  const reasons: string[] = []

  const responses = Object.values(candidate.responses).filter(v => v && v.trim().length > 0)

  if (responses.length === 0) {
    failures.push('no_responses')
    reasons.push('No screening answers submitted')
    return { failures, reasons }
  }

  const totalText = responses.join(' ').trim()

  if (totalText.length < 120) {
    failures.push('insufficient_content')
    reasons.push(`Only ${totalText.length} characters submitted across all answers`)
  }

  const avgLength = totalText.length / responses.length
  if (avgLength < 25) {
    failures.push('low_effort')
    reasons.push(`Answers average ${Math.round(avgLength)} characters — minimal effort`)
  }

  const fp = fingerprint(candidate)
  if (fp && (duplicateFingerprints.get(fp) || 0) > 1) {
    failures.push('duplicate')
    reasons.push('Answers are identical to another applicant')
  }

  return { failures, reasons }
}

/** Stable fingerprint of a candidate's answers, for duplicate detection. */
export function fingerprint(candidate: Candidate): string {
  const text = Object.values(candidate.responses)
    .join(' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim()
  return text.length < 60 ? '' : text.substring(0, 400)
}

/** Build a fingerprint → count map so duplicate detection is O(n) not O(n²). */
export function buildFingerprintIndex(candidates: Candidate[]): Map<string, number> {
  const index = new Map<string, number>()
  for (const c of candidates) {
    const fp = fingerprint(c)
    if (!fp) continue
    index.set(fp, (index.get(fp) || 0) + 1)
  }
  return index
}

/**
 * Answer columns that leak pedigree or identity rather than capability.
 * Withheld from the model prompt when blind screening is on.
 *
 * Every term is anchored on a word boundary: unanchored "age" matched inside
 * "manage" / "leverage", which would have silently hidden real skill answers.
 * "degree" is skipped in "to what degree…" phrasing for the same reason.
 *
 * Kept here rather than in the store so it stays a pure constant — importing it
 * shouldn't drag in IndexedDB.
 */
export const PEDIGREE_COLUMN = new RegExp(
  [
    // Education pedigree
    String.raw`\binstitut`,
    String.raw`\bcolleges?\b`,
    String.raw`\buniversit`,
    String.raw`\bschool`,
    String.raw`\balma\s*mater\b`,
    String.raw`\bgraduat`,
    String.raw`(?<!\b(?:what|which|some|a|high|great|certain|large|any|varying)\s)\bdegrees?\b`,
    String.raw`\bqualifications?\b`,
    String.raw`\bc?gpa\b`,
    String.raw`\bpass(?:ing|ed)?[\s-]*out\b`,
    // Origin and protected characteristics
    String.raw`\bwhich country\b`,
    String.raw`\bnationality\b`,
    String.raw`\bcitizenship\b`,
    String.raw`\bhometown\b`,
    String.raw`\bwhere are you from\b`,
    String.raw`\bgender\b`,
    String.raw`\bage\b`,
    String.raw`\bdate of birth\b`,
    String.raw`\bdob\b`,
    String.raw`\bcaste\b`,
    String.raw`\breligio`,
    String.raw`\bethnic`,
    String.raw`\bmarital\b`,
    String.raw`\bdisabilit`,
    String.raw`\b(?:photo|photograph|picture)\b`,
  ].join('|'),
  'i',
)

/**
 * The answers to send to the model. With blind screening on, pedigree columns
 * are dropped — the recruiter still sees every answer in the UI.
 */
export function modelVisibleAnswers(
  responses: Record<string, string>,
  blind: boolean | undefined,
): [string, string][] {
  return Object.entries(responses).filter(
    ([q, a]) => a.trim().length > 0 && !(blind && PEDIGREE_COLUMN.test(q))
  )
}

export const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Strips the candidate's own name, email and phone out of free text (a resume)
 * before it reaches the model under blind screening. Institutions named inside
 * a resume are left alone — removing them would gut the work history.
 */
export function redactIdentity(
  text: string,
  who: { name?: string },
): string {
  let out = text
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[email]')
    // Phone shapes only (98765 43210, 987-654-3210, +91…) — a looser digit run
    // would also eat resume date ranges like "2018 - 2020 2021"
    .replace(/(?<![\w+])(?:\+\d{1,3}[\s-]?)?(?:\d{5}[\s-]?\d{5}|\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4})(?!\d)/g, '[phone]')

  const nameParts = (who.name || '')
    .split(/\s+/)
    .filter(p => p.length >= 3 && p.toLowerCase() !== 'unknown')
  for (const part of nameParts) {
    out = out.replace(new RegExp(`\\b${escapeRegExp(part)}\\b`, 'gi'), '[candidate]')
  }
  return out
}

/** Friendly labels for filter keys, used in the results UI. */
export const FILTER_LABELS: Record<string, string> = {
  ctc: 'Over budget',
  min_experience: 'Under-experienced',
  max_experience: 'Over-experienced',
  notice_period: 'Notice too long',
  location: 'Location mismatch',
  no_email: 'No email',
  no_resume: 'No resume',
  no_responses: 'No answers',
  insufficient_content: 'Too brief',
  low_effort: 'Low effort',
  duplicate: 'Duplicate answers',
}
