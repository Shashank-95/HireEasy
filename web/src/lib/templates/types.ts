import { z } from 'zod'

/**
 * The fixed structure every role follows. HR and hiring managers edit the
 * content; the shape never changes. Fewer free-form inputs is a deliberate
 * accuracy choice: the scorer gets the same kind of signal for every role.
 */

export const Importance = z.enum(['high', 'medium', 'low'])
export type Importance = z.infer<typeof Importance>

/** Importance → weight, fixed in code so nobody has to balance percentages. */
export const IMPORTANCE_WEIGHT: Record<Importance, number> = { high: 3, medium: 2, low: 1 }

export const AssessedBy = z.enum(['screening', 'resume', 'interview'])
export type AssessedBy = z.infer<typeof AssessedBy>

export const Skill = z.object({
  id: z.string(),
  name: z.string().min(1),
  /** One line on what "good" means for this role — the scorer reads it */
  description: z.string(),
  importance: Importance,
  /** Where this skill can actually be observed. A skill nobody checks is noise. */
  assessedBy: z.array(AssessedBy),
})
export type Skill = z.infer<typeof Skill>

/** What a 1, 3 and 5 answer looks like. Anchors make small models consistent. */
export const Rubric = z.object({
  1: z.string(),
  3: z.string(),
  5: z.string(),
})
export type Rubric = z.infer<typeof Rubric>

export const ScreeningQuestion = z.object({
  id: z.string(),
  text: z.string().min(1),
  wordLimit: z.number().int().positive(),
  /** The 1–2 skills this question tests */
  skillIds: z.array(z.string()),
  importance: Importance,
  rubric: Rubric,
})
export type ScreeningQuestion = z.infer<typeof ScreeningQuestion>

export const InterviewQuestion = z.object({
  id: z.string(),
  text: z.string().min(1),
  skillIds: z.array(z.string()),
  rubric: Rubric,
  timeLimitSec: z.number().int().min(30).max(300),
})
export type InterviewQuestion = z.infer<typeof InterviewQuestion>

/**
 * Who moves on from a stage: everyone at or above the bar, capped at a
 * maximum so the next round stays manageable. Candidates the AI is unsure
 * about near the bar are advanced — the next round gathers better evidence.
 */
export const AdvanceRule = z.object({
  minScore: z.number().min(0).max(100),
  maxAdvance: z.number().int().min(1),
})
export type AdvanceRule = z.infer<typeof AdvanceRule>

export const AiRound = z.object({
  kind: z.literal('ai'),
  id: z.string(),
  name: z.string(),
  questions: z.array(InterviewQuestion),
  /** Probing follow-ups the AI may ask per question (0 = fixed questions only) */
  maxFollowUps: z.number().int().min(0).max(2),
  /** Hours a candidate has to complete the interview after the invite */
  deadlineHours: z.number().int().min(12).max(336),
  /** Reminder this many hours before the deadline (0 = none) */
  reminderHoursBefore: z.number().int().min(0).max(72),
  advance: AdvanceRule,
})
export type AiRound = z.infer<typeof AiRound>

/**
 * A round a person takes over Google Meet. Autopilot stops here: HR is
 * notified, picks a time that suits both sides, and the tool sends the invite.
 */
export const HumanRound = z.object({
  kind: z.literal('human'),
  id: z.string(),
  name: z.string(),
  interviewerEmails: z.array(z.string()),
  durationMin: z.number().int().min(15).max(120),
})
export type HumanRound = z.infer<typeof HumanRound>

export const InterviewRound = z.discriminatedUnion('kind', [AiRound, HumanRound])
export type InterviewRound = z.infer<typeof InterviewRound>

export const Level = z.enum(['intern', 'entry', 'mid', 'senior', 'lead'])
export type Level = z.infer<typeof Level>

export const Eligibility = z.object({
  budget: z.object({
    enabled: z.boolean(),
    fixedLpa: z.number().min(0),
    variableLpa: z.number().min(0),
    /** Compare the candidate's ask against total CTC or fixed pay only */
    compareAgainst: z.enum(['total', 'fixed']),
    tolerancePct: z.number().min(0).max(50),
    action: z.enum(['exclude', 'review']),
  }),
  experience: z.object({
    enabled: z.boolean(),
    minYears: z.number().min(0),
    maxYears: z.number().min(0).nullable(),
    tolerancePct: z.number().min(0).max(50),
    action: z.enum(['exclude', 'review']),
  }),
  notice: z.object({
    enabled: z.boolean(),
    maxDays: z.number().min(0),
    tolerancePct: z.number().min(0).max(50),
    action: z.enum(['exclude', 'review']),
  }),
  location: z.object({
    enabled: z.boolean(),
    allowed: z.array(z.string()),
    action: z.enum(['exclude', 'review']),
  }),
})
export type Eligibility = z.infer<typeof Eligibility>

export const RoleSpec = z.object({
  basics: z.object({
    title: z.string(),
    team: z.string(),
    level: Level,
    employmentType: z.enum(['full_time', 'internship', 'contract']),
    workMode: z.enum(['remote', 'hybrid', 'onsite']),
    city: z.string(),
  }),
  /** Two or three lines on why the role exists — shown at the top of the JD */
  opportunity: z.string(),
  responsibilities: z.array(z.object({ theme: z.string(), bullets: z.array(z.string()) })),
  mustHaves: z.array(Skill),
  goodToHaves: z.array(Skill),
  screeningQuestions: z.array(ScreeningQuestion),
  /** Who leaves screening (answers + resume) for the first interview round */
  screeningAdvance: AdvanceRule,
  eligibility: Eligibility,
  preferredColleges: z.array(z.string()),
  /** Score bonus for preferred colleges, 0–10 points on a 100 scale; 0 = tag only */
  preferredCollegeBonus: z.number().min(0).max(10),
  interviewRounds: z.array(InterviewRound),
})
export type RoleSpec = z.infer<typeof RoleSpec>

/**
 * A note on how source material was turned into this structure. Shown in the
 * app so nothing about the conversion is hidden from HR.
 */
export interface ChangeNote {
  section: string
  change: string
  why: string
}

export interface RoleTemplate {
  id: string
  name: string
  family: string
  description: string
  spec: RoleSpec
  /** How the original JD this template came from was restructured */
  changeNotes: ChangeNote[]
}

/** Structural limits the readiness checklist enforces. */
export const LIMITS = {
  responsibilities: { min: 3, max: 8 },
  mustHaves: { min: 3, max: 6 },
  goodToHaves: { min: 0, max: 4 },
  screeningQuestions: { min: 3, max: 7 },
  skillsPerQuestion: { min: 1, max: 2 },
  wordLimit: { min: 30, max: 300 },
  interviewQuestions: { min: 3, max: 6 },
} as const
