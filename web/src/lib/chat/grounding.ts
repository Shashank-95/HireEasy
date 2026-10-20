/**
 * The last line of defence against invented facts. Every number and every
 * role/candidate link in an answer must appear in the data the tools
 * returned (or in the question itself). Anything else is flagged, and the
 * answer is rewritten or withheld.
 */

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi

/** Numbers as written in prose: 70, 13.2, 1,500 → "1500". */
function numbersIn(text: string): string[] {
  const withoutLinks = text.replace(/\]\([^)]*\)/g, ']').replace(UUID, '')
  const out: string[] = []
  for (const line of withoutLinks.split('\n')) {
    // A list marker like "1." or "2)" at the start of a line is formatting, not a fact
    const body = line.replace(/^\s*\d{1,2}[.)]\s+/, '')
    for (const m of body.matchAll(/(?<![\w.])\d[\d,]*(?:\.\d+)?(?![\w])/g)) out.push(m[0].replace(/,/g, ''))
  }
  return out
}

const ID = String.raw`[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}`
const APP_PAGES = new RegExp(String.raw`^/(?:|ask|inbox|templates|settings|roles/${ID}(?:/(?:setup|applicants|calibration|interviews|report|emails|activity|applicants/changes|applicants/${ID}))?)/?(?:[?#].*)?$`, 'i')

export const isAppPage = (target: string) => APP_PAGES.test(target)

/** Every link target in an answer: markdown links and bare web addresses. */
export function linkTargets(answer: string): string[] {
  const md = [...answer.matchAll(/\]\(([^)\s]+)\)/g)].map(m => m[1])
  const bare = [...answer.replace(/\]\([^)]*\)/g, ']').matchAll(/https?:\/\/[^\s)>\]]+/gi)].map(m => m[0])
  return [...md, ...bare]
}

export interface GroundingResult {
  ok: boolean
  unverified: string[]
}

export function checkGrounding(answer: string, evidence: string, question = ''): GroundingResult {
  const haystack = `${evidence}\n${question}`
  const knownNumbers = new Set(numbersIn(haystack).map(n => String(Number(n))))
  // Also accept numbers that appear inside longer tokens of the data (e.g. "13.2" in "₹13.2 L")
  const flat = haystack.replace(UUID, ' ').replace(/,/g, '')
  const unverified: string[] = []

  for (const n of numbersIn(answer)) {
    const norm = String(Number(n))
    if (Number(n) <= 1) continue // "1 candidate", "0 people" — trivially safe, and always derivable
    if (knownNumbers.has(norm)) continue
    if (new RegExp(`(?<![\\w.])${norm.replace('.', '\\.')}(?![\\w])`).test(flat)) continue
    unverified.push(n)
  }
  for (const id of answer.match(UUID) ?? []) {
    if (!haystack.toLowerCase().includes(id.toLowerCase())) unverified.push(`link ${id.slice(0, 8)}…`)
  }
  // Only real HireEasy pages may be linked — no made-up pages, no other sites
  for (const target of linkTargets(answer)) {
    if (!isAppPage(target)) unverified.push(`page ${target.slice(0, 60)}`)
  }
  return { ok: unverified.length === 0, unverified: [...new Set(unverified)] }
}

/** "OPTIONS: Rahul Sharma (APM) | Rahul K (Designer)" at the end → quick-reply buttons. */
export function splitOptions(answer: string): { text: string; options: string[] } {
  const m = answer.match(/\n?\s*OPTIONS:\s*(.+)\s*$/i)
  if (!m) return { text: answer.trim(), options: [] }
  // Buttons show plain text: "[Name](link)" → "Name"
  const options = m[1].split('|').map(s => s.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\*\*/g, '').trim()).filter(Boolean).slice(0, 6)
  return { text: answer.slice(0, m.index).trim(), options }
}

const PATH = String.raw`/roles/[0-9a-f-]{36}(?:/[\w-]+)*(?:/[0-9a-f-]{36})?`

/**
 * Models sometimes write links inside out — "[/roles/…](link)" — or leave a
 * bare path in the text. Turn both into a proper [Name](path) link, naming it
 * from what the tools returned for that path.
 */
const PAGE_NAMES: [RegExp, string][] = [
  [/\/applicants\/changes$/, 'What we changed'],
  [/\/applicants\/[0-9a-f-]{36}$/, 'their page'],
  [/\/applicants$/, 'Applicants'],
  [/\/setup$/, 'Setup'],
  [/\/calibration$/, 'Calibration'],
  [/\/interviews$/, 'Interviews'],
  [/\/report$/, 'Shortlist report'],
  [/\/emails$/, 'Emails'],
  [/\/activity$/, 'Activity'],
  [/\/roles\/[0-9a-f-]{36}$/, 'role overview'],
]

export function repairLinks(answer: string, labels: Map<string, string>): string {
  const label = (p: string) => labels.get(p) ?? PAGE_NAMES.find(([re]) => re.test(p))?.[1] ?? 'this page'
  const fixed = answer
    // Placeholder paths ("/roles/…/applicants/<candidate_id>") mean nothing to a person
    .replace(/`?\/roles\/[^\s)`]*<[^>]+>[^\s)`]*`?/g, 'their candidate page')
    // JSON escapes copied from tool output: \" → "
    .replace(/\\(["'])/g, '$1')
    // "[ Name ]( /path )" → "[Name](/path)"
    .replace(/\[\s*([^\]\n]+?)\s*\]\(\s*([^)\s]+)\s*\)/g, '[$1]($2)')
    .replace(new RegExp(String.raw`\[(${PATH})\]\(([^)]*)\)`, 'g'), (_m, p: string, href: string) => `[${label(p)}](${href.startsWith('/roles/') ? href : p})`)
    .replace(new RegExp(String.raw`(^|[^(\w/])(${PATH})(?![\w/-])`, 'g'), (m, pre: string, p: string, offset: number, all: string) =>
      all[offset + m.length] === ']' ? m : `${pre}[${label(p)}](${p})`)
  return linkNames(fixed, labels)
}

/** Link the first plain mention of each record the tools returned, if the answer didn't. */
function linkNames(answer: string, labels: Map<string, string>): string {
  let out = answer
  // A name two records share (two Rahul Vermas) can't be linked without guessing which
  const shared = new Set([...labels.values()].filter((n, i, all) => all.indexOf(n) !== i))
  for (const [href, name] of labels) {
    if (name.length < 4 || name === 'Open' || shared.has(name) || out.includes(`](${href})`)) continue
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    // Skip mentions already inside link text or bold link labels
    const re = new RegExp(`(^|[^\\[\\w])(${esc})(?![\\w\\]])`)
    out = out.replace(re, (_m, pre: string, n: string) => `${pre}[${n}](${href})`)
  }
  return out
}
