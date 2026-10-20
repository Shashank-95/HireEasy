import { describe, expect, it } from 'vitest'
import { computeExperience, monthIndex } from './resume'

const NOW = new Date('2026-10-20T00:00:00Z')
const role = (start: string, end: string, type: 'full_time' | 'internship' | 'part_time' | 'freelance' | 'unknown' = 'full_time') => ({ title: 't', company: 'c', start, end, type })

describe('experience from resume dates', () => {
  it('reads month, year-only and present', () => {
    expect(monthIndex('2024-01', NOW)).toBe(2024 * 12)
    expect(monthIndex('2024', NOW)).toBe(2024 * 12)
    expect(monthIndex('Present', NOW)).toBe(2026 * 12 + 9)
    expect(monthIndex('soon', NOW)).toBeNull()
  })

  it('counts inclusive months', () => {
    expect(computeExperience([role('2024-01', '2024-12')], NOW).fullTimeYears).toBe(1)
  })

  it('does not double-count overlapping jobs', () => {
    const e = computeExperience([role('2023-01', '2023-12'), role('2023-06', '2024-05')], NOW)
    expect(e.fullTimeYears).toBe(1.4) // Jan 2023 – May 2024 = 17 months
  })

  it('keeps internships separate', () => {
    const e = computeExperience([role('2022-06', '2022-11', 'internship'), role('2024-10', 'present')], NOW)
    expect(e).toEqual({ fullTimeYears: 2.1, internshipYears: 0.5, complete: true })
  })

  it('marks experience incomplete when a job has unreadable dates', () => {
    expect(computeExperience([role('', '2024')], NOW).complete).toBe(false)
  })
})

import { ResumeOutput } from './resume'

describe('resume output shapes', () => {
  it('accepts skills as an object keyed by id', () => {
    const r = ResumeOutput.parse({ roles: [], education: [], summary: '', skills: { sql: { reasoning: 'r', evidence: 'e', score: 4 } } })
    expect(r.skills).toEqual([{ id: 'sql', reasoning: 'r', evidence: 'e', score: 4 }])
  })
})

import { repairResumeOutput, checkResumeOutput } from './resume'
import { productApm } from '../templates/product-apm'
describe('repairing a resume read that paraphrased its evidence', () => {
  const spec = productApm.spec
  const want = [...spec.mustHaves, ...spec.goodToHaves].filter(s => s.assessedBy.includes('resume')).map(s => s.id)
  const text = 'Built SQL dashboards in Metabase for the growth team.'
  it('drops credit for unverified quotes, keeps verified ones, fills skipped skills', () => {
    const out = { roles: [], education: [], skills: [
      { id: want[0], score: 4, evidence: 'Built SQL dashboards in Metabase', reasoning: '' },
      { id: want[1], score: 5, evidence: 'Led a team of 10 engineers', reasoning: '' },
    ] }
    const fixed = repairResumeOutput(out as never, spec, text)
    expect(checkResumeOutput(fixed, spec, text)).toBeNull()
    expect(fixed.skills.find(s => s.id === want[0])?.score).toBe(4)
    expect(fixed.skills.find(s => s.id === want[1])?.score).toBe(1)
    expect(fixed.skills).toHaveLength(want.length)
  })
})
