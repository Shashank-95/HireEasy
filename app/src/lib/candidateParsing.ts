/**
 * Parsers that turn messy, human-typed spreadsheet values into structured numbers
 * we can filter on deterministically.
 *
 * Real form responses look like:
 *   CTC        → "12 LPA", "₹15,00,000", "1200000", "15L", "$120K", "12-15 lpa", "Negotiable"
 *   Experience → "3 years", "3.5", "3 yrs 6 months", "Fresher", "0-1 years", "5+"
 *   Notice     → "30 days", "Immediate", "2 months", "60", "Serving notice", "90"
 */

/** Strip currency symbols, commas, and whitespace noise. */
function clean(raw: string): string {
  return raw.trim().toLowerCase().replace(/[,₹$€£]/g, '').replace(/\s+/g, ' ')
}

/** Pull the first number out of a string, or the average when it's a range like "12-15". */
function extractNumber(s: string): number | null {
  // Range: "12-15", "12 to 15"
  const range = s.match(/(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)/)
  if (range) {
    const lo = parseFloat(range[1])
    const hi = parseFloat(range[2])
    if (!isNaN(lo) && !isNaN(hi)) return (lo + hi) / 2
  }
  const single = s.match(/(\d+(?:\.\d+)?)/)
  if (single) {
    const n = parseFloat(single[1])
    return isNaN(n) ? null : n
  }
  return null
}

/**
 * Parse expected CTC and normalise to LPA (lakhs per annum).
 *
 * Heuristics:
 *   - Explicit "lpa" / "lakh" / trailing "l"  → already LPA
 *   - "k" suffix or 5-6 digit raw number       → absolute rupees, convert to LPA
 *   - 7+ digit raw number                      → absolute rupees, convert to LPA
 *   - Bare number under 100                    → assume LPA (most common form response)
 */
/**
 * Currencies other than INR. We deliberately refuse to guess a conversion —
 * a wrong CTC actively disqualifies a good candidate, whereas an unknown CTC
 * never fails a filter. Silent mis-conversion is the worse failure mode.
 */
const FOREIGN_CURRENCY = /\$|usd|dollar|€|eur\b|£|gbp|pound|aed|dirham|naira|ngn|sgd|cad|aud|myr|ringgit|peso|rand|zar|yen|jpy|won|krw|฿|baht|dhs/i

/** Plausible annual CTC band for a salaried role, in LPA. Outside this, we don't trust the parse. */
const MIN_PLAUSIBLE_LPA = 0.5   // ₹50k/year
const MAX_PLAUSIBLE_LPA = 2000  // ₹20 crore/year

export function parseCtcToLPA(raw: string | undefined): number | undefined {
  if (!raw) return undefined
  const s = clean(raw)
  if (!s) return undefined

  // Free-text answers we can't filter on ("negotiable", "as per company norms")
  if (/negotiable|as per|open to|flexible|discuss|n\/?a|not applicable/.test(s) && !/\d/.test(s)) {
    return undefined
  }

  // Non-INR amounts: refuse rather than guess an exchange rate
  if (FOREIGN_CURRENCY.test(raw)) return undefined

  const n = extractNumber(s)
  if (n === null || n <= 0) return undefined

  const hasLakh = /lpa|lac\b|lakh|lakhs|\bl\b|\dl\b/.test(s)
  const hasCrore = /\bcr\b|crore/.test(s)
  const hasK = /\dk\b|\bk\b/.test(s)
  const hasMonth = /per month|\/month|\bpm\b|monthly/.test(s)

  let lpa: number
  if (hasCrore) {
    lpa = n * 100
  } else if (hasLakh) {
    // People routinely write the ABSOLUTE rupee figure and still tag it "LPA"
    // ("13,00,000 LPA", "1600000 Lakh rupees"). Treat implausibly large
    // "lakh" figures as absolute rupees instead of taking them at face value.
    lpa = n > MAX_PLAUSIBLE_LPA ? n / 100000 : n
  } else if (hasMonth) {
    lpa = (n * 12) / 100000
  } else if (hasK) {
    lpa = (n * 1000) / 100000
  } else if (n >= 100000) {
    lpa = n / 100000          // 1500000 → 15 LPA
  } else if (n >= 1000) {
    // 10000-99999 is ambiguous: could be a monthly figure or a typo.
    // Assume monthly, then let the plausibility gate below reject it if absurd.
    lpa = (n * 12) / 100000
  } else {
    lpa = n                   // 12 → 12 LPA
  }

  // Final sanity gate — anything outside a believable salary band is a bad parse
  if (lpa < MIN_PLAUSIBLE_LPA || lpa > MAX_PLAUSIBLE_LPA) return undefined
  return Math.round(lpa * 100) / 100
}

/** Parse total years of experience. Handles "3 yrs 6 months", "Fresher", ranges. */
export function parseExperienceYears(raw: string | undefined): number | undefined {
  if (!raw) return undefined
  const s = clean(raw)
  if (!s) return undefined

  // Word-anchored: an unanchored "0 year" would match the "0 year" inside "10 years"
  if (/fresher|fresh graduate|no experience|\bnone\b|\b0\s*years?\b/.test(s)) return 0

  // "3 years 6 months" / "3y 6m"
  const combo = s.match(/(\d+(?:\.\d+)?)\s*(?:\+)?\s*(?:years?|yrs?|y)\b.*?(\d+)\s*(?:months?|mos?|m)\b/)
  if (combo) {
    const y = parseFloat(combo[1])
    const m = parseFloat(combo[2])
    if (!isNaN(y) && !isNaN(m)) return y + m / 12
  }

  // Months only: "18 months"
  if (/months?|mos\b/.test(s) && !/years?|yrs?/.test(s)) {
    const m = extractNumber(s)
    if (m !== null) return m / 12
  }

  const n = extractNumber(s)
  if (n === null) return undefined
  // Guard against someone typing a year like "2019"
  if (n > 60) return undefined
  return n
}

/** Parse notice period into days. "Immediate" → 0, "2 months" → 60. */
export function parseNoticePeriodDays(raw: string | undefined): number | undefined {
  if (!raw) return undefined
  const s = clean(raw)
  if (!s) return undefined

  // Word-anchored: an unanchored "0 day" would match the "0 day" inside "30 days"
  if (/immediate|immediately|asap|right away|available now|\b0\s*days?\b|\bnone\b|\bnil\b/.test(s)) return 0

  const n = extractNumber(s)
  if (n === null) return undefined

  if (/month|mon\b|mth/.test(s)) return n * 30
  if (/week|wk/.test(s)) return n * 7
  if (/day/.test(s)) return n

  // Bare number — small values are almost always months, larger are days
  if (n <= 6) return n * 30
  return n
}

/** Normalise a location string for comparison. */
export function normaliseLocation(raw: string | undefined): string {
  if (!raw) return ''
  return raw.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** True when the candidate's location satisfies any of the acceptable locations. */
export function locationMatches(
  candidateLocation: string | undefined,
  acceptable: string[],
  allowRemote: boolean,
): boolean {
  if (acceptable.length === 0) return true
  const loc = normaliseLocation(candidateLocation)
  if (!loc) return false

  if (allowRemote && /remote|anywhere|work from home|wfh|any location/.test(loc)) return true

  return acceptable.some(a => {
    const target = normaliseLocation(a)
    if (!target) return false
    return loc.includes(target) || target.includes(loc)
  })
}

/** Format LPA for display. */
export function formatCtc(lpa: number | undefined): string {
  if (lpa === undefined) return '—'
  if (lpa >= 100) return `₹${(lpa / 100).toFixed(2)} Cr`
  if (lpa < 1) return `₹${Math.round(lpa * 100000).toLocaleString('en-IN')}`
  return `₹${lpa.toFixed(1)} LPA`
}

/** Format experience for display. */
export function formatExperience(years: number | undefined): string {
  if (years === undefined) return '—'
  if (years === 0) return 'Fresher'
  if (years < 1) return `${Math.round(years * 12)} mo`
  return `${years % 1 === 0 ? years : years.toFixed(1)} yrs`
}

/** Format notice period for display. */
export function formatNotice(days: number | undefined): string {
  if (days === undefined) return '—'
  if (days === 0) return 'Immediate'
  if (days >= 30 && days % 30 === 0) return `${days / 30} mo`
  return `${days} days`
}
