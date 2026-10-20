import { NextResponse } from 'next/server'
import { getMe, canManageRoles } from '@/lib/auth'
import { googleAuthUrl, googleConfigured } from '@/lib/google'
import { sign } from '@/lib/crypto'

export async function GET() {
  const me = await getMe()
  if (!me || !canManageRoles(me)) return NextResponse.redirect(new URL('/settings?google=forbidden', process.env.NEXT_PUBLIC_APP_URL))
  if (!googleConfigured()) return NextResponse.redirect(new URL('/settings?google=not_configured', process.env.NEXT_PUBLIC_APP_URL))
  // State ties the callback to this person and expires in 10 minutes
  const state = sign(`${me.id}:${Date.now()}`)
  return NextResponse.redirect(googleAuthUrl(state))
}
