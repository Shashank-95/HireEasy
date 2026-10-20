import { describe, expect, it } from 'vitest'
import { productApm } from './product-apm'
import { checkReadiness, isReady } from './readiness'
import { RoleSpec } from './types'
import { applicationFormFor, STANDARD_FIELDS } from './applicationForm'
import { proposeMapping } from '../import/mapping'
import { parseExperience } from '../parse/experience'
import { parseMoney } from '../parse/money'

const clone = <T,>(x: T): T => structuredClone(x)

/** The APM template as HR would fill it in for the March '26 role. */
function apmRole() {
  const spec = clone(productApm.spec)
  spec.eligibility.budget.fixedLpa = 10
  spec.eligibility.budget.variableLpa = 1
  const final = spec.interviewRounds.find(r => r.kind === 'human')!
  if (final.kind === 'human') final.interviewerEmails = ['hm@example.com']
  return spec
}

describe('product APM template', () => {
  it('matches the template schema', () => {
    expect(() => RoleSpec.parse(productApm.spec)).not.toThrow()
  })

  it('cannot be used until HR enters the budget and the interviewer', () => {
    const blocks = checkReadiness(productApm.spec).filter(i => i.severity === 'block').map(i => i.message)
    expect(blocks).toEqual([
      'Budget check is on but no budget is entered.',
      expect.stringContaining('has no interviewer email'),
    ])
  })

  it('is ready once they do', () => {
    const spec = apmRole()
    expect(checkReadiness(spec).filter(i => i.severity === 'block')).toEqual([])
    expect(isReady(spec)).toBe(true)
  })

  it('links every screening question to existing skills and gives every one an answer key', () => {
    const ids = new Set([...productApm.spec.mustHaves, ...productApm.spec.goodToHaves].map(s => s.id))
    for (const q of productApm.spec.screeningQuestions) {
      expect(q.skillIds.length).toBeGreaterThanOrEqual(1)
      expect(q.skillIds.length).toBeLessThanOrEqual(2)
      for (const id of q.skillIds) expect(ids.has(id)).toBe(true)
      for (const k of [1, 3, 5] as const) expect(q.rubric[k].length).toBeGreaterThan(20)
    }
  })

  it('records why each change from the original JD was made', () => {
    for (const n of productApm.changeNotes) {
      expect(n.change.length).toBeGreaterThan(10)
      expect(n.why.length).toBeGreaterThan(10)
    }
  })
})

describe('readiness catches incoherent roles', () => {
  it('blocks a must-have marked as screened that no question tests', () => {
    // The original JD's problem: SQL is a must-have but no question asks about it
    const spec = apmRole()
    spec.mustHaves.find(s => s.id === 'sql')!.assessedBy = ['screening']
    expect(checkReadiness(spec)).toContainEqual(
      expect.objectContaining({ severity: 'block', message: '"SQL" is marked as screened, but no screening question tests it.' }),
    )
  })
  it('blocks a skill assessed nowhere', () => {
    const spec = apmRole()
    spec.mustHaves[0].assessedBy = []
    expect(isReady(spec)).toBe(false)
  })
  it('blocks a question without an answer key', () => {
    const spec = apmRole()
    spec.screeningQuestions[0].rubric[5] = ''
    expect(isReady(spec)).toBe(false)
  })
  it('warns when too many must-haves dilute the score', () => {
    const spec = apmRole()
    spec.mustHaves.push({ ...spec.mustHaves[0], id: 'extra', name: 'Extra', assessedBy: ['resume'] })
    expect(checkReadiness(spec)).toContainEqual(expect.objectContaining({ severity: 'warn', section: 'Must-haves' }))
  })
})

describe('standard application form', () => {
  const form = applicationFormFor(apmRole())

  it('puts the role\'s screening questions after the standard fields', () => {
    expect(form).toHaveLength(STANDARD_FIELDS.length + 7)
    expect(form.at(-1)!.type).toBe('Long text')
  })

  it('maps automatically on import, with no guessing', () => {
    const m = proposeMapping(form.map(f => f.label))
    for (const f of STANDARD_FIELDS.filter(f => f.field)) {
      expect(m.fields[f.field!]).toBe(f.label)
    }
    expect(m.questionColumns).toEqual(apmRole().screeningQuestions.map(q => q.text))
  })

  it('produces values the parsers read with full confidence', () => {
    expect(parseMoney('1200000')).toMatchObject({ kind: 'amount', minLpa: 12, confidence: 'high' })
    expect(parseExperience('1.5')).toMatchObject({ kind: 'years', minYears: 1.5, maxYears: 1.5 })
  })
})

describe('product APM template has no warnings once filled in', () => {
  it('covers every interview-assessed skill with an interview question', () => {
    expect(checkReadiness(apmRole())).toEqual([])
  })
})

describe('readiness on templates', () => {
  it('treats budget as a per-role reminder on a template, a blocker on a role', () => {
    const spec = structuredClone(productApm.spec)
    spec.eligibility.budget.enabled = true
    spec.eligibility.budget.fixedLpa = 0
    spec.eligibility.budget.variableLpa = 0
    expect(checkReadiness(spec).find(i => /no budget/.test(i.message))?.severity).toBe('block')
    expect(checkReadiness(spec, { forTemplate: true }).find(i => /no budget/.test(i.message))?.severity).toBe('warn')
  })
})
