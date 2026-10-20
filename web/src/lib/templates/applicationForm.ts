import type { RoleSpec } from './types'
import type { Field } from '../import/mapping'

/**
 * The standard application form HR builds in Typeform (or any form tool).
 * Each field uses the form tool's own validation — a number field cannot
 * hold "As per company norms" — so bad values are stopped at the source
 * instead of being guessed at later.
 */
export interface FormField {
  /** Exact question text to use — imports map these headers automatically */
  label: string
  /** Typeform field type to choose */
  type: 'Short text' | 'Long text' | 'Email' | 'Phone number' | 'Number' | 'Dropdown' | 'Website' | 'File upload'
  required: boolean
  /** Settings to apply in the form tool */
  settings?: string
  /** Helper text shown to the candidate under the question */
  helpText?: string
  /** Which HireEasy field this fills */
  field?: Field
}

export const NOTICE_OPTIONS = ['Immediate', 'Up to 15 days', '16–30 days', '31–60 days', '61–90 days', 'More than 90 days']

export const STANDARD_FIELDS: FormField[] = [
  { label: 'Full name', type: 'Short text', required: true, field: 'name' },
  { label: 'Email', type: 'Email', required: true, field: 'email' },
  { label: 'Phone number', type: 'Phone number', required: true, settings: 'Default country: India', field: 'phone' },
  { label: 'Current city and country', type: 'Short text', required: true, helpText: 'For example: Pune, India', field: 'location' },
  {
    label: 'Total full-time work experience (years)',
    type: 'Number',
    required: true,
    settings: 'Min 0, max 40, allow decimals',
    helpText: 'Full-time roles only — do not count internships. Enter 0 if you are a fresher. Example: 1.5',
    field: 'experience',
  },
  { label: 'College or university', type: 'Short text', required: true, helpText: 'Full name, for example: Indian Institute of Management Ahmedabad', field: 'education' },
  { label: 'Degree and specialisation', type: 'Short text', required: true, helpText: 'For example: MBA, Marketing', field: 'degree' },
  { label: 'Graduation year', type: 'Number', required: true, settings: 'Min 1980, max 2035', field: 'graduationYear' },
  { label: 'Current company', type: 'Short text', required: false, helpText: 'Leave blank if not currently employed', field: 'currentCompany' },
  {
    label: 'Current annual CTC (in rupees)',
    type: 'Number',
    required: true,
    settings: 'Min 0, no decimals',
    helpText: 'Full amount, digits only. Example: 800000 for 8 LPA. Enter 0 if you are not earning.',
    field: 'currentSalary',
  },
  {
    label: 'Expected annual CTC (in rupees)',
    type: 'Number',
    required: true,
    settings: 'Min 0, no decimals',
    helpText: 'Full amount, digits only. Example: 1200000 for 12 LPA.',
    field: 'expectedSalary',
  },
  { label: 'Notice period', type: 'Dropdown', required: true, settings: `Options: ${NOTICE_OPTIONS.join(' / ')}`, field: 'notice' },
  { label: 'LinkedIn or portfolio link', type: 'Website', required: false, field: 'profileLink' },
  { label: 'Upload your resume', type: 'File upload', required: true, settings: 'PDF only, max 10 MB', field: 'resume' },
]

/** The full form for a role: standard fields, then its screening questions. */
export function applicationFormFor(spec: RoleSpec): FormField[] {
  const questions: FormField[] = spec.screeningQuestions.map(q => ({
    label: q.text,
    type: 'Long text',
    required: true,
    settings: `Max characters: ${Math.round(q.wordLimit * 7)}`,
    helpText: `Answer in ${q.wordLimit} words or fewer. Write in your own words — answers copied from AI tools are flagged.`,
  }))
  return [...STANDARD_FIELDS, ...questions]
}
