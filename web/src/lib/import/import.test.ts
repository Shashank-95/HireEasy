import { describe, expect, it } from 'vitest'
import Papa from 'papaparse'
import { proposeMapping, isNoiseColumn } from './mapping'
import { buildApplicants, parseCsv, sheetCsvUrl } from './sheet'
import { dedupeCandidates } from './dedupe'

/** Headers exactly as the March '26 Typeform export has them (no applicant data). */
const Q1 =
  'It is 4:00 PM and you get 3 priority tasks: Investigate a sudden spike in app uninstalls, draft a PRD for a new cricket trivia feature, and define mutually exclusive user segments for an upcoming funnel analysis report. You only have time to properly complete one before logging off. How do you handle this? (Do not write more than 100 words).'
const Q5 =
  'You strongly believe a new engagement feature must go live before a major cricket tournament, but a senior stakeholder completely disagrees on its priority. How do you proceed? (Do not write more than 100 words).'
const HEADERS = [
  'Name', 'Email Address', 'Which Country are you applying from?', 'Phone Number', 'Total Experience',
  'Name of Institute, Course & Passing out year.', Q1, Q5, 'Current Company', 'Current Salary/Pay (annual)',
  'Expected Salary/Pay (annual)', 'How soon can you join? ', 'Where did you hear about this position?',
  'LinkedIn Profile / Portfolio Link', 'Please upload your resume.', 'Submitted At', 'Token',
  'Screening Status', 'Screening Justification', 'Resume Score', 'Interview Shortlisted', 'Interview Token', 'Interview Slot', 'Email Sent', 'Needs a glance', 'What we changed',
]

describe('column mapping', () => {
  const m = proposeMapping(HEADERS.map(h => h.trim()))

  it('maps every field to the right column', () => {
    expect(m.fields).toEqual({
      externalId: 'Token',
      submittedAt: 'Submitted At',
      name: 'Name',
      email: 'Email Address',
      phone: 'Phone Number',
      resume: 'Please upload your resume.',
      expectedSalary: 'Expected Salary/Pay (annual)',
      currentSalary: 'Current Salary/Pay (annual)',
      experience: 'Total Experience',
      notice: 'How soon can you join?',
      location: 'Which Country are you applying from?',
      education: 'Name of Institute, Course & Passing out year.',
      currentCompany: 'Current Company',
      profileLink: 'LinkedIn Profile / Portfolio Link',
    })
  })
  it('keeps long scenario questions as questions, even with tempting keywords', () => {
    // Q5 contains "disagrees" (consent-like) — it must stay a question
    expect(m.questionColumns).toEqual([Q1, Q5])
  })
  it('ignores the leftover columns of an older screening tool', () => {
    for (const h of ['Screening Status', 'Resume Score', 'Interview Shortlisted', 'Email Sent', 'Needs a glance', 'What we changed']) {
      expect(m.ignoredColumns).toContain(h)
    }
  })
  it('never mistakes current salary for expected salary', () => {
    const swapped = proposeMapping(['Current CTC (LPA)', 'Expected CTC'])
    expect(swapped.fields.expectedSalary).toBe('Expected CTC')
    expect(swapped.fields.currentSalary).toBe('Current CTC (LPA)')
  })
  it('treats short consent labels as noise but not questions that mention them', () => {
    expect(isNoiseColumn('I agree to the terms and conditions')).toBe(true)
    expect(isNoiseColumn(Q5)).toBe(false)
  })
})

describe('building applicants', () => {
  const row = (over: Record<string, string>) => Object.fromEntries(HEADERS.map(h => [h, over[h] ?? '']))
  const csv = Papa.unparse([
    row({ Name: 'Asha', 'Email Address': 'test@x.com', 'Phone Number': '+91 98111 11111', Token: 't1', [Q1]: 'I would triage, the uninstall spike first,\nthen…' }),
    row({ Name: 'Ravi', 'Email Address': 'test@x.com', 'Phone Number': '+91 98222 22222', Token: 't2', [Q1]: 'PRD first.' }),
    row({ 'Submitted At': '3/3/2026 12:24:07', Token: 't3' }), // abandoned Typeform start
  ], { columns: HEADERS })

  const sheet = parseCsv(csv)
  const summary = buildApplicants(sheet, proposeMapping(sheet.headers))

  it('drops empty form submissions', () => {
    expect(summary).toMatchObject({ totalRows: 3, emptyRows: 1 })
    expect(summary.applicants.map(a => a.externalId)).toEqual(['t1', 't2'])
  })
  it('keeps commas and line breaks inside answers', () => {
    expect(summary.applicants[0].answers[Q1]).toBe('I would triage, the uninstall spike first,\nthen…')
  })
  it('does not merge different people who share a placeholder email', () => {
    // The test sheet replaced every email with one address; phones differ
    const people = summary.applicants.map(a => ({ name: a.fields.name, email: a.fields.email, phone: a.fields.phone }))
    expect(dedupeCandidates(people).unique).toHaveLength(2)
  })
})

describe('sheet links', () => {
  it('keeps the tab id', () => {
    expect(sheetCsvUrl('https://docs.google.com/spreadsheets/d/abc_123/edit?gid=160222832#gid=160222832'))
      .toBe('https://docs.google.com/spreadsheets/d/abc_123/export?format=csv&gid=160222832')
  })
  it('rejects non-sheet links', () => expect(sheetCsvUrl('https://example.com/file.csv')).toBeNull())
})

import { splitEducation, standardise } from './standardise'

describe('standardising old free-text answers', () => {
  it.each([
    ['BITS PILANI K.K.BIRLA CAMPUS,MECHANICAL ENGINEERING,2024', 'BITS PILANI K.K.BIRLA CAMPUS', 'MECHANICAL ENGINEERING', '2024'],
    ['Apj abdul kalam technological University \n2019-2023', 'Apj abdul kalam technological University', '', '2023'],
    ['Gopalan College of Engineering and Management, CSE, 2023 passing out year', 'Gopalan College of Engineering and Management', 'CSE', '2023'],
    ['The Oxford College of Engineering, CSE & 2020', 'The Oxford College of Engineering', 'CSE', '2020'],
    ['Vellore institute of technology', 'Vellore institute of technology', '', ''],
  ])('splits %j', (raw, college, degree, year) => {
    expect(splitEducation(raw)).toEqual({ college, degree, year })
  })

  it('logs every change, and flags the ones worth a glance', () => {
    const r = standardise({ expectedSalary: '7-10 LPA (negotiable)', experience: '2+ years', notice: 'Immediate / within a week' })
    expect(r.values).toMatchObject({ expectedSalary: '700000', experience: '2+', notice: 'Up to 15 days' })
    expect(r.changes.map(c => [c.field, c.check])).toEqual([['expectedSalary', true], ['experience', true], ['notice', false]])
  })

  it('never invents a number for a vague salary', () => {
    const r = standardise({ expectedSalary: 'As per company norms' })
    expect(r.values.expectedSalary).toBeUndefined()
    expect(r.changes[0].note).toMatch(/left blank/)
  })
})
