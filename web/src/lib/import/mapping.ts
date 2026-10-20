/**
 * Maps the columns of an applications sheet onto the fields HireEasy needs.
 *
 * Headers are scored rather than substring-matched, because form headers
 * overlap: "LinkedIn Profile" contains "link", "Name of Institute" contains
 * "name", "Current Salary" and "Expected Salary" both contain "salary". The
 * HR always confirms the mapping on screen; this only proposes it.
 */

export const FIELDS = [
  'externalId',
  'submittedAt',
  'name',
  'email',
  'phone',
  'resume',
  'expectedSalary',
  'currentSalary',
  'experience',
  'notice',
  'location',
  'education',
  'degree',
  'graduationYear',
  'currentCompany',
  'profileLink',
] as const
export type Field = (typeof FIELDS)[number]

export const FIELD_LABELS: Record<Field, string> = {
  externalId: 'Submission ID',
  submittedAt: 'Submitted at',
  name: 'Name',
  email: 'Email',
  phone: 'Phone',
  resume: 'Resume link',
  expectedSalary: 'Expected salary',
  currentSalary: 'Current salary',
  experience: 'Total experience',
  notice: 'Notice period',
  location: 'Location / country',
  education: 'College & course',
  degree: 'Degree',
  graduationYear: 'Graduation year',
  currentCompany: 'Current company',
  profileLink: 'LinkedIn / portfolio',
}

type Rule = [RegExp, number]

const RULES: Record<Field, Rule[]> = {
  externalId: [[/^(token|response\s*id|submission\s*id|#)$/i, 100]],
  submittedAt: [[/^(submitted\s*at|timestamp|submission\s*(time|date)|date\s*submitted)$/i, 100]],
  name: [
    [/^(full\s*)?name$/i, 100],
    [/^candidate\s*name/i, 95],
    [/your\s*(full\s*)?name/i, 90],
    [/\bname\b/i, 40],
    [/company|organi[sz]|college|universit|school|institut|referr|manager|project/i, -150],
  ],
  email: [
    [/^e-?mail(\s*(id|address))?$/i, 100],
    [/e-?mail/i, 80],
  ],
  phone: [
    [/^(phone|mobile|contact)(\s*(no\.?|number))?$/i, 100],
    [/phone|mobile|whatsapp|contact\s*(no|number)/i, 75],
    [/emergency/i, -100],
  ],
  resume: [
    [/upload.*(resume|cv)/i, 100],
    [/\bresume\b|curriculum\s*vitae|\bcv\b/i, 90],
    [/linkedin|github|portfolio|behance|dribbble|website|twitter/i, -150],
  ],
  expectedSalary: [
    // Allow a few words between: "Expected annual CTC (in rupees)"
    [/\bexpected\b.{0,20}\b(ctc|salary|compensation|package|pay)\b/i, 100],
    [/(salary|ctc)\s*expect/i, 95],
    [/desired\s*(salary|compensation|ctc)/i, 90],
    [/current|present|last\s*drawn/i, -150],
  ],
  currentSalary: [
    [/\b(current|present)\b.{0,20}\b(ctc|salary|compensation|package|pay)\b/i, 100],
    [/last\s*drawn/i, 90],
    [/expected|desired/i, -150],
  ],
  experience: [
    [/(total|overall|years?\s*of)\s*(work\s*)?experience/i, 100],
    [/^experience/i, 90],
    [/\bexperience\b/i, 50],
    // "Describe your experience with X" is an answer, not a number
    [/describe|tell us|explain|share|elaborate|example|how do you|what/i, -150],
  ],
  notice: [
    [/notice\s*period/i, 100],
    [/how\s*soon.*join/i, 95],
    [/joining\s*(time|date|availab)|availab\w*\s*to\s*(join|start)/i, 85],
    [/\bnotice\b/i, 70],
  ],
  location: [
    [/(which|what)\s*(country|city|location)/i, 100],
    [/current\s*(location|city|country)/i, 100],
    [/^(location|city|country)$/i, 95],
    [/applying\s*from|based\s*(in|out of)/i, 85],
    [/\b(location|city|country)\b/i, 50],
  ],
  education: [
    [/institut|college|universit|alma\s*mater/i, 100],
    [/\b(education|qualification|degree)\b/i, 80],
    [/passing\s*out|graduat/i, 60],
  ],
  degree: [
    [/\bdegree\b|speciali[sz]ation|\bcourse\b|\bmajor\b/i, 100],
  ],
  graduationYear: [
    [/(graduat\w*|passing\s*out|pass[\s-]*out)\s*year|year\s*of\s*(graduation|passing)/i, 100],
  ],
  currentCompany: [
    [/(current|present)\s*(company|employer|organi[sz]ation)/i, 100],
    [/^company$/i, 90],
  ],
  profileLink: [
    [/linkedin|portfolio|github|behance|website/i, 100],
  ],
}

/**
 * Columns that are neither a field nor a screening answer: form metadata,
 * consent boxes, and the output of earlier screening tools. The last group
 * matters — a stale "Screening Status" or "Resume Score" column must never be
 * read as a candidate's answer or as a signal.
 */
const NOISE_EXACT =
  /^(id|uuid|row\s*(id|number)?|status|score|source|network\s*id|ending|start\s*date|stage\s*date|tags?|screening\s*(status|justification)|resume\s*score|interview\s*(shortlisted|token|slot)|email\s*sent|needs\s*a\s*glance|what\s*we\s*changed)$/i

const NOISE_PHRASE = [
  /where did you (hear|find|come across)/i,
  /how did you (hear|find)/i,
  /\breferr(al|ed)\s*by\b/i,
  /\bconsent\b/i,
  /\bi\s+agree\b/i, // word-anchored: plain "agree" matches "disagrees"
  /\bterms\s*(and|&)\s*conditions\b/i,
  /\bprivacy\s*policy\b/i,
  /\bdeclaration\b/i,
]

/**
 * Real screening questions are long prose; metadata headers are short labels.
 * The length guard stops a keyword inside a scenario question ("a senior
 * stakeholder completely disagrees") from discarding the whole question.
 */
const MAX_METADATA_HEADER = 80

export function isNoiseColumn(header: string): boolean {
  const h = header.trim()
  if (!h) return true
  if (NOISE_EXACT.test(h)) return true
  if (h.length > MAX_METADATA_HEADER) return false
  return NOISE_PHRASE.some(re => re.test(h))
}

const score = (header: string, rules: Rule[]) => rules.reduce((s, [re, pts]) => (re.test(header) ? s + pts : s), 0)

export type FieldMapping = Partial<Record<Field, string>>

export interface ColumnMapping {
  fields: FieldMapping
  /** Columns holding screening answers, in sheet order */
  questionColumns: string[]
  /** Columns deliberately left out, so the HR can see and reclaim them */
  ignoredColumns: string[]
}

/**
 * Propose a mapping. Long headers are screening questions and are never
 * claimed as fields — a scenario question mentioning "experience" is still a
 * question.
 */
export function proposeMapping(headers: string[]): ColumnMapping {
  const claimed = new Set<string>()
  const fields: FieldMapping = {}
  const candidates = headers.filter(h => h.trim().length <= MAX_METADATA_HEADER)

  // Each field takes its best unclaimed header; most distinctive fields go first
  const order: Field[] = ['externalId', 'submittedAt', 'email', 'resume', 'profileLink', 'expectedSalary', 'currentSalary', 'phone', 'education', 'degree', 'graduationYear', 'currentCompany', 'name', 'experience', 'notice', 'location']
  for (const field of order) {
    let best: { h: string; s: number } | null = null
    for (const h of candidates) {
      if (claimed.has(h)) continue
      const s = score(h, RULES[field])
      if (s > 0 && (!best || s > best.s)) best = { h, s }
    }
    if (best) {
      fields[field] = best.h
      claimed.add(best.h)
    }
  }

  const questionColumns: string[] = []
  const ignoredColumns: string[] = []
  for (const h of headers) {
    if (claimed.has(h)) continue
    if (isNoiseColumn(h)) ignoredColumns.push(h)
    else questionColumns.push(h)
  }
  return { fields, questionColumns, ignoredColumns }
}
