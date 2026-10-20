/**
 * Checks that a quote the model cites really is in the candidate's text.
 * Normalises case, whitespace, curly quotes and dashes, and tolerates a
 * dropped trailing punctuation mark — but not invented words.
 */
export const normaliseText = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‘’‛`´]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/[^\p{L}\p{N}'"%$₹.,:;!?()/+&-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

export function quoteIsIn(quote: string, text: string): boolean {
  const q = normaliseText(quote).replace(/^["'.\s]+|["'.,;:!?\s]+$/g, '')
  if (!q) return false
  const t = normaliseText(text)
  if (t.includes(q)) return true
  // Models sometimes join two fragments with "..." — each must be present
  const parts = q.split(/\s*\.\.\.\s*/).filter(p => p.length >= 4)
  return parts.length > 1 && parts.every(p => t.includes(p))
}

export const wordCount = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0)

/** Text pasted straight out of a chatbot, with its giveaways left in. */
const AI_ARTIFACTS: [RegExp, string][] = [
  [/chatgpt said\s*:/i, 'Contains "ChatGPT said:"'],
  [/\bas an ai(?: language)? model\b/i, 'Contains "As an AI language model"'],
  [/\bi(?:'m| am) an ai\b/i, 'Says it is an AI'],
  [/\bregenerate response\b/i, 'Contains "Regenerate response"'],
  [/\bcertainly!? here(?:'s| is)\b/i, 'Starts like a chatbot reply ("Certainly! Here is…")'],
  [/\[(?:insert|your) [^\]]{2,30}\]/i, 'Contains an unfilled template placeholder'],
]

export function aiArtifacts(text: string): string[] {
  return AI_ARTIFACTS.filter(([re]) => re.test(text)).map(([, label]) => label)
}

/** Attempts to instruct the scorer from inside an answer. Flagged, never obeyed. */
const INJECTION = /\b(ignore (all |the )?(previous|above|prior) (instructions|rules)|give (me|this answer) (a )?(score|rating) of|score (this|me) (a )?[45]|you are (now )?an? (ai|assistant|grader)|system prompt)\b/i

export const looksLikeInjection = (text: string) => INJECTION.test(text)
