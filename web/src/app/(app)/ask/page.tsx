import type { Metadata } from 'next'
import { requireMe } from '@/lib/auth'
import { ChatPanel } from '@/components/chat/ChatPanel'

export const metadata: Metadata = { title: 'Ask' }

export default async function AskPage() {
  const me = await requireMe()
  return (
    <div className="-mx-4 -mb-28 -mt-6 flex h-[calc(100dvh-3.5rem-4rem)] flex-col sm:-mx-6 lg:-mx-10 lg:-mb-12 lg:-mt-8 lg:h-dvh">
      <ChatPanel userKey={me.id} />
    </div>
  )
}
