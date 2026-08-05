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
