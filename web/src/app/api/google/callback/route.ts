import { NextResponse, type NextRequest } from 'next/server'
import { unsign } from '@/lib/crypto'
import { exchangeCode } from '@/lib/google'
import { audit } from '@/lib/data/roles'

export async function GET(req: NextRequest) {
  const app = process.env.NEXT_PUBLIC_APP_URL!
  const code = req.nextUrl.searchParams.get('code')
  const state = unsign(req.nextUrl.searchParams.get('state') ?? '')
  const err = req.nextUrl.searchParams.get('error')
  if (err) return NextResponse.redirect(new URL(`/settings?google=denied`, app))
  if (!code || !state) return NextResponse.redirect(new URL('/settings?google=invalid', app))
  const [userId, ts] = state.split(':')
  if (Date.now() - Number(ts) > 10 * 60_000) return NextResponse.redirect(new URL('/settings?google=expired', app))
  try {
    const email = await exchangeCode(code, userId)
    await audit(null, userId, 'google.connected', { email })
    return NextResponse.redirect(new URL(`/settings?google=connected`, app))
  } catch (e) {
    const msg = encodeURIComponent(e instanceof Error ? e.message : 'Google connection failed')
    return NextResponse.redirect(new URL(`/settings?google=error&msg=${msg}`, app))
  }
}
