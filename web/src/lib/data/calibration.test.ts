import { describe, expect, it } from 'vitest'
import { agreement, chooseSample } from './calibration'

describe('calibration sample', () => {
  const scored = Array.from({ length: 200 }, (_, i) => ({ id: `c${String(i).padStart(3, '0')}`, score: i % 101 }))

  it('takes 40, with about a third held out for validation', () => {
    const s = chooseSample(scored, 70)
    expect(s).toHaveLength(40)
    expect(new Set(s.map(x => x.candidateId)).size).toBe(40)
    expect(s.filter(x => x.split === 'validate')).toHaveLength(13)
  })

  it('covers the top, the bottom and the area around the bar', () => {
    const ids = new Set(chooseSample(scored, 70).map(s => s.candidateId))
    const picked = scored.filter(s => ids.has(s.id)).map(s => s.score)
    expect(Math.max(...picked)).toBe(100)
    expect(Math.min(...picked)).toBe(0)
    expect(picked.filter(s => Math.abs(s - 70) <= 3).length).toBeGreaterThan(5)
  })

  it('uses everyone when there are fewer than 40', () => {
    expect(chooseSample(scored.slice(0, 12), 70)).toHaveLength(12)
  })
})

describe('agreement', () => {
  it('measures plain agreement and chance-corrected kappa', () => {
    const a = agreement([
      { human: 'strong', ai: 'strong' },
      { human: 'no', ai: 'no' },
      { human: 'possible', ai: 'possible' },
      { human: 'possible', ai: 'no' },
    ])
    expect(a.rate).toBe(0.75)
    expect(a.kappa).toBeGreaterThan(0.6)
    expect(a.matrix.possible.no).toBe(1)
  })
  it('handles no labels', () => expect(agreement([]).rate).toBe(0))
})
