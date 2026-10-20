import { describe, expect, it } from 'vitest'
import { parseMoney } from './money'
import { parseExperience, parseNotice } from './experience'
import golden from './__fixtures__/salary-golden.json'

/**
 * Every distinct salary string from the real March '26 APM applicant sheet
 * (292 strings), each hand-reviewed. A change in any of these is a change in
 * who gets screened out — it must be deliberate.
 */
describe('salary parsing — real applicant strings', () => {
  for (const row of golden as (string | number)[][]) {
    const [raw, kind, min, max, conf] = row
    it(JSON.stringify(raw), () => {
      const p = parseMoney(raw as string)
      expect(p.kind).toBe(kind)
      if (p.kind === 'amount') {
        expect([p.minLpa, p.maxLpa, p.confidence]).toEqual([min, max, conf])
      }
    })
  }
})

describe('salary parsing — the cases that used to go wrong', () => {
  const amount = (raw: string) => {
    const p = parseMoney(raw)
    if (p.kind !== 'amount') throw new Error(`${raw} → ${p.kind}`)
    return p
  }

  it('uses a range, not its average', () => {
    expect(amount('7-10 LPA (Negotiable)')).toMatchObject({ minLpa: 7, maxLpa: 10 })
  })
  it('reads rupee figures labelled as lakhs by their digits', () => {
    expect(amount('1300000 Lakh rupees').minLpa).toBe(13)
    expect(amount('13,00,000 LPA').minLpa).toBe(13)
    expect(amount('500000 LPA').minLpa).toBe(5)
  })
  it('handles shorthand-lakhs-to-rupees ranges', () => {
    expect(amount('40-4500000')).toMatchObject({ minLpa: 40, maxLpa: 45, confidence: 'medium' })
  })
  it('never converts foreign currency by guesswork', () => {
    expect(parseMoney('$102,000').kind).toBe('foreign')
    expect(parseMoney('N700,000/N8,400,000').kind).toBe('foreign')
  })
  it('does not mistake ordinary words for currencies', () => {
    expect(parseMoney('12 LPA, can audit my offer').kind).toBe('amount')
  })
  it('reads monthly stipends', () => {
    expect(amount('Stipend - 15k/month')).toMatchObject({ minLpa: 1.8, confidence: 'high' })
  })
  it('marks bare numbers as uncertain', () => {
    expect(amount('18')).toMatchObject({ minLpa: 18, confidence: 'medium' })
    expect(amount('30000')).toMatchObject({ minLpa: 3.6, confidence: 'low' })
  })
  it('marks two unrelated figures as low confidence', () => {
    expect(amount('1400000 holding salary of 11.5')).toMatchObject({ minLpa: 14, confidence: 'low' })
  })
  it('adds fixed and variable components', () => {
    expect(amount('8 LPA (Fixed)+ 2 LPA (Variable)').minLpa).toBe(10)
  })
  it('treats words-only answers as not stated', () => {
    expect(parseMoney('As per company norms').kind).toBe('unknown')
    expect(parseMoney('').kind).toBe('unknown')
    expect(parseMoney('Fresher').kind).toBe('none')
  })
})

describe('experience parsing', () => {
  it.each([
    ['Fresher', 0, 0],
    ['0-1 years', 0, 1],
    ['1-2 years', 1, 2],
    ['2+ years', 2, null],
    ['3 yrs 6 months', 3.5, 3.5],
    ['10 years 0 months', 10, 10],
    ['18 months', 1.5, 1.5],
  ])('%s', (raw, min, max) => {
    expect(parseExperience(raw)).toMatchObject({ kind: 'years', minYears: min, maxYears: max })
  })
  it('does not read a calendar year as experience', () => {
    expect(parseExperience('2019').kind).toBe('unknown')
  })
})

describe('notice period parsing', () => {
  it.each([
    ['Immediate / within a week', 0, 7],
    ['7-15 days', 7, 15],
    ['15-30 days', 15, 30],
    ['31-45 days', 31, 45],
    ['46-60 days', 46, 60],
    ['60+ days', 61, null],
    ['2 months', 60, 60],
    ['30 days', 30, 30],
    // The standard form's options
    ['Immediate', 0, 0],
    ['Up to 15 days', 0, 15],
    ['16–30 days', 16, 30],
    ['31–60 days', 31, 60],
    ['61–90 days', 61, 90],
    ['More than 90 days', 91, null],
  ])('%s', (raw, min, max) => {
    expect(parseNotice(raw)).toMatchObject({ kind: 'days', minDays: min, maxDays: max })
  })
})
