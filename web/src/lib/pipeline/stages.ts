import type { RoleSpec } from '../templates/types'

/**
 * A candidate is always in exactly one stage, with a status inside it:
 *   active — being processed, or waiting for the stage to finish
 *   review — needs a person to look (ambiguous data, waitlisted, failed AI call)
 *   out    — stopped here (excluded, below the bar, no-show); reason is in decisions
 *   hired  — chosen in the final round
 * Stages run in this order; interview rounds come from the role's plan.
 */
export type CandidateStatus = 'active' | 'review' | 'out' | 'hired'

export const FIXED_STAGES = ['eligibility', 'screening', 'resume'] as const

export interface StageInfo {
  key: string
  label: string
  kind: 'eligibility' | 'screening' | 'resume' | 'ai' | 'human' | 'done'
}

export function stagesFor(spec: RoleSpec): StageInfo[] {
  return [
    { key: 'eligibility', label: 'Eligibility', kind: 'eligibility' },
    { key: 'screening', label: 'Answer screening', kind: 'screening' },
    { key: 'resume', label: 'Resume check', kind: 'resume' },
    ...spec.interviewRounds.map(r => ({ key: r.id, label: r.name, kind: r.kind })),
    { key: 'done', label: 'Hired', kind: 'done' as const },
  ]
}

export function nextStage(spec: RoleSpec, current: string): string {
  const order = stagesFor(spec).map(s => s.key)
  const i = order.indexOf(current)
  return i === -1 || i === order.length - 1 ? 'done' : order[i + 1]
}

export function stageLabel(spec: RoleSpec, key: string): string {
  return stagesFor(spec).find(s => s.key === key)?.label ?? key
}
