import { describe, expect, it } from 'vitest'
import { interviewBreakdown } from './breakdown'
import { productApm } from '../templates/product-apm'
import type { AiRound } from '../templates/types'

const round = productApm.spec.interviewRounds.find(r => r.kind === 'ai') as AiRound
const answer = (questionId: string) => ({ question_id: questionId, followup_index: 0, prompt: 'Q', transcript: 'An answer', audio_path: null })

describe('interview breakdown', () => {
  it('shows an answered but unscored question as pending, not 0/5', () => {
    const [first] = interviewBreakdown(round, null, [answer(round.questions[0].id)])
    expect(first.score).toBeNull()
    expect(first.reasoning).toBe('Not scored yet.')
  })
  it('uses the stored score once it is scored', () => {
    const details = { questions: [{ questionId: round.questions[0].id, score: 4, reasoning: 'Clear' }] }
    expect(interviewBreakdown(round, details, [answer(round.questions[0].id)])[0].score).toBe(4)
  })
  it('scores an unanswered question 1', () => {
    expect(interviewBreakdown(round, null, [])[0].score).toBe(1)
  })
})
