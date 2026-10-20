import type { Metadata } from 'next'
import { InterviewRoom } from './InterviewRoom'

export const metadata: Metadata = { title: 'Interview', robots: { index: false, follow: false }, referrer: 'no-referrer' }

export default async function InterviewPage({ params }: PageProps<'/i/[token]'>) {
  const { token } = await params
  return <InterviewRoom token={token} />
}
