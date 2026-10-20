import { describe, expect, it } from 'vitest'
import { fromHeader, meetDescription } from './google'

describe('sender display name', () => {
  it('quotes a name with a comma so it is not read as two addresses', () => {
    expect(fromHeader('Shashank, Hiring Team', 'hr@example.com')).toBe('"Shashank, Hiring Team" <hr@example.com>')
  })
  it('escapes quotes and backslashes inside the quoted name', () => {
    expect(fromHeader('The "A" Team\\HR', 'hr@example.com')).toBe('"The \\"A\\" Team\\\\HR" <hr@example.com>')
  })
  it('leaves a plain name alone', () => {
    expect(fromHeader('Hiring Team', 'hr@example.com')).toBe('Hiring Team <hr@example.com>')
  })
  it('encodes non-ASCII names', () => {
    expect(fromHeader('प्रिया, HR', 'hr@example.com')).toMatch(/^=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?= <hr@example.com>$/)
  })
  it('falls back to the bare address when no name is set', () => {
    expect(fromHeader('  ', 'hr@example.com')).toBe('<hr@example.com>')
  })
  it('drops line breaks so no header can be injected', () => {
    expect(fromHeader('Team\r\nBcc: x@evil.test', 'hr@example.com\r\nBcc: y@evil.test')).not.toMatch(/[\r\n]/)
  })
})

describe('Meet invite description', () => {
  it('has no internal links, because the candidate sees it', () => {
    const d = meetDescription('Final round', 'APM', 'Sportskeeda')
    expect(d).toBe('Final round for APM at Sportskeeda.')
    expect(d).not.toMatch(/https?:|\/roles\//)
  })
  it('omits the company when none is set', () => {
    expect(meetDescription('Final round', 'APM', '')).toBe('Final round for APM.')
  })
})
