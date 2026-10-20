import 'server-only'
import { db } from '../supabase/server'

/**
 * Free-tier limits, shared across every server instance through the
 * database. Values are deliberately a little under the published limits.
 */
export interface Limits {
  rpm: number
  rpd: number
  tpm?: number
  tpd?: number
  /**
   * The provider's day doesn't line up with ours (Groq's is rolling), so our
   * daily count is shown but doesn't block — the provider's own "daily limit"
   * reply (a 429 we read and record) does.
   */
  providerDay?: boolean
}

/**
 * Gemini's free tier counts each model separately, so every model in the
 * scoring chain has its own entry and its own quota_usage rows. Google
 * doesn't publish fixed free numbers for these models (it shows them per
 * project in AI Studio), so these sit under what the key has actually been
 * allowed: 3.5-flash-lite stopped at ~480 a day on 20 Oct 2026. Flash-lite
 * models share that tier; the full Flash model gets the smaller Flash tier.
 * Either way the provider's own "daily limit" 429 is the backstop — it is
 * read and recorded, and the chain moves on.
 */
const FLASH_LITE: Limits = { rpm: 14, rpd: 480 }
export const MODEL_LIMITS: Record<string, Limits> = {
  'gemini-3.5-flash-lite': FLASH_LITE,
  'gemini-3.1-flash-lite': FLASH_LITE,
  'gemini-3.5-flash': { rpm: 9, rpd: 240 },
  'openai/gpt-oss-120b': { rpm: 28, rpd: 950, tpm: 7500, tpd: 190_000, providerDay: true },
  'openai/gpt-oss-20b': { rpm: 28, rpd: 950, tpm: 7500, tpd: 190_000, providerDay: true },
  'whisper-large-v3-turbo': { rpm: 18, rpd: 1900, providerDay: true },
}

/** Limits for a model; a Gemini model not listed (e.g. set in AI_MODEL_CHAIN) is treated like flash-lite. */
export function limitsFor(model: string): Limits | undefined {
  return MODEL_LIMITS[model] ?? (/^gemini/i.test(model) ? FLASH_LITE : undefined)
}

export class QuotaExceeded extends Error {
  constructor(public model: string, public resumeAt: Date, public window: 'minute' | 'day') {
    const who = /gemini/i.test(model) ? 'Google Gemini' : /whisper/i.test(model) ? 'Groq transcription' : 'Groq'
    const at = resumeAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', ...(window === 'day' ? { weekday: 'short' } : {}) })
    super(window === 'minute' ? `${who}’s free per-minute limit is used up — continues at ${at} IST.` : `${who}’s free daily limit is used up — continues ${at} IST. Nothing is lost.`)
  }
}

const minuteStart = (d: Date) => new Date(Math.floor(d.getTime() / 60_000) * 60_000)
/** Google and Groq reset daily quotas at midnight Pacific. */
export function dayStart(d: Date): Date {
  const pt = new Date(d.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }))
  const offset = d.getTime() - pt.getTime()
  pt.setHours(0, 0, 0, 0)
  // toLocaleString drops milliseconds, so the offset carries a stray fraction
  // of a second; real time-zone offsets are whole minutes. Without rounding,
  // every call opened a new "day" row and usage always read as zero.
  return new Date(Math.round((pt.getTime() + offset) / 60_000) * 60_000)
}

async function usage(model: string, kind: 'minute' | 'day', start: Date) {
  const { data } = await db().from('quota_usage').select('requests, tokens').eq('model', model).eq('window_kind', kind).eq('window_start', start.toISOString()).maybeSingle()
  return data ?? { requests: 0, tokens: 0 }
}

/**
 * Several AI calls run at once (screening scores 4 applicants in parallel), so
 * check-and-reserve runs one at a time per model, and calls still in flight
 * count against the limit until their usage is recorded.
 */
const chains = new Map<string, Promise<unknown>>()
function exclusive<T>(model: string, fn: () => Promise<T>): Promise<T> {
  const prev = chains.get(model) ?? Promise.resolve()
  const run = prev.then(fn, fn)
  chains.set(model, run.catch(() => undefined))
  return run
}
const inFlight = new Map<string, { minute: number; requests: number; tokens: number }>()
function reserved(model: string, minute: Date) {
  const r = inFlight.get(model)
  return r && r.minute === minute.getTime() ? r : { minute: minute.getTime(), requests: 0, tokens: 0 }
}

/** Throws QuotaExceeded if one more call (of roughly `tokens`) would go over; otherwise reserves it. */
export function checkQuota(model: string, tokens = 0) {
  const lim = limitsFor(model)
  if (!lim) return Promise.resolve()
  return exclusive(model, async () => {
    const now = new Date()
    const until = blockedUntil.get(model)
    if (until && until > now.getTime()) throw new QuotaExceeded(model, new Date(until), 'day')
    const m = minuteStart(now)
    const d = dayStart(now)
    const [mu, du] = await Promise.all([usage(model, 'minute', m), usage(model, 'day', d)])
    const r = reserved(model, m)
    const dayFull = lim.providerDay ? du.requests >= lim.rpd : du.requests + r.requests + 1 > lim.rpd || (!!lim.tpd && du.tokens + r.tokens + tokens > lim.tpd)
    if (dayFull) throw new QuotaExceeded(model, new Date(d.getTime() + 86_400_000), 'day')
    // Our size estimate is deliberately high: one request bigger than the whole
    // per-minute cap may still go in an otherwise empty minute (the provider decides)
    const est = lim.tpm ? Math.min(tokens, lim.tpm) : tokens
    if (mu.requests + r.requests + 1 > lim.rpm || (lim.tpm && mu.tokens + r.tokens + est > lim.tpm)) throw new QuotaExceeded(model, new Date(m.getTime() + 60_000), 'minute')
    inFlight.set(model, { minute: r.minute, requests: r.requests + 1, tokens: r.tokens + est })
  })
}

/** "Come back at …" from a provider whose day is rolling: honoured exactly, not until our midnight. */
const blockedUntil = new Map<string, number>()

/** The provider says today's allowance is gone: stop asking until it said to come back. */
export async function markExhausted(model: string, resumeAt?: Date) {
  const lim = limitsFor(model)
  if (!lim) return
  if (lim.providerDay) {
    if (resumeAt) blockedUntil.set(model, resumeAt.getTime())
    return
  }
  const d = dayStart(new Date())
  const cur = await usage(model, 'day', d)
  if (cur.requests < lim.rpd) await db().from('quota_usage').upsert({ model, window_kind: 'day', window_start: d.toISOString(), requests: lim.rpd, tokens: cur.tokens })
}

/** A reserved call that failed before using any quota (timeout, 5xx, 429): give its place back. */
export function releaseReservation(model: string) {
  const r = inFlight.get(model)
  if (r && r.requests > 0) inFlight.set(model, { ...r, requests: r.requests - 1 })
}

/** Record a finished call and release its reservation. */
export function recordUsage(model: string, tokens: number) {
  return exclusive(model, async () => {
    const now = new Date()
    const r = inFlight.get(model)
    if (r && r.requests > 0) inFlight.set(model, { ...r, requests: r.requests - 1, tokens: Math.max(0, r.tokens - tokens) })
    for (const [kind, start] of [['minute', minuteStart(now)], ['day', dayStart(now)]] as const) {
      const cur = await usage(model, kind, start)
      await db().from('quota_usage').upsert({ model, window_kind: kind, window_start: start.toISOString(), requests: cur.requests + 1, tokens: cur.tokens + tokens })
    }
  })
}

/** Today's use of each model, in the order given (the scoring chain first). */
export async function quotaSnapshot(models: string[] = Object.keys(MODEL_LIMITS)) {
  const d = dayStart(new Date())
  const out: Record<string, { used: number; limit: number }> = {}
  await Promise.all([...new Set(models)].map(async model => {
    const lim = limitsFor(model)
    if (!lim) return
    const u = await usage(model, 'day', d)
    out[model] = { used: u.requests, limit: lim.rpd }
  }))
  // Promise.all fills in any order; keep the order asked for
  return Object.fromEntries([...new Set(models)].filter(m => out[m]).map(m => [m, out[m]]))
}
