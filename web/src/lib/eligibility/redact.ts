/**
 * Removes the candidate's own name, emails and phone numbers from free text
 * before it reaches the AI, so scores rest on what they did, not who they are.
 * Institutions in the work history are kept — removing them would gut it.
 */
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function redactIdentity(text: string, who: { name?: string }): string {
  let out = text
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[email]')
    // Phone shapes only — a looser digit run would also eat date ranges like "2018 - 2020"
    .replace(/(?<![\w+])(?:\+\d{1,3}[\s-]?)?(?:\d{5}[\s-]?\d{5}|\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4})(?!\d)/g, '[phone]')
    .replace(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[\w-]+\/?/gi, '[profile]')

  const parts = (who.name || '').split(/\s+/).filter(p => p.length >= 3)
  for (const p of parts) out = out.replace(new RegExp(`\\b${escapeRegExp(p)}\\b`, 'gi'), '[candidate]')
  return out
}
