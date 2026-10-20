import { describe, expect, it } from 'vitest'
import { matchPreferredColleges } from './colleges'

describe('preferred colleges', () => {
  const list = ['IIM', 'BITS Pilani', 'IIT Delhi', 'DTU', 'XIMB']
  it.each([
    ['Indian Institute of Management Kozhikode', ['IIM']],
    ['IIM-A, MBA, 2024', ['IIM']],
    ['BITS PILANI K.K.BIRLA CAMPUS', ['BITS Pilani']],
    ['Birla Institute of Technology and Science, Pilani - Goa Campus', ['BITS Pilani']],
    ['IIT Delhi', ['IIT Delhi']],
    ['Indian Institute of Technology, Delhi', ['IIT Delhi']],
    ['Delhi Technological University', ['DTU']],
    ['Xavier Institute of Management, Bhubaneswar', ['XIMB']],
    ['Indian Institute of Technology (IIT) Delhi', ['IIT Delhi']],
  ])('%s', (college, want) => {
    expect(matchPreferredColleges(college, list)).toEqual(want)
  })

  it.each([
    'IIT Bombay', // IIT Delhi is preferred, not every IIT
    'Delhi University',
    'Gopalan College of Engineering and Management',
    'Indian Institute of Information Technology Pune', // IIIT is not IIT
    'Mumbai University',
    'IIIT Delhi', // Information Technology, not IIT
    'Indraprastha Institute of Information Technology Delhi',
  ])('does not match %s', college => {
    expect(matchPreferredColleges(college, list)).toEqual([])
  })

  it('handles a blank college', () => expect(matchPreferredColleges('', list)).toEqual([]))
})
