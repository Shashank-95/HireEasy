import { NextResponse, type NextRequest } from 'next/server'
import { canAccessRole, getMe } from '@/lib/auth'
import { db } from '@/lib/supabase/server'

/**
 * Plays back an interview recording. Paths look like `<roleId>/<sessionId>/…`;
 * access is checked against the role before a short-lived signed URL is issued.
 */
export async function GET(req: NextRequest) {
  const me = await getMe()
  if (!me) return NextResponse.json({ error: 'Sign in' }, { status: 401 })
  const path = req.nextUrl.searchParams.get('path') ?? ''
  const roleId = path.split('/')[0]
  if (!/^[0-9a-f-]{36}\//.test(path) || path.includes('..')) return NextResponse.json({ error: 'Bad path' }, { status: 400 })
  if (!(await canAccessRole(me, roleId))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { data, error } = await db().storage.from('interview-audio').createSignedUrl(path, 300)
  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.redirect(data.signedUrl)
}
