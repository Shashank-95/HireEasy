import { describe, expect, it } from 'vitest'
import { checkGrounding, splitOptions } from './grounding'

const data = JSON.stringify({
  name: 'Priya Sharma',
  candidate_id: '7eea88e8-1b31-4cf5-8f62-61bd996f96f3',
  role_id: '3fd83fce-9469-44ae-b1d1-8b9266bef661',
  scores: { screening: 74, 'AI round 1': 81 },
  reason: 'Expects ₹16 L ("1600000") — above budget ₹11 L + 20% = ₹13.2 L',
  total_matching: 12,
})

describe('grounding check', () => {
  it('accepts numbers and links that come from the data', () => {
    const a = 'Priya scored 74 in screening and 81 in AI round 1. She was stopped because she expects ₹16 L, above the ₹13.2 L limit. [Priya Sharma](/roles/3fd83fce-9469-44ae-b1d1-8b9266bef661/applicants/7eea88e8-1b31-4cf5-8f62-61bd996f96f3)'
    expect(checkGrounding(a, data)).toEqual({ ok: true, unverified: [] })
  })

  it('flags a number that is not in the data', () => {
    expect(checkGrounding('Priya scored 88 in screening.', data)).toEqual({ ok: false, unverified: ['88'] })
  })

  it('flags a link to a record that was never looked up', () => {
    const r = checkGrounding('See [Rahul](/roles/3fd83fce-9469-44ae-b1d1-8b9266bef661/applicants/00000000-1111-2222-3333-444444444444)', data)
    expect(r.ok).toBe(false)
    expect(r.unverified[0]).toMatch(/^link 00000000/)
  })

  it('ignores list numbering and trivial counts', () => {
    expect(checkGrounding('1. Priya Sharma — 74\n2. Someone — 81\nOnly 1 needs a look.', data).ok).toBe(true)
  })

  it('accepts numbers the person asked about', () => {
    expect(checkGrounding('Nobody scored above 95.', data, 'who scored above 95?').ok).toBe(true)
  })

  it('reads 1,600,000 as 1600000', () => {
    expect(checkGrounding('Their ask was 1,600,000.', data).ok).toBe(true)
  })
})

describe('clarifying options', () => {
  it('splits options off the end of a question', () => {
    expect(splitOptions('Which Rahul do you mean?\nOPTIONS: Rahul Sharma (APM) | Rahul K (Designer)')).toEqual({ text: 'Which Rahul do you mean?', options: ['Rahul Sharma (APM)', 'Rahul K (Designer)'] })
  })
  it('leaves normal answers alone', () => expect(splitOptions('All good.').options).toEqual([]))
})

import { forceClarification } from './agent'

describe('never guessing between same-name candidates', () => {
  const amb = [{ matches: [
    { candidate_id: 'a1', name: 'Rohan Mehta', role: 'APM', stage: 'Eligibility', link: '/x' },
    { candidate_id: 'b2', name: 'Rohan Shukla', role: 'APM', stage: 'Resume check', link: '/y' },
  ] }]
  it('replaces an answer that picked one of several matches', () => {
    const r = forceClarification('Rohan Mehta was rejected at Eligibility.', [], amb, 'Why was Rohan rejected?')
    expect(r?.options).toEqual(['Rohan Mehta (APM, Eligibility)', 'Rohan Shukla (APM, Resume check)'])
  })
  it('lets it through when the person named one exactly', () => {
    expect(forceClarification('Rohan Mehta was rejected at Eligibility.', [], amb, 'why was rohan mehta rejected')).toBeNull()
  })
  it('lets through an answer that covers all of them', () => {
    expect(forceClarification('Rohan Mehta was stopped at Eligibility; Rohan Shukla is at Resume check.', [], amb, 'how are the Rohans doing?')).toBeNull()
  })
  it('does nothing when the model is already asking', () => {
    expect(forceClarification('Which Rohan?', ['A', 'B'], amb, 'Why was Rohan rejected?')).toBeNull()
  })
})

describe('option labels', () => {
  it('turns markdown links into plain labels', () => {
    expect(splitOptions('Which one?\nOPTIONS: [Rohan Shukla](/roles/x/applicants/y) | **Rohan Mehta**').options).toEqual(['Rohan Shukla', 'Rohan Mehta'])
  })
})

import { repairLinks } from './grounding'

describe('link repair', () => {
  const p = '/roles/3fd83fce-9469-44ae-b1d1-8b9266bef661/applicants/c9f22576-3d4b-4b3e-ab28-a0ee795e9d73'
  const labels = new Map([[p, 'Rohan Shukla']])
  it('fixes inside-out links', () => expect(repairLinks(`page: [${p}](link).`, labels)).toBe(`page: [Rohan Shukla](${p}).`))
  it('links bare paths', () => expect(repairLinks(`see ${p} now`, labels)).toBe(`see [Rohan Shukla](${p}) now`))
  it('leaves good links alone', () => expect(repairLinks(`[Rohan](${p})`, labels)).toBe(`[Rohan](${p})`))
})

describe('name linking', () => {
  const p = '/roles/3fd83fce-9469-44ae-b1d1-8b9266bef661/applicants/c9f22576-3d4b-4b3e-ab28-a0ee795e9d73'
  const labels = new Map([[p, 'Rohan Shukla']])
  it('links the first plain mention', () => expect(repairLinks('Rohan Shukla was not rejected. Rohan Shukla is fine.', labels)).toBe(`[Rohan Shukla](${p}) was not rejected. Rohan Shukla is fine.`))
  it('links inside bold', () => expect(repairLinks('**Rohan Shukla** was not rejected.', labels)).toBe(`**[Rohan Shukla](${p})** was not rejected.`))
  it('does not double-link', () => expect(repairLinks(`[Rohan Shukla](${p}) ok`, labels)).toBe(`[Rohan Shukla](${p}) ok`))
})

describe('model formatting quirks', () => {
  const p = '/roles/3fd83fce-9469-44ae-b1d1-8b9266bef661/applicants/d9518c78-2d6a-4813-b819-c0b38043b43e'
  const labels = new Map([[p, 'Arjun Rao']])
  it('tidies padded links and JSON escapes', () => {
    const raw = `Arjun Rao was rejected.\n- Reason: “Expects ₹17 L (\\"1700000\\")”\n\n[ Arjun Rao ]( ${p} )`
    expect(repairLinks(raw, labels)).toBe(`Arjun Rao was rejected.\n- Reason: “Expects ₹17 L ("1700000")”\n\n[Arjun Rao](${p})`)
  })
})

import { nameSubject } from './agent'
describe('naming the candidate on their own page', () => {
  const href = '/roles/r1/applicants/c1'
  const sources = new Map([[href, 'Injection Attempt']])
  it('leads with the name when the answer only says "the candidate"', () => {
    expect(nameSubject('The candidate is in Answer screening.', { candidateId: 'c1' }, sources)).toBe(`**[Injection Attempt](${href})** — the candidate is in Answer screening.`)
  })
  it('leaves answers that already name them', () => {
    expect(nameSubject('Injection Attempt is stopped.', { candidateId: 'c1' }, sources)).toBe('Injection Attempt is stopped.')
  })
  it('does nothing off a candidate page', () => {
    expect(nameSubject('Three roles are live.', {}, sources)).toBe('Three roles are live.')
  })
})

import { optionLabels } from './agent'
describe('two candidates with the same name', () => {
  const twins = [{ matches: [
    { candidate_id: 'a', name: 'Rahul Verma', role: 'QA', stage: 'Resume check', link: '/a', email: 'r1@x.test' },
    { candidate_id: 'b', name: 'Rahul Verma', role: 'QA', stage: 'Answer screening', link: '/b', email: 'r2@x.test' },
  ] }]
  it('labels the choices so they can be told apart', () => {
    expect(optionLabels(twins[0].matches)).toEqual(['Rahul Verma (QA, Resume check)', 'Rahul Verma (QA, Answer screening)'])
  })
  it('accepts a chosen option instead of asking again', () => {
    expect(forceClarification('Rahul Verma is at Resume check.', [], twins, 'Rahul Verma (QA, Resume check)')).toBeNull()
  })
  it('still asks when only the shared name is given', () => {
    expect(forceClarification('Rahul Verma is at Resume check.', [], twins, 'Why was Rahul Verma stopped?')?.options).toHaveLength(2)
  })
  it('adds email when name, role and stage all match', () => {
    const same = twins[0].matches.map(m => ({ ...m, stage: 'Resume check' }))
    expect(optionLabels(same)[0]).toContain('r1@x.test')
  })
})

describe('never linking a shared name to one person', () => {
  it('leaves "Rahul Verma" unlinked when two records share it', () => {
    const labels = new Map([['/roles/r/applicants/11111111-1111-1111-1111-111111111111', 'Rahul Verma'], ['/roles/r/applicants/22222222-2222-2222-2222-222222222222', 'Rahul Verma']])
    expect(repairLinks('Which Rahul Verma do you mean?', labels)).toBe('Which Rahul Verma do you mean?')
  })
})

describe('links must be real HireEasy pages', () => {
  const role = '3fd83fce-9469-44ae-b1d1-8b9266bef661'
  const data = JSON.stringify({ role_id: role })
  it('rejects an invented page and an outside site', () => {
    const r = checkGrounding(`Go to [Candidates](https://app.hireeasy.test/roles/${role}/candidates).`, data)
    expect(r.ok).toBe(false)
    expect(checkGrounding(`See [list](/roles/${role}/candidates).`, data).ok).toBe(false)
  })
  it('accepts real pages', () => {
    expect(checkGrounding(`Open [Applicants](/roles/${role}/applicants) or [Settings](/settings).`, data).ok).toBe(true)
  })
})
