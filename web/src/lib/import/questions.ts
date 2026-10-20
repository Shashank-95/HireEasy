import type { ScreeningQuestion } from '../templates/types'

/**
 * Link the sheet's question columns to the role's screening questions. The
 * template generalises wording ("CricRocket" → "the app"), so an exact match
 * is not enough: columns are paired by word overlap, best pairs first, and HR
 * confirms on screen.
 */
const tokens = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .replace(/\(do not write more than \d+ words\)\.?/g, '')
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3),
  )

export function similarity(a: string, b: string): number {
  const A = tokens(a)
  const B = tokens(b)
  if (!A.size || !B.size) return 0
  let common = 0
  for (const w of A) if (B.has(w)) common++
  return common / Math.min(A.size, B.size)
}

/** Below this overlap a column is left unlinked for HR to choose. */
const MIN_SIMILARITY = 0.5

/** Returns { questionId: sheetColumn } for confident pairs. */
export function linkQuestions(columns: string[], questions: Pick<ScreeningQuestion, 'id' | 'text'>[]): Record<string, string> {
  const pairs: { q: string; col: string; s: number }[] = []
  for (const q of questions) for (const col of columns) pairs.push({ q: q.id, col, s: similarity(q.text, col) })
  pairs.sort((a, b) => b.s - a.s)
  const usedQ = new Set<string>()
  const usedC = new Set<string>()
  const out: Record<string, string> = {}
  for (const p of pairs) {
    if (p.s < MIN_SIMILARITY || usedQ.has(p.q) || usedC.has(p.col)) continue
    out[p.q] = p.col
    usedQ.add(p.q)
    usedC.add(p.col)
  }
  return out
}
