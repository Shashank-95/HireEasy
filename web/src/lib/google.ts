import 'server-only'
import { db } from './supabase/server'
import { decrypt, encrypt } from './crypto'

/**
 * One Google account sends every email and owns every Meet invite: the HR
 * account that connected in Settings. Only `gmail.send` and calendar events
 * are requested — the app can't read anyone's mail.
 */
export const GOOGLE_SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/calendar.events']

export const googleConfigured = () => !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET
const redirectUri = () => `${process.env.NEXT_PUBLIC_APP_URL}/api/google/callback`

export class GoogleNotConnected extends Error {
  constructor() {
    super('Google is not connected. In Settings, connect the Google account that should send emails and Meet invites.')
  }
}

export function googleAuthUrl(state: string): string {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: GOOGLE_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`
}

export async function exchangeCode(code: string, userId: string) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, redirect_uri: redirectUri(), grant_type: 'authorization_code' }),
  })
  const t = await res.json()
  if (!res.ok || !t.refresh_token) throw new Error(t.error_description || 'Google did not return a refresh token. Remove HireEasy from your Google account permissions and connect again.')
  const claims = JSON.parse(Buffer.from(String(t.id_token).split('.')[1], 'base64url').toString())
  const scopes = String(t.scope ?? '').split(' ')
  const missing = GOOGLE_SCOPES.filter(s => s.startsWith('https') && !scopes.includes(s))
  if (missing.length) throw new Error('Some permissions were not granted. Connect again and tick every box on Google\'s screen.')
  await db().from('google_connections').upsert({ user_id: userId, google_email: claims.email, refresh_token_enc: encrypt(t.refresh_token), scopes, updated_at: new Date().toISOString() })
  return claims.email as string
}

export async function googleConnection(): Promise<{ email: string; userId: string } | null> {
  const { data } = await db().from('google_connections').select('user_id, google_email').order('updated_at', { ascending: false }).limit(1).maybeSingle()
  return data ? { email: data.google_email, userId: data.user_id } : null
}

let cached: { token: string; exp: number } | null = null

async function accessToken(): Promise<string> {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token
  const { data } = await db().from('google_connections').select('refresh_token_enc').order('updated_at', { ascending: false }).limit(1).maybeSingle()
  if (!data) throw new GoogleNotConnected()
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ refresh_token: decrypt(data.refresh_token_enc), client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, grant_type: 'refresh_token' }),
  })
  const t = await res.json()
  if (!res.ok) {
    if (t.error === 'invalid_grant') throw new Error('The Google connection expired or was revoked. Reconnect Google in Settings.')
    throw new Error(`Google sign-in failed: ${t.error_description ?? t.error}`)
  }
  cached = { token: t.access_token, exp: Date.now() + t.expires_in * 1000 }
  return cached.token
}

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64')
/** RFC 2047 encoded-word, so non-ASCII subjects and names survive every mail client. */
const encWord = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`)
const wrap76 = (s: string) => s.replace(/.{1,76}/g, '$&\r\n')
/** Header values come from imported candidate data: a line break would start a new header. */
const oneLine = (s: string) => s.replace(/[\r\n]+/g, ' ').trim()

/**
 * The From header. Gmail keeps a custom display name only when the address is
 * the connected account's own (with a placeholder it swaps in the account's
 * profile name). A comma or other RFC 5322 special must be quoted, or
 * "Shashank, Hiring Team" reads as two addresses.
 */
export function fromHeader(name: string, address: string): string {
  const n = oneLine(name)
  const a = `<${oneLine(address)}>`
  if (!n) return a
  if (!/^[\x20-\x7e]*$/.test(n)) return `${encWord(n)} ${a}`
  if (/[()<>[\]:;@\\,."]/.test(n)) return `"${n.replace(/["\\]/g, '\\$&')}" ${a}`
  return `${n} ${a}`
}

/** Calendar text every attendee sees, candidate included: nothing internal. */
export function meetDescription(roundName: string, roleTitle: string, company: string): string {
  return `${roundName} for ${roleTitle}${company ? ` at ${company}` : ''}.`
}

export async function sendGmail(m: { to: string; subject: string; html: string; text: string; fromName: string; replyTo?: string }): Promise<string> {
  const boundary = `he_${Math.random().toString(36).slice(2)}`
  const sender = await googleConnection()
  if (!sender) throw new GoogleNotConnected()
  const headers = [
    `To: ${oneLine(m.to)}`,
    `From: ${fromHeader(m.fromName, sender.email)}`,
    m.replyTo ? `Reply-To: ${oneLine(m.replyTo)}` : '',
    `Subject: ${encWord(oneLine(m.subject))}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ].filter(Boolean)
  const raw = [
    ...headers,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    wrap76(b64(m.text)),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    wrap76(b64(m.html)),
    `--${boundary}--`,
  ].join('\r\n')

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: Buffer.from(raw).toString('base64url') }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message ?? `Gmail returned ${res.status}`)
  return data.id as string
}

export async function createMeetEvent(e: { summary: string; description: string; start: Date; minutes: number; attendees: string[]; requestId: string }) {
  const end = new Date(e.start.getTime() + e.minutes * 60_000)
  const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all', {
    method: 'POST',
    headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      summary: e.summary,
      description: e.description,
      start: { dateTime: e.start.toISOString() },
      end: { dateTime: end.toISOString() },
      attendees: e.attendees.map(email => ({ email })),
      conferenceData: { createRequest: { requestId: e.requestId, conferenceSolutionKey: { type: 'hangoutsMeet' } } },
      reminders: { useDefault: true },
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message ?? `Google Calendar returned ${res.status}`)
  const meet = data.hangoutLink ?? data.conferenceData?.entryPoints?.find((p: { entryPointType: string }) => p.entryPointType === 'video')?.uri ?? ''
  return { eventId: data.id as string, meetLink: meet as string, htmlLink: data.htmlLink as string }
}

/** Cancel a booked interview; Google emails every attendee the cancellation. */
export async function cancelMeetEvent(eventId: string) {
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=all`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${await accessToken()}` },
  })
  // Already deleted on the calendar is fine
  if (!res.ok && res.status !== 404 && res.status !== 410) throw new Error(`Google Calendar returned ${res.status}`)
}
