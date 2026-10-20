import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { getMe } from '@/lib/auth'
import { ask } from '@/lib/chat/agent'

export const maxDuration = 60

const Body = z.object({
  messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(8000) })).min(1).max(30),
  context: z.object({ roleId: z.string().uuid().optional(), candidateId: z.string().uuid().optional() }).default({}),
})

export async function POST(req: NextRequest) {
  const me = await getMe()
  if (!me) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success || parsed.data.messages.at(-1)?.role !== 'user') return NextResponse.json({ error: 'Bad request.' }, { status: 400 })
  const reply = await ask(me, parsed.data.messages, parsed.data.context)
  return NextResponse.json(reply, { headers: { 'Cache-Control': 'no-store' } })
}
