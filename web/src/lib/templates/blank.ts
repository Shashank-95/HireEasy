import type { RoleSpec } from './types'

/** A new template with the fixed structure and nothing role-specific filled in. */
export function blankSpec(title: string): RoleSpec {
  return {
    basics: { title, team: '', level: 'entry', employmentType: 'full_time', workMode: 'remote', city: '' },
    opportunity: '',
    responsibilities: [{ theme: '', bullets: [] }],
    mustHaves: [],
    goodToHaves: [],
    screeningQuestions: [],
    screeningAdvance: { minScore: 70, maxAdvance: 25 },
    eligibility: {
      budget: { enabled: true, fixedLpa: 0, variableLpa: 0, compareAgainst: 'total', tolerancePct: 20, action: 'exclude' },
      experience: { enabled: true, minYears: 0, maxYears: 2, tolerancePct: 20, action: 'exclude' },
      notice: { enabled: false, maxDays: 60, tolerancePct: 0, action: 'exclude' },
      location: { enabled: false, allowed: [], action: 'exclude' },
    },
    preferredColleges: [],
    preferredCollegeBonus: 0,
    interviewRounds: [
      { kind: 'ai', id: 'ai-1', name: 'AI round 1', questions: [], maxFollowUps: 1, deadlineHours: 72, reminderHoursBefore: 24, advance: { minScore: 70, maxAdvance: 10 } },
      { kind: 'human', id: 'hm-final', name: 'Final round with the hiring manager', interviewerEmails: [], durationMin: 45 },
    ],
  }
}
