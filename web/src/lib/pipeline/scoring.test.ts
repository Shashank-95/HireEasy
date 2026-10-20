import { describe, expect, it } from 'vitest'
import { applyAdvanceRule, bandFor, mergeSkillScores, overallScore, skillScoresFromQuestions, toPct } from './scoring'
import { productApm } from '../templates/product-apm'

describe('scores', () => {
  it('maps the 1–5 answer key onto 0–100', () => {
    expect([1, 2, 3, 4, 5].map(toPct)).toEqual([0, 25, 50, 75, 100])
  })

  it('averages questions into skills, weighted by question importance', () => {
    const s = skillScoresFromQuestions([
      { questionId: 'a', score: 5, skillIds: ['x'], weight: 3 },
      { questionId: 'b', score: 1, skillIds: ['x', 'y'], weight: 1 },
    ])
    expect(s).toEqual({ x: 75, y: 0 })
  })

  it('merges sources per skill', () => {
    expect(mergeSkillScores({ sql: 80 }, { sql: 40, python: 60 })).toEqual({ sql: 60, python: 60 })
  })

  it('weights must-haves by importance and ignores unknown skills', () => {
    const spec = productApm.spec
    // sql is high (3), python medium (2): (100*3 + 0*2) / 5 = 60
    expect(overallScore(spec, { sql: 100, python: 0, nonsense: 0 })).toBe(60)
    expect(overallScore(spec, {})).toBeNull()
  })

  it('counts good-to-haves at half weight', () => {
    // product-sense high (3) vs growth low (1 × 0.5): (100*3 + 0*0.5) / 3.5 ≈ 86
    expect(overallScore(productApm.spec, { 'product-sense': 100, growth: 0 })).toBe(86)
  })

  it('bands scores relative to the bar', () => {
    const rule = { minScore: 70, maxAdvance: 10 }
    expect(bandFor(85, rule)).toBe('strong')
    expect(bandFor(66, rule)).toBe('possible')
    expect(bandFor(64, rule)).toBe('no')
  })
})

describe('advance rule: score bar + maximum', () => {
  const rule = { minScore: 70, maxAdvance: 2 }

  it('advances the best above the bar up to the cap and waitlists the rest', () => {
    const cut = applyAdvanceRule(
      [{ id: 'a', score: 90 }, { id: 'b', score: 80 }, { id: 'c', score: 75 }, { id: 'd', score: 40 }],
      rule,
    )
    expect(cut.advance.map(c => c.id)).toEqual(['a', 'b'])
    expect(cut.waitlist.map(c => c.id)).toEqual(['c'])
    expect(cut.out.map(c => c.id)).toEqual(['d'])
  })

  it('gives borderline candidates the benefit of the doubt', () => {
    const cut = applyAdvanceRule([{ id: 'x', score: 66 }], rule)
    expect(cut.advance[0].reason).toMatch(/just under the bar/)
  })

  it('lets a person override, without using up the cap', () => {
    const cut = applyAdvanceRule(
      [{ id: 'a', score: 90 }, { id: 'b', score: 85 }, { id: 'low', score: 10, override: 'advance' }, { id: 'top', score: 99, override: 'out' }],
      rule,
    )
    expect(cut.advance.map(c => c.id).sort()).toEqual(['a', 'b', 'low'])
    expect(cut.out.map(c => c.id)).toEqual(['top'])
  })

  it('is deterministic on ties', () => {
    const a = applyAdvanceRule([{ id: 'b', score: 80 }, { id: 'a', score: 80 }, { id: 'c', score: 80 }], rule)
    expect(a.advance.map(c => c.id)).toEqual(['a', 'b'])
  })
})

import { friendlyAiError } from './engine'
describe('AI error messages for HR', () => {
  it('explains a Gemini 503 in plain words', () => {
    const m = friendlyAiError('gemini-3.5-flash-lite returned 503: {"error":{"code":503,"message":"This model is currently experiencing high demand.","status":"UNAVAILABLE"}}')
    expect(m).toMatch(/^Google Gemini is busy right now/)
    expect(m).not.toMatch(/[{}]/)
  })
  it('points to Settings for a bad key', () => expect(friendlyAiError('groq returned 401: invalid key')).toMatch(/Settings/))
})
