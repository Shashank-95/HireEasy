/**
 * Salary parsing for free-text form answers.
 *
 * Candidates type anything: "10LPA", "15,00,000", "1200000", "18", "7-10 LPA
 * (negotiable)", "1300000 Lakh rupees", "Stipend - 15k/month", a paragraph…
 * Every figure is normalised to LPA (lakhs of INR per year) and returned as a
 * min/max range with a confidence level. Callers must only take irreversible
 * action (auto-exclusion) on `high` confidence — anything less goes to review.
 */

export type Confidence = 'high' | 'medium' | 'low'

export type MoneyParse =
  /** A figure or range was understood */
  | { kind: 'amount'; minLpa: number; maxLpa: number; confidence: Confidence; note?: string }
  /** Explicitly no pay: fresher, NA, unpaid, 0 */
  | { kind: 'none'; note: string }
  /** Words only ("as per company norms") or empty — no figure to judge */
  | { kind: 'unknown'; note: string }
  /** Non-INR currency — never converted by guesswork */
  | { kind: 'foreign'; note: string }

const NONE_WORDS =
  /^(?:-+|0+|n\/?a|n\.a\.?|na|nil|none|no|not applicable|fresher|currently not earning\.?|current salary fresher|fresher\s*\/\s*na)$/i
const NONE_PHRASES = /\bunpaid\b|\bnot earning\b|\bno salary\b|\bnil\b/i

// Word-anchored so "usd" can't match inside a word. "N700,000" is the naira sign as typed.
const FOREIGN = /\$|€|£|\b(?:usd|dollars?|eur|euros?|gbp|pounds?|aed|dirhams?|naira|ngn|kes|shillings?|cad|aud|sgd)\b|(?:^|[\s(/])n\d/i

interface Token {
  value: number
  /** Unit written right after the number */
  unit: 'lakh' | 'crore' | 'thousand' | null
  index: number
  end: number
}

/** "5.50,000" (a typo for 5,50,000) and "15,00,000" both normalise by grouping rules. */
function toNumber(raw: string): number {
  const commaCount = (raw.match(/,/g) || []).length
  if (commaCount > 0) {
    const [intPart, ...rest] = raw.split('.')
    // "5.50,000": a dot used as a thousands separator before comma groups
    if (rest.length && rest.join('.').includes(',')) return Number(raw.replace(/[.,]/g, ''))
    return Number(intPart.replace(/,/g, '') + (rest.length ? '.' + rest.join('') : ''))
  }
  return Number(raw)
}

function tokenize(s: string): Token[] {
  const re = /(\d[\d,]*(?:\.\d+)?(?:,\d+)*)\s*(lakhs?|lacs?|lac|lpa|l(?![a-z])|crores?|cr(?![a-z])|k(?![a-z])|thousand)?/gi
  const tokens: Token[] = []
  for (const m of s.matchAll(re)) {
    const value = toNumber(m[1])
    if (!Number.isFinite(value)) continue
    const u = (m[2] || '').toLowerCase()
    const unit: Token['unit'] = !u
      ? null
      : /^cr/.test(u) ? 'crore'
      : /^(k|thousand)/.test(u) ? 'thousand'
      : 'lakh'
    tokens.push({ value, unit, index: m.index!, end: m.index! + m[0].length })
  }
  return tokens
}

const MONTHLY = /\bper\s*month\b|\/\s*(?:month|mo|m)\b|\bmonthly\b|\bp\.?\s?m\.?\b|\ba month\b/i

interface Converted {
  lpa: number
  confidence: Confidence
  note?: string
}

/** Convert one number to LPA using its unit and the text around it. */
function toLpa(t: Token, monthly: boolean): Converted {
  const n = t.value
  if (t.unit === 'crore') return { lpa: n * 100, confidence: 'high' }

  if (t.unit === 'lakh') {
    // "500000 LPA", "13,00,000 LPA", "1300000 Lakh rupees": an absolute rupee
    // figure tagged with a lakh suffix. Read the digits, not the label.
    if (n >= 1000) return { lpa: n / 1e5, confidence: 'high', note: 'rupee figure labelled as lakhs' }
    if (monthly) return { lpa: n * 12, confidence: 'low', note: 'lakhs per month is unusual — check' }
    return { lpa: n, confidence: 'high' }
  }

  if (t.unit === 'thousand') {
    const yearly = monthly ? n * 1000 * 12 : n * 1000
    // "20k stipend" without "month" is almost always monthly, but say so
    if (!monthly && n < 100) return { lpa: (n * 1000 * 12) / 1e5, confidence: 'low', note: 'assumed monthly' }
    return { lpa: yearly / 1e5, confidence: monthly ? 'high' : 'medium' }
  }

  // Bare number
  if (n >= 100000) return { lpa: (monthly ? n * 12 : n) / 1e5, confidence: monthly ? 'medium' : 'high' }
  if (n >= 1000) {
    // 30000 / 40000 are monthly figures typed without a unit
    return monthly
      ? { lpa: (n * 12) / 1e5, confidence: 'high' }
      : { lpa: (n * 12) / 1e5, confidence: 'low', note: 'assumed monthly' }
  }
  // 0 < n < 1000 with no unit: "18", "3.5" — read as LPA, but never certain
  return { lpa: n, confidence: 'medium', note: 'no unit given — read as LPA' }
}

const RANK: Record<Confidence, number> = { high: 2, medium: 1, low: 0 }
const minConf = (...cs: Confidence[]): Confidence => cs.reduce((a, b) => (RANK[a] <= RANK[b] ? a : b))

const round2 = (n: number) => Math.round(n * 100) / 100

/** Below 0.3 LPA (₹2,500/month) or above 200 LPA is not a believable salary. */
function plausible(c: Converted): Converted {
  if (c.lpa > 0 && (c.lpa < 0.3 || c.lpa > 200)) {
    return { ...c, confidence: 'low', note: 'implausible amount — check' }
  }
  return c
}

export function parseMoney(raw: string | undefined | null): MoneyParse {
  const original = (raw ?? '').trim()
  if (!original) return { kind: 'unknown', note: 'blank' }

  const s = original.replace(/[–—]/g, '-').replace(/₹|\binr\b|\brs\.?(?=\s|\d|$)/gi, ' ').replace(/\s+/g, ' ').trim()

  if (NONE_WORDS.test(s)) return { kind: 'none', note: original }
  if (FOREIGN.test(original)) return { kind: 'foreign', note: `non-INR amount: ${original}` }

  const tokens = tokenize(s)
  if (tokens.length === 0) {
    if (NONE_PHRASES.test(s)) return { kind: 'none', note: original }
    return { kind: 'unknown', note: 'no figure given' }
  }

  const monthly = MONTHLY.test(s)

  // "0" / "00" handled above; a lone zero inside text means no pay
  if (tokens.length === 1 && tokens[0].value === 0) return { kind: 'none', note: original }

  // Range: "7-10 LPA", "1 to 3 LPA", "Between 1300000 to 1500000", "40-4500000"
  if (tokens.length >= 2) {
    const [a, b] = tokens
    const between = s.slice(a.end, b.index)
    if (/^\s*(?:-|to|and)\s*$/i.test(between)) {
      // A unit written only after the second number applies to both
      const aTok: Token = a.unit ? a : { ...a, unit: b.unit }
      let lo = toLpa(aTok, monthly)
      const hi = toLpa(b, monthly)
      // "40-4500000": shorthand lakhs on the left, full rupees on the right
      if (!a.unit && a.value < 1000 && b.value >= 100000) {
        lo = { lpa: a.value, confidence: 'medium', note: 'mixed units in range' }
      }
      const extra = tokens.length > 2 ? 'more figures after the range' : undefined
      const [min, max] = lo.lpa <= hi.lpa ? [lo, hi] : [hi, lo]
      const checked = [plausible(min), plausible(max)]
      return {
        kind: 'amount',
        minLpa: round2(checked[0].lpa),
        maxLpa: round2(checked[1].lpa),
        confidence: minConf(checked[0].confidence, checked[1].confidence, extra ? 'medium' : 'high'),
        note: [lo.note, hi.note, extra].filter(Boolean)[0],
      }
    }

    // "8 LPA (Fixed)+ 2 LPA (Variable)": components that add up
    if (/fixed/i.test(s) && /variable/i.test(s) && /\+/.test(between)) {
      const parts = [toLpa(a, monthly), toLpa(b, monthly)]
      const total = plausible({ lpa: parts[0].lpa + parts[1].lpa, confidence: 'medium' })
      return { kind: 'amount', minLpa: round2(total.lpa), maxLpa: round2(total.lpa), confidence: total.confidence, note: 'fixed + variable added' }
    }
  }

  // Single figure, possibly with others around it
  const first = plausible(toLpa(tokens[0], monthly))
  const multiple = tokens.length > 1
  return {
    kind: 'amount',
    minLpa: round2(first.lpa),
    maxLpa: round2(first.lpa),
    // Two unrelated figures ("1400000 holding salary of 11.5") — the first is
    // probably the ask, but a human should confirm before anything is excluded
    confidence: multiple ? 'low' : first.confidence,
    note: multiple ? 'several figures — first one used' : first.note,
  }
}

/** "₹12 L", "₹7.5–10 L" — for display next to the raw text. */
export function formatMoney(p: MoneyParse): string {
  if (p.kind !== 'amount') return p.kind === 'none' ? 'No pay' : p.kind === 'foreign' ? 'Non-INR' : 'Not stated'
  const f = (n: number) => (n >= 100 ? `${round2(n / 100)} Cr` : `${round2(n)} L`)
  return p.minLpa === p.maxLpa ? `₹${f(p.minLpa)}` : `₹${f(p.minLpa)}–${f(p.maxLpa)}`
}
