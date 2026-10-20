import 'server-only'
import { db } from '../supabase/server'

/**
 * Calibration: the hiring team labels a sample of applicants blind (no AI
 * score, no name, no college), and the AI's band is compared with theirs on a
 * held-out part of the sample. Autopilot unlocks only when they agree.
 */

export type Band = 'strong' | 'possible' | 'no'
export const PASS_AGREEMENT = 0.8
export const MIN_VALIDATE_LABELS = 10
const SAMPLE_SIZE = 40
const VALIDATE_EVERY = 3 // 1 in 3 → ~15 of 40 held out

export interface SampleItem {
  candidateId: string
  split: 'tune' | 'validate'
}

/** Stratified: top, bottom, and the uncertain middle around the bar. */
export function chooseSample(scored: { id: string; score: number }[], bar: number, size = SAMPLE_SIZE): SampleItem[] {
  const sorted = [...scored].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
  if (sorted.length <= size) return interleave(sorted.map(s => s.id))
  const third = Math.floor(size / 3)
  const top = sorted.slice(0, third)
  const bottom = sorted.slice(-third)
  const rest = sorted.slice(third, sorted.length - third).sort((a, b) => Math.abs(a.score - bar) - Math.abs(b.score - bar) || a.id.localeCompare(b.id))
  const middle = rest.slice(0, size - 2 * third)
  // Mix the strata so tune and validate both see every kind of answer
  const mixed: string[] = []
  const strata = [top, middle, bottom]
  for (let i = 0; mixed.length < size && i < size; i++) {
    for (const s of strata) if (s[i]) mixed.push(s[i].id)
  }
  return interleave(mixed.slice(0, size))
}

const interleave = (ids: string[]): SampleItem[] => ids.map((candidateId, i) => ({ candidateId, split: i % VALIDATE_EVERY === VALIDATE_EVERY - 1 ? 'validate' : 'tune' }))

export interface Agreement {
  labelled: number
  agree: number
  rate: number
  kappa: number
  /** [human][ai] counts */
  matrix: Record<Band, Record<Band, number>>
}

/** When several people labelled the same applicant, their most recent label counts — once. */
export function latestPerCandidate<T extends { candidate_id: string; created_at: string }>(labels: T[]): Map<string, T> {
  const out = new Map<string, T>()
  for (const l of [...labels].sort((a, b) => b.created_at.localeCompare(a.created_at))) if (!out.has(l.candidate_id)) out.set(l.candidate_id, l)
  return out
}

export function agreement(pairs: { human: Band; ai: Band }[]): Agreement {
  const bands: Band[] = ['strong', 'possible', 'no']
  const matrix = Object.fromEntries(bands.map(h => [h, Object.fromEntries(bands.map(a => [a, 0]))])) as Agreement['matrix']
  for (const p of pairs) matrix[p.human][p.ai]++
  const n = pairs.length
  const agree = pairs.filter(p => p.human === p.ai).length
  const po = n ? agree / n : 0
  const pe = n ? bands.reduce((s, b) => s + (pairs.filter(p => p.human === b).length / n) * (pairs.filter(p => p.ai === b).length / n), 0) : 0
  return { labelled: n, agree, rate: po, kappa: pe === 1 ? 1 : (po - pe) / (1 - pe), matrix }
}

export async function getSample(roleId: string): Promise<SampleItem[] | null> {
  const { data } = await db().from('jobs').select('progress').eq('role_id', roleId).eq('kind', 'calibration').maybeSingle()
  return ((data?.progress as { sample?: SampleItem[] })?.sample) ?? null
}

export async function saveSample(roleId: string, sample: SampleItem[]) {
  const { data } = await db().from('jobs').select('id').eq('role_id', roleId).eq('kind', 'calibration').maybeSingle()
  if (data) await db().from('jobs').update({ progress: { sample }, updated_at: new Date().toISOString() }).eq('id', data.id)
  else await db().from('jobs').insert({ role_id: roleId, kind: 'calibration', state: 'done', progress: { sample } })
}
