/**
 * Regression suite for the screening parsers and hard-filter engine.
 *
 * Run with:  npx tsx src/lib/__tests__/parsing.test.mjs
 *
 * These cover the messy real-world formats candidates actually type into forms.
 * Two production bugs were caught here and are locked in below:
 *   - "30 days" parsed as 0 (unanchored "0 day" matched inside "3[0 day]s")
 *   - "10 years 0 months" parsed as 0 (unanchored "0 year" matched inside "1[0 year]s")
 */
import {
  parseCtcToLPA,
  parseExperienceYears,
  parseNoticePeriodDays,
  locationMatches,
} from '../candidateParsing.ts'
import {
  evaluateCriteria,
  evaluateEffort,
  buildFingerprintIndex,
} from '../screeningFilters.ts'
import { identifyKeyColumns, isNoiseColumn } from '../googleSheets.ts'

let failures = 0
let passes = 0

function check(label, got, want) {
  const ok =
    want === undefined
      ? got === undefined
      : typeof want === 'number'
      ? Math.abs(got - want) < 0.01
      : got === want
  if (ok) passes++
  else {
    failures++
    console.log(`✗ ${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`)
  }
}

// ─────────────── CTC ───────────────
;[
  ['12 LPA', 12],
  ['₹15,00,000', 15],
  ['1200000', 12],
  ['15L', 15],
  ['12-15 LPA', 13.5],
  ['8.5 lpa', 8.5],
  ['Negotiable', undefined],
  ['1.2 Cr', 120],
  ['50000 per month', 6],
  ['120K', 1.2],
  ['', undefined],
  ['   ', undefined],
  ['abc', undefined],
  ['0', undefined],
  ['₹ 18,50,000 per annum', 18.5],
  ['30 LPA', 30],
  ['Rs. 25 lakhs', 25],
  ['as per company norms', undefined],
  ['10 to 12 lpa', 11],
  ['9.75', 9.75],
  ['100000', 1],
].forEach(([input, want]) => check(`CTC "${input}"`, parseCtcToLPA(input), want))

// ─────────────── Experience ───────────────
;[
  ['3 years', 3],
  ['3.5', 3.5],
  ['3 yrs 6 months', 3.5],
  ['Fresher', 0],
  ['0-1 years', 0.5],
  ['5+', 5],
  ['18 months', 1.5],
  ['2019', undefined], // a year, not a duration
  ['', undefined],
  ['N/A', undefined],
  ['10 years 0 months', 10], // regression: must not match "0 year" inside "10 years"
  ['0.5', 0.5],
  ['6 months', 0.5],
  ['1 yr', 1],
  ['12+ years', 12],
  ['100', undefined],
  ['0 years', 0],
].forEach(([input, want]) => check(`EXP "${input}"`, parseExperienceYears(input), want))

// ─────────────── Notice period ───────────────
;[
  ['30 days', 30], // regression: must not match "0 day" inside "30 days"
  ['Immediate', 0],
  ['2 months', 60],
  ['60', 60],
  ['90 days', 90],
  ['3', 90],
  ['Serving notice - 45 days', 45],
  ['', undefined],
  ['1 month', 30],
  ['45 days', 45],
  ['immediate joiner', 0],
  ['0 days', 0],
  ['120 days', 120],
  ['2 weeks', 14],
  ['Currently serving 60 days', 60],
].forEach(([input, want]) => check(`NOTICE "${input}"`, parseNoticePeriodDays(input), want))

// ─────────────── Location matching ───────────────
check('loc exact', locationMatches('Bangalore', ['Bangalore'], false), true)
check('loc substring', locationMatches('Bangalore, Karnataka', ['Bangalore'], false), true)
check('loc mismatch', locationMatches('Delhi', ['Bangalore'], false), false)
check('loc remote allowed', locationMatches('Remote', ['Bangalore'], true), true)
check('loc remote blocked', locationMatches('Remote', ['Bangalore'], false), false)
check('loc no criteria = any', locationMatches('Anywhere', [], false), true)
check('loc blank candidate fails', locationMatches('', ['Bangalore'], true), false)

// ─────────────── Hard filters ───────────────
const mk = (o = {}) => ({
  id: o.id || '1',
  jobId: 'j',
  name: 'X',
  responses: o.responses || { q: 'a'.repeat(200) },
  status: 'applied',
  shortlistLevel: 0,
  ...o,
})
const BASE = {
  enabled: true,
  locations: [],
  allowRemote: true,
  requireResume: false,
  requireEmail: false,
  mode: 'reject',
}

check('over budget', evaluateCriteria(mk({ ctcExpected: 20 }), { ...BASE, maxCtc: 15 }).failures.includes('ctc'), true)
check('within budget', evaluateCriteria(mk({ ctcExpected: 12 }), { ...BASE, maxCtc: 15 }).failures.length, 0)
// Missing data must never disqualify — a blank column shouldn't reject a good candidate
check('missing CTC never fails', evaluateCriteria(mk({}), { ...BASE, maxCtc: 15 }).failures.length, 0)
check('under-experienced', evaluateCriteria(mk({ experienceYears: 1 }), { ...BASE, minExperience: 3 }).failures.includes('min_experience'), true)
check('over-experienced', evaluateCriteria(mk({ experienceYears: 15 }), { ...BASE, maxExperience: 8 }).failures.includes('max_experience'), true)
check('notice too long', evaluateCriteria(mk({ noticePeriodDays: 90 }), { ...BASE, maxNoticePeriod: 30 }).failures.includes('notice_period'), true)
check('disabled bypasses all', evaluateCriteria(mk({ ctcExpected: 99 }), { ...BASE, enabled: false, maxCtc: 5 }).failures.length, 0)
check('email required', evaluateCriteria(mk({}), { ...BASE, requireEmail: true }).failures.includes('no_email'), true)

// ─────────────── Effort + duplicates ───────────────
const dupA = mk({ id: 'a', responses: { q: 'identical response text here '.repeat(12) } })
const dupB = mk({ id: 'b', responses: { q: 'identical response text here '.repeat(12) } })
const unique = mk({ id: 'c', responses: { q: 'a completely different and unique answer with plenty of substance '.repeat(6) } })
const index = buildFingerprintIndex([dupA, dupB, unique])

check('duplicate detected', evaluateEffort(dupA, index).failures.includes('duplicate'), true)
check('unique not flagged', evaluateEffort(unique, index).failures.includes('duplicate'), false)
check('empty responses', evaluateEffort(mk({ responses: {} }), index).failures.includes('no_responses'), true)
check('too short', evaluateEffort(mk({ responses: { q: 'yes' } }), index).failures.includes('insufficient_content'), true)

// ─────────────── Real-world sheet regressions ───────────────
// These come from a live 1553-applicant Typeform export.

// CTC unit confusion: absolute rupees written with a "lakh"/"LPA" suffix
check('CTC "1600000 Lakh rupees"', parseCtcToLPA('1600000 Lakh rupees'), 16)
check('CTC "13,00,000 LPA"', parseCtcToLPA('13,00,000 LPA'), 13)
check('CTC "1000000 Lacs Per Annum"', parseCtcToLPA('1000000 Lacs Per Annum'), 10)
check('CTC "650000 LPA"', parseCtcToLPA('650000 LPA'), 6.5)

// Foreign currency: refuse rather than mis-convert. A wrong CTC disqualifies a
// good candidate; an unknown CTC never fails a filter.
check('CTC "$3000" → unknown', parseCtcToLPA('$3000'), undefined)
check('CTC "$4,801 per year." → unknown', parseCtcToLPA('$4,801 per year.'), undefined)
check('CTC "12,000,000 naira" → unknown', parseCtcToLPA('12,000,000 naira'), undefined)
check('CTC "45000 AED" → unknown', parseCtcToLPA('45000 AED'), undefined)

// Implausible values are rejected rather than silently wrong
check('CTC "0" → unknown', parseCtcToLPA('0'), undefined)
check('CTC "na" → unknown', parseCtcToLPA('na'), undefined)
check('CTC "As per company norms" → unknown', parseCtcToLPA('As per company norms'), undefined)
check('CTC "9000000" → 90 LPA', parseCtcToLPA('9000000'), 90)

// Banded dropdown answers
check('EXP "2+ years"', parseExperienceYears('2+ years'), 2)
check('EXP "0-1 years"', parseExperienceYears('0-1 years'), 0.5)
check('EXP "1-2 years"', parseExperienceYears('1-2 years'), 1.5)
check('NOTICE "15-30 days"', parseNoticePeriodDays('15-30 days'), 22.5)

// Noise-column detection must not swallow real screening questions.
// Regression: "a senior stakeholder completely disagrees" matched a bare
// /agree/ rule and silently dropped an entire question for every candidate.
const longQuestion =
  'You strongly believe a new engagement feature must go live before a major cricket tournament, but a senior stakeholder completely disagrees on its priority. How do you handle it?'
check('long question is NOT noise', isNoiseColumn(longQuestion), false)
check('"Token" is noise', isNoiseColumn('Token'), true)
check('"Submitted At" is noise', isNoiseColumn('Submitted At'), true)
check('"Current Salary/Pay (annual)" is noise', isNoiseColumn('Current Salary/Pay (annual)'), true)
check('"LinkedIn Profile / Portfolio Link" is noise', isNoiseColumn('LinkedIn Profile / Portfolio Link'), true)
check('"Where did you hear about this position?" is noise', isNoiseColumn('Where did you hear about this position?'), true)

// Column detection against the real header set
const realHeaders = [
  'Name', 'Email Address', 'Which Country are you applying from?', 'Phone Number',
  'Total Experience', 'Name of Institute, Course & Passing out year.',
  longQuestion, 'Current Company', 'Current Salary/Pay (annual)',
  'Expected Salary/Pay (annual)', 'How soon can you join? ',
  'Where did you hear about this position?', 'LinkedIn Profile / Portfolio Link',
  'Please upload your resume.', 'Submitted At', 'Token',
]
const detected = identifyKeyColumns(realHeaders)
check('detect name', detected.nameColumn, 'Name')
check('detect email', detected.emailColumn, 'Email Address')
check('detect phone', detected.phoneColumn, 'Phone Number')
// Must pick the resume upload, NOT the LinkedIn/portfolio link
check('detect resume (not LinkedIn)', detected.resumeColumn, 'Please upload your resume.')
// Must pick EXPECTED salary, not CURRENT
check('detect expected CTC (not current)', detected.ctcColumn, 'Expected Salary/Pay (annual)')
check('detect experience', detected.experienceColumn, 'Total Experience')
check('detect notice', detected.noticePeriodColumn, 'How soon can you join? ')
check('detect country as location', detected.locationColumn, 'Which Country are you applying from?')
check('screening question survives filtering', detected.responseColumns.includes(longQuestion), true)
check('token excluded from AI input', detected.responseColumns.includes('Token'), false)

console.log(
  failures === 0
    ? `\n✓ All ${passes} assertions passed`
    : `\n${failures} FAILURES (${passes} passed)`
)
process.exit(failures === 0 ? 0 : 1)
