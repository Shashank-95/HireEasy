/**
 * Candidates type their LinkedIn / portfolio link by hand, so it arrives as
 * "linkedin.com/in/x", "www.https://…", a bit.ly short link, or not a link at
 * all. This makes it safe to open and says where it goes before anyone clicks.
 */

export interface ProfileLink {
  href: string
  /** What the person will land on, e.g. "LinkedIn", "Notion", "bit.ly short link". */
  label: string
  host: string
  /** A redirect service — the real destination is hidden until opened. */
  shortened: boolean
}

const SHORTENERS = /^(bit\.ly|rebrand\.ly|tinyurl\.com|t\.co|goo\.gl|cutt\.ly|shorturl\.at|rb\.gy|is\.gd|ow\.ly|lnkd\.in|tiny\.cc)$/i

const KNOWN: [RegExp, string][] = [
  [/(^|\.)linkedin\.com$/i, 'LinkedIn'],
  [/(^|\.)github\.com$/i, 'GitHub'],
  [/(^|\.)behance\.net$/i, 'Behance'],
  [/(^|\.)dribbble\.com$/i, 'Dribbble'],
  [/(^|\.)notion\.(so|site)$/i, 'Notion page'],
  [/(^|\.)framer\.(website|app)$/i, 'Framer site'],
  [/(^|\.)medium\.com$/i, 'Medium'],
  [/(^|\.)substack\.com$/i, 'Substack'],
  [/(^|\.)fueler\.io$/i, 'Fueler portfolio'],
  [/(^|\.)nextleap\.app$/i, 'NextLeap profile'],
  [/(^|\.)drive\.google\.com$|(^|\.)docs\.google\.com$/i, 'Google Drive'],
]

export function profileLink(raw: string | null | undefined): ProfileLink | null {
  let s = (raw ?? '').trim()
  if (!s) return null
  // Keep only the first link if several were pasted
  s = s.split(/\s+/)[0]
  // A form that prefixes "https://www." onto a pasted full link: keep the last one
  const inner = s.match(/https?:\/\/(?!.*https?:\/\/).*$/i)?.[0]
  if (inner && inner !== s) s = inner
  // "www.https://x" / "https//x" / "http:/x" typos
  s = s.replace(/^www\.(?=https?:)/i, '').replace(/^(https?)\/\//i, '$1://').replace(/^(https?):\/(?!\/)/i, '$1://')
  if (!/^https?:\/\//i.test(s)) s = `https://${s.replace(/^\/+/, '')}`
  let url: URL
  try {
    url = new URL(s)
  } catch {
    return null
  }
  const host = url.hostname.replace(/^www\./i, '').toLowerCase()
  // Needs a real domain — "N/A", "none", "-" are not links
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(host)) return null
  const shortened = SHORTENERS.test(host)
  const known = KNOWN.find(([re]) => re.test(host))?.[1]
  const label = shortened ? `${host} short link` : known ?? host
  return { href: url.toString(), label, host, shortened }
}
