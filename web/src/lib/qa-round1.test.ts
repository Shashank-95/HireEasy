import { describe, expect, it } from 'vitest'
import { latestPerCandidate } from './data/calibration'
import { scoringKey } from './data/roles'
import { assertPublicHttps } from './net'
import { productApm } from './templates/product-apm'

describe('calibration counts each applicant once', () => {
  it('keeps the most recent label per applicant', () => {
    const m = latestPerCandidate([
      { candidate_id: 'a', band: 'no', created_at: '2026-10-20T10:00:00Z' },
      { candidate_id: 'a', band: 'strong', created_at: '2026-10-20T11:00:00Z' },
      { candidate_id: 'b', band: 'possible', created_at: '2026-10-20T09:00:00Z' },
    ])
    expect(m.size).toBe(2)
    expect(m.get('a')?.band).toBe('strong')
  })
})

describe('new role versions only for scoring changes', () => {
  const base = structuredClone(productApm.spec)
  it('ignores title, deadline and bar changes', () => {
    const s = structuredClone(base)
    s.basics.title = 'Renamed'
    s.screeningAdvance.minScore = 55
    const ai = s.interviewRounds.find(r => r.kind === 'ai')
    if (ai && ai.kind === 'ai') ai.deadlineHours = 96
    expect(scoringKey(s)).toBe(scoringKey(base))
  })
  it('notices an answer-key change', () => {
    const s = structuredClone(base)
    s.screeningQuestions[0].rubric[5] = s.screeningQuestions[0].rubric[5] + ' Also mentions retention.'
    expect(scoringKey(s)).not.toBe(scoringKey(base))
  })
})

describe('untrusted links never reach private addresses', () => {
  for (const url of ['https://127.0.0.1/x', 'https://10.1.2.3/x', 'https://169.254.169.254/latest', 'https://[::1]/x', 'https://192.168.0.5/x', 'http://example.com/x', 'https://user:pw@example.com/x', 'https://localhost/x']) {
    it(`refuses ${url}`, async () => {
      await expect(assertPublicHttps(new URL(url))).rejects.toThrow()
    })
  }
  it('allows a public https address', async () => {
    await expect(assertPublicHttps(new URL('https://8.8.8.8/'))).resolves.toBeUndefined()
  })
})

import { withYearUnit } from './data/candidates'
import { evaluateEligibility, EMPTY_CRITERIA } from './eligibility/evaluate'
describe('experience from a column asked in years', () => {
  const criteria = { ...EMPTY_CRITERIA, experience: { enabled: true, minYears: 0, maxYears: 2, tolerancePct: 20, action: 'exclude' as const } }
  it('excludes a clear 5 when the column is in years', () => {
    expect(evaluateEligibility({ experience: withYearUnit('5', true) }, criteria).verdict).toBe('exclude')
  })
  it('still asks for a look when the unit is unknown', () => {
    expect(evaluateEligibility({ experience: withYearUnit('5', false) }, criteria).verdict).toBe('review')
  })
  it('leaves worded answers alone', () => {
    expect(withYearUnit('2+ years', true)).toBe('2+ years')
    expect(withYearUnit('6 months', true)).toBe('6 months')
  })
})
