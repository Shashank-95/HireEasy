interface SheetData {
  headers: string[]
  rows: Record<string, string>[]
  rawRows: string[][]
}

export function extractSheetId(url: string): string | null {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  return match ? match[1] : null
}

export function inferHeaders(rows: string[][]): string[] {
  if (rows.length === 0) return []

  const firstRow = rows[0]
  const secondRow = rows.length > 1 ? rows[1] : null

  // Count how many cells in the first row look like data vs. headers
  let dataLikeCells = 0
  const totalNonEmpty = firstRow.filter(c => c.trim()).length

  for (const cell of firstRow) {
    const trimmed = cell.trim()
    if (!trimmed) continue
    const isEmail = /\S+@\S+\.\S+/.test(trimmed)
    const isPhone = /^\+?[\d\s()-]{7,15}$/.test(trimmed)
    // Pure number (not something like "Q1" or "Part 2")
    const isPureNumber = /^\d+(\.\d+)?$/.test(trimmed)
    if (isEmail || isPhone || isPureNumber) dataLikeCells++
  }

  // If majority of non-empty cells are NOT data-like, treat first row as headers
  // This is intentionally lenient — Google Forms, CSVs, and most sheets have header rows
  const dataRatio = totalNonEmpty > 0 ? dataLikeCells / totalNonEmpty : 0
  const isFirstRowHeaders = dataRatio < 0.5

  // Additional heuristic: if we have a second row, compare patterns
  // If first row is all text and second row has emails/numbers, first row is headers
  if (!isFirstRowHeaders && secondRow) {
    let secondRowDataCells = 0
    for (const cell of secondRow) {
      const trimmed = cell.trim()
      if (!trimmed) continue
      const isEmail = /\S+@\S+\.\S+/.test(trimmed)
      const isPhone = /^\+?[\d\s()-]{7,15}$/.test(trimmed)
      const isPureNumber = /^\d+(\.\d+)?$/.test(trimmed)
      if (isEmail || isPhone || isPureNumber) secondRowDataCells++
    }
    // If second row has more data-like cells, first row is probably headers
    if (secondRowDataCells > dataLikeCells) {
      return firstRow.map(h => h.trim() || 'Unnamed')
    }
  }

  if (isFirstRowHeaders) {
    return firstRow.map(h => h.trim() || 'Unnamed')
  }

  // Fallback: generate column names from data patterns
  return firstRow.map((_, i) => inferColumnName(rows.map(r => r[i] || ''), i))
}

function inferColumnName(columnValues: string[], index: number): string {
  const samples = columnValues.slice(0, 10).filter(Boolean)
  if (samples.length === 0) return `Column ${index + 1}`

  const allEmails = samples.every(v => /\S+@\S+\.\S+/.test(v))
  if (allEmails) return 'Email'

  const allPhones = samples.every(v => /^\+?[\d\s-]{7,15}$/.test(v.trim()))
  if (allPhones) return 'Phone'

  const allNumbers = samples.every(v => !isNaN(Number(v.replace(/[,₹$]/g, ''))))
  if (allNumbers) {
    const avg = samples.reduce((a, v) => a + Number(v.replace(/[,₹$]/g, '')), 0) / samples.length
    if (avg > 100000) return 'CTC/Salary'
    if (avg > 0 && avg < 50) return 'Experience (Years)'
    return `Numeric ${index + 1}`
  }

  const allUrls = samples.every(v => /^https?:\/\//.test(v.trim()))
  if (allUrls) return 'Resume/Link'

  const allShort = samples.every(v => v.trim().split(/\s+/).length <= 4)
  if (allShort && index === 0) return 'Name'

  const avgLength = samples.reduce((a, v) => a + v.length, 0) / samples.length
  if (avgLength > 100) return `Response ${index + 1}`

  return `Column ${index + 1}`
}

export function parseSheetData(rawData: string[][]): SheetData {
  if (rawData.length === 0) return { headers: [], rows: [], rawRows: [] }

  const headers = inferHeaders(rawData)
  // Check if first row is the header by comparing each element
  const firstRowTrimmed = rawData[0].map(h => h.trim() || 'Unnamed')
  const isFirstRowHeader = headers.length === firstRowTrimmed.length &&
    headers.every((h, i) => h === firstRowTrimmed[i])
  const dataStartRow = isFirstRowHeader ? 1 : 0
  const dataRows = rawData.slice(dataStartRow)

  const rows = dataRows.map(row => {
    const record: Record<string, string> = {}
    headers.forEach((header, i) => {
      record[header] = row[i] || ''
    })
    return record
  })

  return { headers, rows, rawRows: dataRows }
}

/**
 * Scored matcher. Each rule is [regex, score]; the highest-scoring header wins.
 *
 * Scoring beats naive `includes()` because form headers overlap heavily:
 * "LinkedIn Profile" would match a plain `includes('link')` resume rule, and
 * "Name of your current company" would match `includes('name')`. Negative rules
 * let us actively push those away from the wrong field.
 */
type Rule = [RegExp, number]

const FIELD_RULES: Record<string, Rule[]> = {
  name: [
    [/^(full\s*)?name$/i, 100],
    [/^candidate\s*name/i, 95],
    [/your\s*name/i, 90],
    [/first\s*name/i, 70],
    [/\bname\b/i, 40],
    // Push away from company/college/referrer names
    [/company|organis|organiz|college|university|school|referr|manager|project/i, -100],
  ],
  email: [
    [/^e-?mail(\s*(id|address))?$/i, 100],
    [/e-?mail/i, 80],
    [/\bmail\s*id\b/i, 70],
  ],
  phone: [
    [/^(phone|mobile|contact)(\s*(no|number))?$/i, 100],
    [/phone|mobile\s*(no|number)/i, 80],
    [/whatsapp/i, 60],
    [/contact\s*(no|number)/i, 70],
    [/emergency/i, -60],
  ],
  resume: [
    [/^resume$/i, 100],
    [/resume|curriculum\s*vitae/i, 90],
    [/\bcv\b/i, 80],
    [/upload.*(resume|cv)/i, 95],
    // LinkedIn/portfolio are NOT resumes
    [/linkedin|github|portfolio|behance|dribbble|website|twitter/i, -100],
  ],
  ctc: [
    [/expected\s*(ctc|salary|compensation|package)/i, 100],
    [/\bctc\b/i, 75],
    [/salary\s*expect/i, 95],
    [/expected.*(pay|remuneration)/i, 85],
    [/desired\s*(salary|compensation)/i, 90],
    [/\b(lpa|package)\b/i, 55],
    // Current CTC is a weaker signal than expected CTC but still usable
    [/current\s*(ctc|salary)/i, 45],
  ],
  experience: [
    [/(total|overall|years?\s*of)\s*experience/i, 100],
    [/^experience/i, 90],
    [/\bexperience\b/i, 60],
    [/\byears?\s*(in|of)\b/i, 55],
    [/relevant\s*experience/i, 85],
    // "Describe your experience with X" is a response, not a number
    [/describe|tell us|explain|share|elaborate|example/i, -100],
  ],
  noticePeriod: [
    [/notice\s*period/i, 100],
    [/\bnotice\b/i, 80],
    [/how\s*soon.*join/i, 85],
    [/joining\s*(time|date|availab)/i, 80],
    [/availability\s*to\s*(join|start)/i, 85],
    [/last\s*working\s*day/i, 70],
  ],
  location: [
    [/current\s*(location|city)/i, 100],
    [/^(location|city|country)$/i, 95],
    [/preferred\s*(location|city)/i, 85],
    [/(which|what)\s*(country|city|location)/i, 90],
    [/applying\s*from/i, 88],
    [/base[d]?\s*(in|location)/i, 80],
    [/\b(location|city|country)\b/i, 55],
    [/relocat/i, 50],
  ],
}

/**
 * Metadata columns that shouldn't be sent to the LLM as screening answers.
 * A random 32-char submission token is pure noise, and "where did you hear
 * about us" says nothing about fit — both waste tokens and dilute the signal.
 */
const NOISE_EXACT = /^(timestamp|submitted\s*at|submission\s*(id|time|date)|token|id|uuid|row\s*(id|number)?|status|score|source)$/i

const NOISE_PHRASE = [
  /where did you (hear|find)/i,
  /how did you (hear|find)/i,
  /\breferr(al|ed)\s*by\b/i,
  /current\s*(company|employer|salary|ctc|organisation|organization)/i,
  /\blinkedin\b/i,
  /\bgithub\b/i,
  /\bportfolio\b/i,
  /\bconsent\b/i,
  /\bi\s+agree\b/i,          // word-anchored: plain "agree" matches "disagrees"
  /\bterms\s*(and|&)\s*conditions\b/i,
  /\bprivacy\s*policy\b/i,
  /\bdeclaration\b/i,
]

/**
 * Real screening questions are long-form prose; metadata headers are short
 * labels. This length guard stops a keyword buried inside a 200-character
 * scenario question from disqualifying it — e.g. "a senior stakeholder
 * completely disagrees" once matched the consent rule and silently dropped
 * an entire screening question.
 */
const MAX_METADATA_HEADER_LENGTH = 80

/** True when a header is metadata rather than a screening answer. */
export function isNoiseColumn(header: string): boolean {
  const h = header.trim()
  if (NOISE_EXACT.test(h)) return true
  // Anything long enough to be a real question is never treated as metadata
  if (h.length > MAX_METADATA_HEADER_LENGTH) return false
  return NOISE_PHRASE.some(re => re.test(h))
}

function scoreHeader(header: string, rules: Rule[]): number {
  let score = 0
  for (const [re, points] of rules) {
    if (re.test(header)) score += points
  }
  return score
}

export interface KeyColumns {
  nameColumn: string | null
  emailColumn: string | null
  phoneColumn: string | null
  resumeColumn: string | null
  ctcColumn: string | null
  experienceColumn: string | null
  noticePeriodColumn: string | null
  locationColumn: string | null
  responseColumns: string[]
}

export function identifyKeyColumns(headers: string[]): KeyColumns {
  const claimed = new Set<string>()

  /** Pick the best-scoring unclaimed header for a field. */
  const pick = (field: keyof typeof FIELD_RULES): string | null => {
    let best: { header: string; score: number } | null = null
    for (const h of headers) {
      if (claimed.has(h)) continue
      const score = scoreHeader(h, FIELD_RULES[field])
      if (score > 0 && (!best || score > best.score)) {
        best = { header: h, score }
      }
    }
    if (best) {
      claimed.add(best.header)
      return best.header
    }
    return null
  }

  // Order matters: the most specific / highest-confidence fields claim first
  const emailColumn = pick('email')
  const nameColumn = pick('name')
  const phoneColumn = pick('phone')
  const resumeColumn = pick('resume')
  const ctcColumn = pick('ctc')
  const experienceColumn = pick('experience')
  const noticePeriodColumn = pick('noticePeriod')
  const locationColumn = pick('location')

  const responseColumns = headers.filter(h => !claimed.has(h) && !isNoiseColumn(h))

  return {
    nameColumn,
    emailColumn,
    phoneColumn,
    resumeColumn,
    ctcColumn,
    experienceColumn,
    noticePeriodColumn,
    locationColumn,
    responseColumns,
  }
}
