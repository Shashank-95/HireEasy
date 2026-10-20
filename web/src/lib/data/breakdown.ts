import type { AiRound, RoleSpec } from '../templates/types'
import type { ElementCall, QuestionBreakdown } from '@/components/Breakdown'

/** Shapes saved in evaluations.details by the screening and interview scorers. */
interface StoredQuestion {
  questionId: string
  score: number
  evidence?: string
  reasoning?: string
  elements?: ElementCall[]
}

export interface StoredAnswer {
  question_id: string
  followup_index: number
  prompt: string
  transcript: string | null
  audio_path: string | null
}

export function screeningBreakdown(spec: RoleSpec, details: Record<string, unknown>, answers: Record<string, string>): QuestionBreakdown[] {
  const stored = (details.questions as StoredQuestion[]) ?? []
  return spec.screeningQuestions.map(q => {
    const s = stored.find(x => x.questionId === q.id)
    return {
      questionId: q.id,
      question: q.text,
      score: s?.score ?? 1,
      reasoning: s?.reasoning,
      evidence: s?.evidence,
      elements: s?.elements,
      answer: [{ text: answers[q.id] ?? '' }],
    }
  })
}

/** Questions in order; each with the main answer and any follow-up exchanges. */
export function interviewBreakdown(round: AiRound, details: Record<string, unknown> | null, answers: StoredAnswer[]): QuestionBreakdown[] {
  const stored = ((details?.questions as StoredQuestion[]) ?? [])
  return round.questions.map(q => {
    const s = stored.find(x => x.questionId === q.id)
    const mine = answers.filter(a => a.question_id === q.id).sort((a, b) => a.followup_index - b.followup_index)
    return {
      questionId: q.id,
      question: q.text,
      score: s?.score ?? (mine.length ? null : 1),
      reasoning: s?.reasoning ?? (mine.length ? 'Not scored yet.' : 'Not answered.'),
      evidence: s?.evidence,
      elements: s?.elements,
      answer: mine.length
        ? mine.map(a => ({ label: a.followup_index ? `Follow-up: ${a.prompt}` : undefined, text: a.transcript ?? '', audioPath: a.audio_path }))
        : [{ text: '' }],
    }
  })
}
