import { Candidate } from '../stores/jobStore'

/**
 * Collapses repeat applications from the same person.
 *
 * Answer-level duplicate detection only catches copy-paste. The same candidate
 * applying twice with reworded answers slips through, burns a second LLM call,
 * and can occupy two shortlist slots. Matching on email and phone catches them.
 */

export interface DedupeResult {
  unique: Candidate[]
  /** Rows removed as duplicates, with the identity they collided on */
  removed: { candidate: Candidate; matchedOn: 'email' | 'phone'; keptName: string }[]
}

/** Normalise an email for comparison — Gmail dots and +tags are the same inbox. */
function normEmail(raw: string | undefined): string {
  const e = (raw || '').trim().toLowerCase()
  if (!e.includes('@')) return ''
  const [local, domain] = e.split('@')
  if (!local || !domain) return ''
  // Filler typed into a required field — never an identity
  if (/^(na|n\/a|nil|none|no|noemail|test|abc|xyz|null|dummy)$/.test(local)) return ''
  if (/^(test|example|abc|xyz|na)\.(com|in|org)$/.test(domain)) return ''
  const isGmail = /^(gmail|googlemail)\.com$/.test(domain)
  const cleanLocal = isGmail ? local.replace(/\./g, '').split('+')[0] : local.split('+')[0]
  // googlemail.com is the same mailbox as gmail.com
  return `${cleanLocal}@${isGmail ? 'gmail.com' : domain}`
}

/** Last 10 digits, so +91 / 0 prefixes and spacing don't create false uniques. */
function normPhone(raw: string | undefined): string {
  const digits = (raw || '').replace(/\D/g, '')
  if (digits.length < 10) return ''
  const last10 = digits.slice(-10)
  // Placeholders people type to get past a required field: 0000000000,
  // 9999999999, 1234567890… Treating these as identity would merge strangers.
  if (new Set(last10).size <= 2) return ''
  if ('01234567890123456789'.includes(last10) || '98765432109876543210'.includes(last10)) return ''
  return last10
}

/**
 * An identifier that links more than this many *different* counterparts is a
 * shared contact (a placement cell's number, a test@test.com placeholder), not
 * one person. One person changing email or phone once is still allowed.
 */
const MAX_COUNTERPARTS = 2

/**
 * Groups rows that share an email or phone (transitively — A shares an email
 * with B, B shares a phone with C, so all three are one person) and keeps the
 * *last* row of each group: later submissions are assumed to be the
 * candidate's corrected or most recent application.
 */
export function dedupeCandidates(candidates: Candidate[]): DedupeResult {
  const emails = candidates.map(c => normEmail(c.email))
  const phones = candidates.map(c => normPhone(c.phone))

  // Drop identifiers that tie together too many distinct people
  const counterparts = (keys: string[], others: string[]) => {
    const map = new Map<string, Set<string>>()
    keys.forEach((k, i) => {
      if (!k || !others[i]) return
      if (!map.has(k)) map.set(k, new Set())
      map.get(k)!.add(others[i])
    })
    return map
  }
  const phoneToEmails = counterparts(phones, emails)
  const emailToPhones = counterparts(emails, phones)
  const usablePhone = (p: string) => !!p && (phoneToEmails.get(p)?.size ?? 0) <= MAX_COUNTERPARTS
  const usableEmail = (e: string) => !!e && (emailToPhones.get(e)?.size ?? 0) <= MAX_COUNTERPARTS

  // Union-find over row indices
  const parent = candidates.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  const union = (a: number, b: number) => {
    const ra = find(a), rb = find(b)
    if (ra !== rb) parent[ra] = rb
  }

  const firstByEmail = new Map<string, number>()
  const firstByPhone = new Map<string, number>()
  candidates.forEach((_, i) => {
    const e = emails[i], p = phones[i]
    if (usableEmail(e)) {
      if (firstByEmail.has(e)) union(i, firstByEmail.get(e)!)
      else firstByEmail.set(e, i)
    }
    if (usablePhone(p)) {
      if (firstByPhone.has(p)) union(i, firstByPhone.get(p)!)
      else firstByPhone.set(p, i)
    }
  })

  // Keep the last row in each group
  const keeper = new Map<number, number>()
  candidates.forEach((_, i) => keeper.set(find(i), i))

  const emailCount = new Map<string, number>()
  emails.forEach(e => { if (usableEmail(e)) emailCount.set(e, (emailCount.get(e) || 0) + 1) })

  const unique: Candidate[] = []
  const removed: DedupeResult['removed'] = []

  candidates.forEach((c, i) => {
    const kept = keeper.get(find(i))!
    if (kept === i) {
      unique.push(c)
      return
    }
    // Shared email is the stronger signal; otherwise the link came through phone
    const matchedOn = usableEmail(emails[i]) && (emailCount.get(emails[i]) || 0) > 1 ? 'email' : 'phone'
    removed.push({ candidate: c, matchedOn, keptName: candidates[kept].name })
  })

  return { unique, removed }
}
