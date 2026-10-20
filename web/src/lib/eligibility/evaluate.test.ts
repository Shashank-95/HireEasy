import { describe, expect, it } from 'vitest'
import { evaluateEligibility, EMPTY_CRITERIA, type EligibilityCriteria } from './evaluate'

/** The APM test role, as HR would configure it — nothing here is a default. */
const apm: EligibilityCriteria = {
  ...EMPTY_CRITERIA,
  budget: { enabled: true, maxLpa: 11, tolerancePct: 20, action: 'exclude' },
  experience: { enabled: true, minYears: 0, maxYears: 2, tolerancePct: 20, action: 'exclude' },
}

const budgetVerdict = (expectedSalary: string, c = apm) =>
  evaluateEligibility({ expectedSalary }, c).results.find(r => r.criterion === 'budget')!.verdict

describe('budget with tolerance (11 L + 20% = 13.2 L)', () => {
  it('passes exactly at the tolerance limit', () => expect(budgetVerdict('13.2 LPA')).toBe('pass'))
  it('excludes just above it', () => expect(budgetVerdict('13.3 LPA')).toBe('exclude'))
  it('passes a range whose low end fits', () => expect(budgetVerdict('12-15 LPA')).toBe('pass'))
  it('excludes a range that starts above', () => expect(budgetVerdict('14-15 LPA')).toBe('exclude'))
  it('sends an ambiguous figure to review instead of excluding', () => {
    expect(budgetVerdict('18')).toBe('review')
    expect(budgetVerdict('1400000 holding salary of 11.5')).toBe('review')
  })
  it('sends a likely-typo figure to review', () => expect(budgetVerdict('8000000')).toBe('review'))
  it('reviews foreign currency', () => expect(budgetVerdict('$102,000')).toBe('review'))
  it('passes and flags an unstated salary', () => {
    const r = evaluateEligibility({ expectedSalary: 'As per company norms' }, apm)
    expect(r.verdict).toBe('pass')
    expect(r.flags).toContain('Salary not stated')
  })
  it('can be set to hold for review instead of excluding', () => {
    const reviewOnly = { ...apm, budget: { ...apm.budget, action: 'review' as const } }
    expect(budgetVerdict('25 LPA', reviewOnly)).toBe('review')
  })
  it('works for any budget HR enters', () => {
    const senior = { ...apm, budget: { enabled: true, maxLpa: 40, tolerancePct: 10, action: 'exclude' as const } }
    expect(budgetVerdict('44 LPA', senior)).toBe('pass')
    expect(budgetVerdict('45 LPA', senior)).toBe('exclude')
  })
  it('explains the exclusion with the candidate’s own words', () => {
    const r = evaluateEligibility({ expectedSalary: '15,00,000' }, apm)
    expect(r.results[0].reason).toContain('"15,00,000"')
    expect(r.results[0].reason).toContain('₹13.2 L')
  })
})

describe('experience (0–2 yrs, +20% → up to 2.4 yrs)', () => {
  const exp = (experience: string, c = apm) => evaluateEligibility({ experience }, c)
  it('passes the in-range dropdown answers', () => {
    for (const e of ['Fresher', '0-1 years', '1-2 years']) expect(exp(e).verdict).toBe('pass')
  })
  it('passes "2+ years" but flags it for resume verification', () => {
    const r = exp('2+ years')
    expect(r.verdict).toBe('pass')
    expect(r.flags.some(f => /Verify experience from resume/.test(f))).toBe(true)
  })
  it('excludes clearly over-experienced candidates', () => expect(exp('5 years').verdict).toBe('exclude'))
  it('excludes too-junior candidates for a senior role', () => {
    const senior = { ...apm, experience: { enabled: true, minYears: 5, maxYears: 8, tolerancePct: 20, action: 'exclude' as const } }
    expect(exp('Fresher', senior).verdict).toBe('exclude')
    expect(exp('4.5 years', senior).verdict).toBe('pass')
  })
})

describe('notice period and location', () => {
  const withNotice: EligibilityCriteria = { ...EMPTY_CRITERIA, notice: { enabled: true, maxDays: 30, tolerancePct: 50, action: 'exclude' } }
  it('uses the earliest joining date of a bucket', () => {
    expect(evaluateEligibility({ notice: '31-45 days' }, withNotice).verdict).toBe('pass')
    expect(evaluateEligibility({ notice: '60+ days' }, withNotice).verdict).toBe('exclude')
  })
  const india: EligibilityCriteria = { ...EMPTY_CRITERIA, location: { enabled: true, allowed: ['India'], action: 'exclude' } }
  it('matches location as whole words', () => {
    expect(evaluateEligibility({ location: 'India' }, india).verdict).toBe('pass')
    expect(evaluateEligibility({ location: 'Nigeria' }, india).verdict).toBe('exclude')
  })
})

describe('disabled criteria', () => {
  it('never affect a candidate', () => {
    expect(evaluateEligibility({ expectedSalary: '90 LPA', experience: '20 years' }, EMPTY_CRITERIA).verdict).toBe('pass')
  })
})
