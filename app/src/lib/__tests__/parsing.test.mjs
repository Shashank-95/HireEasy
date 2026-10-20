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
  PEDIGREE_COLUMN,
  modelVisibleAnswers,
  redactIdentity,
} from '../screeningFilters.ts'
import { dedupeCandidates } from '../dedupe.ts'
import { analyseSkillEvidence, rebalanceToEvidenced } from '../skillEvidence.ts'
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

// ─────────────── Identity dedupe ───────────────
const mkc = (id, name, email, phone) => ({
  id, jobId: 'j', name, email, phone,
  responses: { q: 'answer '.repeat(40) }, status: 'applied', shortlistLevel: 0,
})

const deduped = dedupeCandidates([
  mkc('1', 'Kabir Seth', 'kabir.seth.qa@gmail.com', '9111111111'),
  mkc('2', 'Kabir Sethh', 'kabir.seth.qa@gmail.com', '9111111111'),  // same person, typo'd name
  mkc('3', 'Someone Else', 'other@gmail.com', '9222222222'),
])
check('dedupe collapses repeat email', deduped.unique.length, 2)
check('dedupe keeps the later submission', deduped.unique[0].name, 'Kabir Sethh')
check('dedupe records the match reason', deduped.removed[0].matchedOn, 'email')

// Gmail dots and +tags address the same inbox
const gmailVariants = dedupeCandidates([
  mkc('1', 'A', 'first.last@gmail.com', ''),
  mkc('2', 'B', 'firstlast+jobs@gmail.com', ''),
])
check('dedupe normalises gmail dots and +tags', gmailVariants.unique.length, 1)
// ...but only for Gmail — other providers treat dots as significant
const otherProvider = dedupeCandidates([
  mkc('1', 'A', 'first.last@company.com', ''),
  mkc('2', 'B', 'firstlast@company.com', ''),
])
check('dedupe keeps non-gmail dots distinct', otherProvider.unique.length, 2)

// Different email, same phone — still one person
const samePhone = dedupeCandidates([
  mkc('1', 'A', 'a@x.com', '+91 98123 45678'),
  mkc('2', 'A', 'b@x.com', '098123 45678'),
])
check('dedupe matches on phone across email change', samePhone.unique.length, 1)
check('two genuinely distinct people survive', dedupeCandidates([
  mkc('1', 'A', 'a@x.com', '9111111111'),
  mkc('2', 'B', 'b@x.com', '9222222222'),
]).unique.length, 2)

// Placeholder phones typed to get past a required field are not identity
check('placeholder phones never merge strangers', dedupeCandidates([
  mkc('1', 'A', 'a@x.com', '0000000000'),
  mkc('2', 'B', 'b@x.com', '0000000000'),
  mkc('3', 'C', 'c@x.com', '1234567890'),
  mkc('4', 'D', 'd@x.com', '1234567890'),
  mkc('5', 'E', 'e@x.com', '+91 98765 43210'),
  mkc('6', 'F', 'f@x.com', '9876543210'),
]).unique.length, 6)
check('placeholder emails never merge strangers', dedupeCandidates([
  mkc('1', 'A', 'na@na.com', '9111111111'),
  mkc('2', 'B', 'NA@na.com', '9222222222'),
]).unique.length, 2)

// A number shared by many different applicants is a placement cell, not a person
check('shared contact number does not collapse a whole campus', dedupeCandidates([
  mkc('1', 'A', 'a@x.com', '9333333331'),
  mkc('2', 'B', 'b@x.com', '9333333331'),
  mkc('3', 'C', 'c@x.com', '9333333331'),
  mkc('4', 'D', 'd@x.com', '9333333331'),
]).unique.length, 4)

// Transitive: 1↔2 share an email, 2↔3 share a phone — one person, last row kept
const chain = dedupeCandidates([
  mkc('1', 'First', 'p@x.com', '9444444441'),
  mkc('2', 'Second', 'p@x.com', '9555555551'),
  mkc('3', 'Third', 'q@x.com', '9555555551'),
])
check('transitive repeats collapse to one', chain.unique.length, 1)
check('transitive keeps the latest row', chain.unique[0].name, 'Third')
check('every removed row points at the survivor', chain.removed.every(r => r.keptName === 'Third'), true)
check('googlemail.com is the same inbox as gmail.com', dedupeCandidates([
  mkc('1', 'A', 'first.last@googlemail.com', ''),
  mkc('2', 'B', 'firstlast@gmail.com', ''),
]).unique.length, 1)

// ─────────────── Skill evidence ───────────────
// The failure this guards: a JD demands SQL, so it gets 30% of the rubric — but
// no screening question asks about SQL, so every candidate scores ~0 on it.
// That's a constant, not a signal.
const pmAnswers = [
  'I would triage the uninstall spike first, pull the funnel data and check retention cohorts before drafting the PRD.',
  'I would quantify demand using analytics rather than social noise, then run an experiment with a clear success metric.',
  'I would use Claude to cluster the reviews into themes and validate the top three against our retention data.',
]
const asCandidates = pmAnswers.map((a, i) => ({
  id: String(i), jobId: 'j', name: 'C' + i,
  responses: { scenario: a }, status: 'applied', shortlistLevel: 0,
}))

const skillSet = [
  { id: 's1', name: 'SQL', weight: 30, type: 'technical' },
  { id: 's2', name: 'Python', weight: 20, type: 'technical' },
  { id: 's3', name: 'Data Analysis', weight: 25, type: 'technical' },
  { id: 's4', name: 'AI Tools', weight: 25, type: 'technical' },
]
const report = analyseSkillEvidence(skillSet, asCandidates)
const bySkill = Object.fromEntries(report.perSkill.map(p => [p.skill.name, p]))
check('SQL flagged as unmeasurable', bySkill['SQL'].underEvidenced, true)
check('Python flagged as unmeasurable', bySkill['Python'].underEvidenced, true)
check('Data Analysis is measurable', bySkill['Data Analysis'].underEvidenced, false)
check('AI Tools is measurable', bySkill['AI Tools'].underEvidenced, false)
check('wasted weight is summed', report.wastedWeight, 50)

// Rebalancing must move weight onto measurable skills and still total 100
const rebalanced = rebalanceToEvidenced(skillSet, report)
check('rebalanced total is exactly 100', rebalanced.reduce((s, x) => s + x.weight, 0), 100)
check('unmeasurable skill drops to 0', rebalanced.find(s => s.name === 'SQL').weight, 0)
check('measurable skill gains weight', rebalanced.find(s => s.name === 'Data Analysis').weight > 25, true)

// A low-weight skill isn't worth warning about even if unevidenced
const minorSkill = analyseSkillEvidence(
  [{ id: 'm', name: 'Kubernetes', weight: 5, type: 'technical' }], asCandidates)
check('low-weight unevidenced skill not flagged', minorSkill.perSkill[0].underEvidenced, false)

// Short terms must match whole words: "ai" lives inside said / maintain / explain,
// and "Attention to Detail" must not inherit the AI synonyms via "det-ai-l"
const noAiAnswers = ['I said we should maintain the main funnel and explain the trade-off in detail.']
  .map((a, i) => ({ id: String(i), jobId: 'j', name: 'N' + i, responses: { q: a }, status: 'applied', shortlistLevel: 0 }))
const aiProbe = analyseSkillEvidence([
  { id: 'a', name: 'AI Tools', weight: 40, type: 'technical' },
  { id: 'd', name: 'Attention to Detail', weight: 30, type: 'behavioral' },
  { id: 'p', name: 'Product Sense', weight: 30, type: 'nontech' },
], noAiAnswers)
const aiBy = Object.fromEntries(aiProbe.perSkill.map(p => [p.skill.name, p]))
check('"ai" inside ordinary words is not AI evidence', aiBy['AI Tools'].underEvidenced, true)
check('Attention to Detail matched on its own words', aiBy['Attention to Detail'].underEvidenced, false)
check('synonyms still apply on whole-word keys (Product Sense ← trade-off)', aiBy['Product Sense'].underEvidenced, false)

// ─────────────── Blind screening ───────────────
check('institute column is pedigree', PEDIGREE_COLUMN.test('Name of Institute, Course & Passing out year.'), true)
check('country column is pedigree', PEDIGREE_COLUMN.test('Which Country are you applying from?'), true)
check('scenario question is NOT pedigree', PEDIGREE_COLUMN.test(longQuestion), false)
check('CTC column is NOT pedigree', PEDIGREE_COLUMN.test('Expected Salary/Pay (annual)'), false)

// Unanchored "age" matched inside manage / leverage / engage — real skill questions
;[
  'How do you manage stakeholders who disagree?',
  'How would you leverage data to prioritise the roadmap?',
  'How would you engage users in the first week?',
  'To what degree did you own the roadmap?',
  'Describe the image recognition feature you shipped',
].forEach(q => check(`skill question kept: ${q}`, PEDIGREE_COLUMN.test(q), false))
;[
  'Highest Degree',
  'Age',
  'Your CGPA',
  'Date of Birth',
  'Graduation Year',
  'Passing out year',
  'Gender',
].forEach(q => check(`pedigree column hidden: ${q}`, PEDIGREE_COLUMN.test(q), true))

const blindAnswers = { 'Name of Institute': 'IIT Delhi', 'How do you manage stakeholders?': 'I align early.', 'Empty': '  ' }
check('blind off sends every non-empty answer', modelVisibleAnswers(blindAnswers, false).length, 2)
check('blind on drops pedigree answers', modelVisibleAnswers(blindAnswers, true).map(([q]) => q).join('|'), 'How do you manage stakeholders?')

const resume = 'Kabir Seth | kabir.s@example.com | +91 98765 43210\nPM at Acme (2018 - 2020 2021 - 2023). Kabir led growth.'
const redacted = redactIdentity(resume, { name: 'Kabir Seth' })
check('resume name redacted', /kabir|seth/i.test(redacted), false)
check('resume email redacted', redacted.includes('@'), false)
check('resume phone redacted', redacted.includes('98765'), false)
check('resume date ranges survive redaction', redacted.includes('2018 - 2020 2021 - 2023'), true)

console.log(
  failures === 0
    ? `\n✓ All ${passes} assertions passed`
    : `\n${failures} FAILURES (${passes} passed)`
)
process.exit(failures === 0 ? 0 : 1)
