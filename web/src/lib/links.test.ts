import { describe, expect, it } from 'vitest'
import { profileLink } from './links'

describe('candidate profile links', () => {
  it('names LinkedIn and adds the missing scheme', () => {
    expect(profileLink('linkedin.com/in/someone')).toMatchObject({ href: 'https://linkedin.com/in/someone', label: 'LinkedIn', shortened: false })
  })
  it('repairs "www.https://" typos', () => {
    expect(profileLink('www.https://www.linkedin.com/in/x')?.href).toBe('https://www.linkedin.com/in/x')
  })
  it('repairs a link the form prefixed twice', () => {
    expect(profileLink('https://www.https://www.linkedin.com/in/x')).toMatchObject({ href: 'https://www.linkedin.com/in/x', label: 'LinkedIn' })
  })
  it('flags short links so HR knows the destination is hidden', () => {
    expect(profileLink('https://bit.ly/port-folio-work')).toMatchObject({ label: 'bit.ly short link', shortened: true })
  })
  it('names portfolio hosts', () => {
    expect(profileLink('https://someone.notion.site/Portfolio')?.label).toBe('Notion page')
    expect(profileLink('https://my-portfolio.vercel.app')?.label).toBe('my-portfolio.vercel.app')
  })
  it('ignores answers that are not links', () => {
    expect(profileLink('N/A')).toBeNull()
    expect(profileLink('none')).toBeNull()
    expect(profileLink('')).toBeNull()
  })
  it('keeps only the first of several pasted links', () => {
    expect(profileLink('https://github.com/x https://linkedin.com/in/x')?.label).toBe('GitHub')
  })
})
