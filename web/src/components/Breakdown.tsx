import { Check, Minus, X } from 'lucide-react'
import { Badge, cx } from './ui'

/**
 * How a score was reached, question by question: each element of a strong
 * answer, whether the candidate covered it specifically, generically or not
 * at all, and the words that show it. The same view for screening answers
 * and interview transcripts, so HR reads every AI decision the same way.
 */

export interface ElementCall {
  element: string
  status: 'specific' | 'generic' | 'absent'
  quote: string
}

export interface QuestionBreakdown {
  questionId: string
  question: string
  /** null while the answer waits to be scored */
  score: number | null
  reasoning?: string
  evidence?: string
  elements?: ElementCall[]
  /** What the candidate said or wrote */
  answer?: { label?: string; text: string; audioPath?: string | null }[]
}

const STATUS = {
  specific: { icon: Check, tone: 'text-success', label: 'Covered with specifics' },
  generic: { icon: Minus, tone: 'text-warn', label: 'Mentioned without detail' },
  absent: { icon: X, tone: 'text-faint', label: 'Not covered' },
} as const

export const scoreTone = (s: number) => (s >= 4 ? 'success' : s >= 3 ? 'warn' : 'danger') as 'success' | 'warn' | 'danger'

export function ElementList({ elements }: { elements: ElementCall[] }) {
  return (
    <ul className="space-y-1.5">
      {elements.map((e, i) => {
        const S = STATUS[e.status]
        return (
          <li key={i} className="flex gap-2 text-[13px]">
            <S.icon size={15} className={cx('mt-0.5 shrink-0', S.tone)} aria-label={S.label} />
            <span className="min-w-0">
              <span className={e.status === 'absent' ? 'text-faint' : 'text-ink'}>{e.element}</span>
              {e.quote && <span className="mt-0.5 block text-[12px] text-muted">“{e.quote}”</span>}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

export function BreakdownList({ items }: { items: QuestionBreakdown[] }) {
  return (
    <ol className="divide-y divide-line">
      {items.map((q, i) => (
        <li key={q.questionId} className="px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[13px] font-medium text-ink">
              <span className="text-faint">Q{i + 1}.</span> {q.question}
            </p>
            {q.score === null ? <Badge className="shrink-0">Pending</Badge> : <Badge tone={scoreTone(q.score)} className="shrink-0">{q.score}/5</Badge>}
          </div>

          {q.answer?.map((a, k) => (
            <div key={k} className="mt-2">
              {a.label && <p className="mb-1 text-[12px] font-medium text-accent">{a.label}</p>}
              <p className="whitespace-pre-wrap rounded-lg bg-surface-2 px-3 py-2 text-[13px] leading-relaxed text-muted">{a.text || '(nothing recorded)'}</p>
              {a.audioPath && <audio controls preload="none" className="mt-1.5 h-9 w-full" src={`/api/audio?path=${encodeURIComponent(a.audioPath)}`} />}
            </div>
          ))}

          {q.elements && q.elements.length > 0 ? (
            <div className="mt-3 rounded-lg border border-line px-3 py-2.5">
              <p className="mb-2 text-[12px] font-medium text-muted">What a strong answer covers — and what this one did</p>
              <ElementList elements={q.elements} />
            </div>
          ) : (
            q.evidence && <p className="mt-2 text-[13px]"><span className="text-faint">Evidence:</span> “{q.evidence}”</p>
          )}
          {q.reasoning && <p className="mt-2 text-[12px] text-muted">{q.reasoning}</p>}
        </li>
      ))}
    </ol>
  )
}

export function SummaryBlock({ summary, strengths, concerns }: { summary?: string; strengths?: string[]; concerns?: string[] }) {
  if (!summary && !strengths?.length && !concerns?.length) return null
  return (
    <div className="space-y-3 border-b border-line px-5 py-4 text-[13px]">
      {summary && <p className="leading-relaxed text-ink">{summary}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {!!strengths?.length && (
          <div>
            <p className="mb-1 text-[12px] font-medium text-success">Strengths</p>
            <ul className="list-inside list-disc space-y-0.5 text-muted">{strengths.map(s => <li key={s}>{s}</li>)}</ul>
          </div>
        )}
        {!!concerns?.length && (
          <div>
            <p className="mb-1 text-[12px] font-medium text-warn">Concerns</p>
            <ul className="list-inside list-disc space-y-0.5 text-muted">{concerns.map(s => <li key={s}>{s}</li>)}</ul>
          </div>
        )}
      </div>
    </div>
  )
}
