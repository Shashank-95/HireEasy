import { LIMITS, type RoleSpec } from './types'

/**
 * Checks a role before any candidate is screened against it. A `block` stops
 * screening; a `warn` is shown but allowed. Every issue says how to fix it,
 * because the person reading it is a recruiter, not an engineer.
 */
export interface ReadinessIssue {
  severity: 'block' | 'warn'
  section: string
  message: string
  fix: string
}

/**
 * forTemplate: budget and interviewer emails are filled in per role, so on a
 * template they are reminders, not blockers.
 */
export function checkReadiness(spec: RoleSpec, opts: { forTemplate?: boolean } = {}): ReadinessIssue[] {
  const issues: ReadinessIssue[] = []
  const perRole = (message: string, fix: string, section: string) =>
    opts.forTemplate ? add('warn', section, message, `Set this on each role made from the template. (${fix})`) : add('block', section, message, fix)
  const add = (severity: ReadinessIssue['severity'], section: string, message: string, fix: string) =>
    issues.push({ severity, section, message, fix })

  // Basics
  if (!spec.basics.title.trim()) add('block', 'Basics', 'The role has no title.', 'Add a job title.')

  // Eligibility numbers HR must enter themselves
  const { budget, experience, notice, location } = spec.eligibility
  if (budget.enabled && budget.fixedLpa + budget.variableLpa <= 0) {
    perRole('Budget check is on but no budget is entered.', 'Enter the fixed (and variable) pay in LPA, or turn the budget check off.', 'Eligibility')
  }
  if (budget.enabled && budget.compareAgainst === 'fixed' && budget.fixedLpa <= 0) {
    perRole('Budget compares against fixed pay, but fixed pay is 0.', 'Enter the fixed pay, or compare against total CTC.', 'Eligibility')
  }
  if (experience.enabled && experience.maxYears !== null && experience.maxYears < experience.minYears) {
    add('block', 'Eligibility', 'Experience maximum is below the minimum.', 'Fix the experience range.')
  }
  if (notice.enabled && notice.maxDays <= 0) {
    add('warn', 'Eligibility', 'Notice period limit is 0 days — only immediate joiners will pass.', 'Confirm this, or raise the limit.')
  }
  if (location.enabled && location.allowed.length === 0) {
    add('block', 'Eligibility', 'Location check is on but no locations are listed.', 'Add accepted locations, or turn the check off.')
  }

  // Responsibilities
  const bullets = spec.responsibilities.reduce((n, r) => n + r.bullets.filter(b => b.trim()).length, 0)
  if (bullets < LIMITS.responsibilities.min || bullets > LIMITS.responsibilities.max) {
    add('warn', 'Responsibilities', `${bullets} responsibility bullets — aim for ${LIMITS.responsibilities.min}–${LIMITS.responsibilities.max}.`, 'Keep the ones that describe the actual work; merge the rest.')
  }

  // Must-haves: right number, and every one observable somewhere
  const must = spec.mustHaves
  if (must.length < LIMITS.mustHaves.min) {
    add('block', 'Must-haves', `Only ${must.length} must-have skill(s).`, `List ${LIMITS.mustHaves.min}–${LIMITS.mustHaves.max} skills the role cannot do without.`)
  } else if (must.length > LIMITS.mustHaves.max) {
    add('warn', 'Must-haves', `${must.length} must-haves dilute the score — each one counts for less.`, `Keep the ${LIMITS.mustHaves.max} that matter most; move the rest to good-to-have.`)
  }
  if (spec.goodToHaves.length > LIMITS.goodToHaves.max) {
    add('warn', 'Good-to-haves', `${spec.goodToHaves.length} good-to-haves — aim for at most ${LIMITS.goodToHaves.max}.`, 'Remove the least important.')
  }

  const questions = spec.screeningQuestions
  const testedByQuestions = new Set(questions.flatMap(q => q.skillIds))
  for (const s of [...must, ...spec.goodToHaves]) {
    if (s.assessedBy.length === 0) {
      add('block', 'Must-haves', `"${s.name}" isn't checked anywhere, so every candidate would score the same on it.`, 'Choose where it is assessed: a screening question, the resume, or the interview.')
    } else if (s.assessedBy.includes('screening') && !testedByQuestions.has(s.id)) {
      add('block', 'Screening questions', `"${s.name}" is marked as screened, but no screening question tests it.`, `Link a question to "${s.name}", or assess it from the resume or interview instead.`)
    }
    if (s.assessedBy.includes('interview') && !spec.interviewRounds.some(r => r.kind === 'ai' && r.questions.some(q => q.skillIds.includes(s.id)))) {
      add('warn', 'Interview rounds', `"${s.name}" is marked for the interview, but no interview question covers it yet.`, `Add an interview question for "${s.name}".`)
    }
  }

  // Screening questions
  if (questions.length < LIMITS.screeningQuestions.min || questions.length > LIMITS.screeningQuestions.max) {
    add(questions.length === 0 ? 'block' : 'warn', 'Screening questions', `${questions.length} screening question(s) — aim for ${LIMITS.screeningQuestions.min}–${LIMITS.screeningQuestions.max}.`, 'Fewer, sharper questions are scored more consistently.')
  }
  const skillIds = new Set([...must, ...spec.goodToHaves].map(s => s.id))
  questions.forEach((q, i) => {
    const label = `Question ${i + 1}`
    if (q.skillIds.length < LIMITS.skillsPerQuestion.min) {
      add('block', 'Screening questions', `${label} doesn't test any skill.`, 'Link it to the skill it reveals, or remove it.')
    } else if (q.skillIds.length > LIMITS.skillsPerQuestion.max) {
      add('warn', 'Screening questions', `${label} tests ${q.skillIds.length} skills — answers get scored loosely.`, `Link it to the ${LIMITS.skillsPerQuestion.max} skills it reveals best.`)
    }
    for (const id of q.skillIds) {
      if (!skillIds.has(id)) add('block', 'Screening questions', `${label} links to a skill that no longer exists.`, 'Re-link it to a current skill.')
    }
    const empty = ([1, 3, 5] as const).filter(k => !q.rubric[k].trim())
    if (empty.length) {
      add('block', 'Screening questions', `${label} has no answer key for score ${empty.join(', ')}.`, 'Describe what a weak (1), average (3) and strong (5) answer looks like — or let the AI draft it and edit.')
    }
    if (q.wordLimit < LIMITS.wordLimit.min || q.wordLimit > LIMITS.wordLimit.max) {
      add('warn', 'Screening questions', `${label} has a ${q.wordLimit}-word limit.`, `Use ${LIMITS.wordLimit.min}–${LIMITS.wordLimit.max} words.`)
    }
  })

  // Screening advance rule
  if (spec.screeningAdvance.maxAdvance < 1) {
    add('block', 'Interview plan', 'Screening advances nobody.', 'Set how many candidates can move to the first round.')
  }

  // Interview plan
  const rounds = spec.interviewRounds
  if (rounds.length === 0) {
    add('block', 'Interview plan', 'There are no interview rounds.', 'Add at least one round — AI or with a person.')
  }
  if (rounds.length > 0 && !rounds.some(r => r.kind === 'human')) {
    add('warn', 'Interview plan', 'No round is taken by a person, so nobody meets candidates before a decision.', 'Add a final round with the hiring manager, or confirm this is intended.')
  }
  rounds.forEach((r, ri) => {
    const label = `Round ${ri + 1} (${r.name})`
    if (r.kind === 'human') {
      if (r.interviewerEmails.filter(e => /\S+@\S+\.\S+/.test(e)).length === 0) {
        perRole(`${label} has no interviewer email.`, 'Add the email of the person taking this round — the Meet invite goes to them.', 'Interview plan')
      }
      return
    }
    if (r.questions.length < LIMITS.interviewQuestions.min || r.questions.length > LIMITS.interviewQuestions.max) {
      add(r.questions.length === 0 ? 'block' : 'warn', 'Interview plan', `${label} has ${r.questions.length} question(s) — aim for ${LIMITS.interviewQuestions.min}–${LIMITS.interviewQuestions.max}.`, 'Too few gives a thin signal; too many tires candidates.')
    }
    r.questions.forEach((q, i) => {
      if (([1, 3, 5] as const).some(k => !q.rubric[k].trim())) {
        add('block', 'Interview plan', `${label}, question ${i + 1} has an incomplete answer key.`, 'Fill in what a 1, 3 and 5 answer sounds like.')
      }
      if (q.skillIds.length === 0) {
        add('warn', 'Interview plan', `${label}, question ${i + 1} isn't linked to a skill.`, 'Link it to the skill it reveals so its score counts toward that skill.')
      }
    })
    if (r.reminderHoursBefore >= r.deadlineHours) {
      add('warn', 'Interview plan', `${label}: the reminder is set to go out before the invite itself.`, 'Make the reminder shorter than the deadline.')
    }
  })

  return issues
}

export const isReady = (spec: RoleSpec) => !checkReadiness(spec).some(i => i.severity === 'block')
