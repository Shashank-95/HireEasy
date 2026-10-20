import 'server-only'
import type { z } from 'zod'
import { checkQuota, markExhausted, QuotaExceeded, recordUsage, releaseReservation } from './quota'

/**
 * Two free providers behind one call. Every call: quota check → request with
 * timeout → JSON parse → schema validation → one repair attempt. Temperature
 * is 0 so the same answer gets the same score.
 */

/**
 * Each Gemini model has its own free daily allowance, so scoring walks an
 * ordered chain: when one model's day is used up (or Google says it is in
 * "high demand"), the next one takes the call. AI_MODEL_CHAIN overrides the
 * order (comma-separated); AI_PRIMARY_MODEL still works as a one-model chain.
 */
export const DEFAULT_GEMINI_CHAIN = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3.5-flash'] as const

export function geminiChain(): string[] {
  const raw = process.env.AI_MODEL_CHAIN || process.env.AI_PRIMARY_MODEL || ''
  const list = raw.split(',').map(s => s.trim()).filter(Boolean)
  return [...new Set(list.length ? list : DEFAULT_GEMINI_CHAIN)]
}

export const MODELS = {
  primary: geminiChain()[0],
  second: 'openai/gpt-oss-120b',
  fast: 'openai/gpt-oss-20b',
  stt: 'whisper-large-v3-turbo',
} as const

export class AiUnavailable extends Error {
  constructor(message: string, public status?: number) {
    super(message)
  }
}
export class AiBadOutput extends Error {}

export const hasGemini = () => !!process.env.GEMINI_API_KEY
export const hasGroq = () => !!process.env.GROQ_API_KEY

/**
 * The models scoring may use, in order: the Gemini chain when its key is set,
 * otherwise Groq alone. Whichever one answers is recorded on the score.
 */
export function scoringChain(): string[] {
  if (hasGemini()) return geminiChain()
  if (hasGroq()) return [MODELS.second]
  throw new AiUnavailable('No AI key is configured. Add GEMINI_API_KEY or GROQ_API_KEY (both free) in the server settings.')
}

/** The first model scoring tries — the one calibration vouches for. */
export const primaryModel = () => scoringChain()[0]

/**
 * Worth trying the next model: this one's free day is gone, or Google is
 * shedding free traffic for it ("high demand"). Not for a per-minute limit
 * (it frees up in seconds, and every model in the chain is on the same key),
 * a bad key (401/403 — the next model would fail the same way) or bad output.
 */
export function canFallBack(e: unknown): boolean {
  if (e instanceof QuotaExceeded) return e.window === 'day'
  if (e instanceof AiUnavailable) return e.status === 503 || /high demand|overloaded/i.test(e.message)
  return false
}

const isGemini = (model: string) => model.startsWith('gemini')
const estimateTokens = (s: string) => Math.ceil(s.length / 3.6)

async function withTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, cache: 'no-store' })
  } finally {
    clearTimeout(t)
  }
}

interface RawResult {
  text: string
  tokens: number
}

async function rawCall(model: string, system: string, user: string, timeoutMs: number): Promise<RawResult> {
  await checkQuota(model, estimateTokens(system + user) + 1500)
  // Every reserved call either records its usage or gives the reservation back
  let recorded = false
  try {
    let res: Response
    if (isGemini(model)) {
      if (!hasGemini()) throw new AiUnavailable('GEMINI_API_KEY is not set.')
      res = await withTimeout(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY! },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: 'user', parts: [{ text: user }] }],
            generationConfig: { temperature: 0, responseMimeType: 'application/json' },
          }),
        },
        timeoutMs,
      )
    } else {
      if (!hasGroq()) throw new AiUnavailable('GROQ_API_KEY is not set.')
      res = await withTimeout(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
          body: JSON.stringify({
            model,
            temperature: 0,
            response_format: { type: 'json_object' },
            reasoning_effort: 'low',
            include_reasoning: false,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
          }),
        },
        timeoutMs,
      )
    }

    if (res.status === 429) {
      const q = rateLimitInfo(res.headers.get('retry-after'), await res.text().catch(() => ''))
      const resumeAt = new Date(Date.now() + q.retrySeconds * 1000)
      if (q.window === 'day') await markExhausted(model, resumeAt)
      throw new QuotaExceeded(model, resumeAt, q.window)
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new AiUnavailable(`${model} returned ${res.status}: ${body.slice(0, 200)}`, res.status)
    }
    const data = await res.json()
    let text = ''
    let tokens = 0
    if (isGemini(model)) {
      const parts = data.candidates?.[0]?.content?.parts ?? []
      text = parts.filter((p: { thought?: boolean }) => !p.thought).map((p: { text?: string }) => p.text ?? '').join('')
      tokens = data.usageMetadata?.totalTokenCount ?? estimateTokens(system + user + text)
    } else {
      text = data.choices?.[0]?.message?.content ?? ''
      tokens = data.usage?.total_tokens ?? estimateTokens(system + user + text)
    }
    await recordUsage(model, tokens)
    recorded = true
    if (!text.trim()) throw new AiBadOutput(`${model} returned an empty response.`)
    return { text, tokens }
  } finally {
    if (!recorded) releaseReservation(model)
  }
}

/**
 * A 429 can mean "slow down for a minute" or "today's free allowance is gone".
 * Google says which (quotaId …PerDay…) and when to retry; trust that over a guess.
 */
export function rateLimitInfo(retryAfter: string | null, body: string): { window: 'minute' | 'day'; retrySeconds: number } {
  const perDay = /PerDay|per day|daily/i.test(body)
  const delay = Number(body.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/)?.[1] ?? retryAfter ?? NaN)
  const retrySeconds = Number.isFinite(delay) && delay > 0 ? Math.ceil(delay) : perDay ? 3600 : 60
  return { window: perDay || retrySeconds > 600 ? 'day' : 'minute', retrySeconds }
}

function parseJson(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
  try {
    return JSON.parse(cleaned)
  } catch {
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1))
    throw new AiBadOutput('Response was not JSON.')
  }
}

interface AskArgs<T> {
  system: string
  user: string
  schema: z.ZodType<T>
  extraCheck?: (v: T) => string | null
  /** If the retry still fails `extraCheck`, fix the output safely instead of discarding it (return null to give up). */
  repairLastTry?: (v: T) => T | null
  timeoutMs?: number
}

/**
 * Ask for JSON that matches `schema`. On a parse or schema failure, retry
 * once with the error spelled out. `extraCheck` lets callers reject output
 * that is valid JSON but wrong (e.g. an evidence quote not in the answer).
 *
 * `model` may be a chain (see scoringChain). The whole call — first try and
 * repair — runs on one model; only if that model can't serve it at all
 * (canFallBack) does the next model start the call afresh. So one result is
 * always one model's judgement, and `model` in the result says which.
 * `fellBackFrom` is set when it wasn't the first model in the chain.
 */
export async function askJson<T>(args: AskArgs<T> & { model: string | readonly string[] }): Promise<{ value: T; model: string; tokens: number; repaired: boolean; fellBackFrom?: string }> {
  const chain = typeof args.model === 'string' ? [args.model] : [...args.model]
  if (!chain.length) throw new AiUnavailable('No AI model is configured.')
  let soonest: QuotaExceeded | null = null
  for (let i = 0; i < chain.length; i++) {
    try {
      const r = await askOneModel(chain[i], args)
      return i ? { ...r, fellBackFrom: chain[0] } : r
    } catch (e) {
      if (e instanceof QuotaExceeded && (!soonest || e.resumeAt < soonest.resumeAt)) soonest = e
      if (!canFallBack(e) || i === chain.length - 1) {
        // Every model's day is gone: report the one that comes back first
        throw e instanceof QuotaExceeded && soonest ? soonest : e
      }
    }
  }
  throw new AiUnavailable('No AI model could take the call.')
}

async function askOneModel<T>(model: string, args: AskArgs<T>): Promise<{ value: T; model: string; tokens: number; repaired: boolean }> {
  const { system, schema } = args
  let user = args.user
  let tokens = 0
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await rawCall(model, system, user, args.timeoutMs ?? 45_000)
    tokens += r.tokens
    let problem: string
    try {
      const parsed = schema.safeParse(parseJson(r.text))
      if (parsed.success) {
        const extra = args.extraCheck?.(parsed.data) ?? null
        if (!extra) return { value: parsed.data, model, tokens, repaired: attempt > 0 }
        const fixed = attempt === 1 ? args.repairLastTry?.(parsed.data) : null
        if (fixed) return { value: fixed, model, tokens, repaired: true }
        problem = extra
      } else {
        problem = parsed.error.issues.slice(0, 3).map(i => `${i.path.join('.')}: ${i.message}`).join('; ')
      }
    } catch (e) {
      problem = e instanceof Error ? e.message : 'invalid JSON'
    }
    user = `${args.user}\n\nYour previous response had a problem: ${problem}. Respond again with corrected JSON only.`
  }
  throw new AiBadOutput(`${model} could not produce valid output after a retry.`)
}

/** Speech to text. Returns null on silence-like output. */
export async function transcribe(audio: Blob, fileName: string, vocabularyHint: string): Promise<string> {
  if (!hasGroq()) throw new AiUnavailable('GROQ_API_KEY is not set — it is needed to transcribe interview answers.')
  await checkQuota(MODELS.stt)
  const form = new FormData()
  form.append('file', audio, fileName)
  form.append('model', MODELS.stt)
  form.append('language', 'en')
  form.append('temperature', '0')
  form.append('response_format', 'json')
  if (vocabularyHint) form.append('prompt', vocabularyHint.slice(0, 600))
  let res: Response
  try {
    res = await withTimeout('https://api.groq.com/openai/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` }, body: form }, 60_000)
  } catch (e) {
    releaseReservation(MODELS.stt)
    throw e
  }
  if (res.status === 429) {
    releaseReservation(MODELS.stt)
    throw new QuotaExceeded(MODELS.stt, new Date(Date.now() + Number(res.headers.get('retry-after') ?? 60) * 1000), 'minute')
  }
  if (!res.ok) {
    releaseReservation(MODELS.stt)
    throw new AiUnavailable(`Transcription failed (${res.status}).`)
  }
  await recordUsage(MODELS.stt, 0)
  const data = await res.json()
  return String(data.text ?? '').trim()
}
