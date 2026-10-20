import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@/lib/supabase/server'
import { tick } from '@/lib/pipeline/engine'
import { safeEqual } from '@/lib/crypto'

export const maxDuration = 60

/**
 * Called every minute by Supabase pg_cron (or any scheduler) so roles keep
 * moving with nobody's browser open. Protected by CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? ''
  if (!process.env.CRON_SECRET || !safeEqual(auth, `Bearer ${process.env.CRON_SECRET}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { data: roles } = await db().from('roles').select('id').eq('status', 'active')
  const results: Record<string, unknown> = {}
  const started = Date.now()
  for (const r of roles ?? []) {
    const left = 50_000 - (Date.now() - started)
    if (left < 8_000) break
    results[r.id] = await tick(r.id, Math.min(40_000, left))
  }
  return NextResponse.json({ ok: true, results })
}
