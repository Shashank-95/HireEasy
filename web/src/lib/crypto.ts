import 'server-only'
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const secret = () => {
  const s = process.env.APP_SECRET
  if (!s || s.length < 32) throw new Error('APP_SECRET is missing or too short.')
  return s
}

const key = () => createHash('sha256').update(`enc:${secret()}`).digest()

/** AES-256-GCM. Used for the stored Google refresh token. */
export function encrypt(plain: string): string {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', key(), iv)
  const body = Buffer.concat([c.update(plain, 'utf8'), c.final()])
  return [iv, c.getAuthTag(), body].map(b => b.toString('base64url')).join('.')
}

export function decrypt(token: string): string {
  const [iv, tag, body] = token.split('.').map(p => Buffer.from(p, 'base64url'))
  const d = createDecipheriv('aes-256-gcm', key(), iv)
  d.setAuthTag(tag)
  return Buffer.concat([d.update(body), d.final()]).toString('utf8')
}

/**
 * Interview link token: an HMAC of the session id, so the same link can be
 * re-sent in a reminder without storing the token itself. Only its hash is
 * stored for lookup.
 */
export const interviewToken = (sessionId: string) => createHmac('sha256', `iv:${secret()}`).update(sessionId).digest('base64url').slice(0, 32)
export const hashToken = (t: string) => createHash('sha256').update(t).digest('hex')

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

/** Signs short-lived values like the OAuth state parameter. */
export const sign = (value: string) => `${value}.${createHmac('sha256', `sig:${secret()}`).update(value).digest('base64url').slice(0, 22)}`
export function unsign(signed: string): string | null {
  const i = signed.lastIndexOf('.')
  if (i < 0) return null
  const value = signed.slice(0, i)
  return safeEqual(sign(value), signed) ? value : null
}
