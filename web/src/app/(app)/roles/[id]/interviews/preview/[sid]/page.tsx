import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getRoleForPage } from '@/lib/data/roles'
import { db } from '@/lib/supabase/server'
import { interviewBreakdown, type StoredAnswer } from '@/lib/data/breakdown'
import { BreakdownList, SummaryBlock } from '@/components/Breakdown'
import { Card, CardHeader, Notice } from '@/components/ui'

export const metadata: Metadata = { title: 'Preview interview' }

/** What a candidate would experience and how it would be scored — from HR's own run. */
export default async function PreviewResult({ params }: PageProps<'/roles/[id]/interviews/preview/[sid]'>) {
  const { id, sid } = await params
  const { role } = await getRoleForPage(id)
  const { data: s } = await db().from('interview_sessions').select('id, round_id, state, events, invited_at, interview_answers(question_id, followup_index, prompt, transcript, audio_path)').eq('id', sid).eq('role_id', id).eq('preview', true).maybeSingle()
  if (!s) notFound()
  const round = role.spec.interviewRounds.find(r => r.id === s.round_id)
  if (!round || round.kind !== 'ai') notFound()
  const score = ((s.events as { type: string; [k: string]: unknown }[]) ?? []).find(e => e.type === 'score')
  return (
    <div className="space-y-4">
      <Link href={`/roles/${id}/interviews`} className="text-[13px] text-muted hover:text-ink">← Interviews</Link>
      <Notice tone="info" title="Preview run — not part of the role">This is how your own run of “{round.name}” was transcribed and scored. Use it to check the questions, follow-ups and answer keys before candidates take it.</Notice>
      <Card>
        <CardHeader title={`${round.name}${score ? ` · ${score.score}/100` : ''}`} description={s.state === 'submitted' ? `Completed${score?.model ? ` · scored by ${score.model}` : ''}` : 'Not finished'} />
        <SummaryBlock summary={score?.summary as string | undefined} strengths={score?.strengths as string[] | undefined} concerns={score?.concerns as string[] | undefined} />
        <BreakdownList items={interviewBreakdown(round, (score as Record<string, unknown>) ?? null, (s.interview_answers ?? []) as StoredAnswer[])} />
      </Card>
    </div>
  )
}
