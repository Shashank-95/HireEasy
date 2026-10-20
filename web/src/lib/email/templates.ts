/**
 * Candidate emails. HR can edit every template in Settings; these are the
 * defaults. Variables in {{double braces}} are filled per candidate, and the
 * preview shows exactly what a candidate will receive.
 */
export const TEMPLATE_KEYS = ['ai_invite', 'ai_reminder', 'human_invite', 'rejection'] as const
export type TemplateKey = (typeof TEMPLATE_KEYS)[number]

export interface EmailTemplate {
  subject: string
  body: string
}

export const TEMPLATE_INFO: Record<TemplateKey, { label: string; when: string; variables: string[] }> = {
  ai_invite: {
    label: 'AI interview invitation',
    when: 'Sent automatically when a candidate moves into an AI interview round.',
    variables: ['candidate_name', 'role_title', 'company', 'round_name', 'interview_link', 'deadline', 'minutes', 'sender_name'],
  },
  ai_reminder: {
    label: 'AI interview reminder',
    when: 'Sent before the deadline to anyone who hasn\'t finished.',
    variables: ['candidate_name', 'role_title', 'company', 'round_name', 'interview_link', 'deadline', 'sender_name'],
  },
  human_invite: {
    label: 'Interview with the hiring team',
    when: 'Sent when HR schedules a round with a person. The Google Calendar invite with the Meet link is sent separately by Google.',
    variables: ['candidate_name', 'role_title', 'company', 'round_name', 'meeting_time', 'meet_link', 'interviewers', 'sender_name'],
  },
  rejection: {
    label: 'Not moving forward',
    when: 'Sent once, when the role is closed, to everyone who did not get an offer — only after you confirm.',
    variables: ['candidate_name', 'role_title', 'company', 'sender_name'],
  },
}

export const DEFAULT_TEMPLATES: Record<TemplateKey, EmailTemplate> = {
  ai_invite: {
    subject: '{{role_title}} at {{company}}: your next step',
    body: `Hi {{candidate_name}},

Thank you for applying for the {{role_title}} role at {{company}}. We enjoyed reading your application and would like you to take the next step: a short recorded interview ({{round_name}}).

It takes about {{minutes}} minutes. You'll hear each question read aloud and answer by speaking — there's no one on the other end, so take it whenever suits you before {{deadline}}.

Start your interview: {{interview_link}}

Before you begin: use Chrome or Safari on a laptop or phone, in a quiet place, and allow microphone access when asked.

Best,
{{sender_name}}`,
  },
  ai_reminder: {
    subject: 'Reminder: your {{role_title}} interview closes {{deadline}}',
    body: `Hi {{candidate_name}},

A quick reminder that your recorded interview for the {{role_title}} role at {{company}} closes on {{deadline}}.

Continue or start here: {{interview_link}}

Best,
{{sender_name}}`,
  },
  human_invite: {
    subject: '{{role_title}} at {{company}}: interview on {{meeting_time}}',
    body: `Hi {{candidate_name}},

Congratulations on getting through to {{round_name}} for the {{role_title}} role at {{company}}.

You'll meet {{interviewers}} on {{meeting_time}} over Google Meet: {{meet_link}}

A calendar invitation is on its way separately. If the time doesn't work, just reply to this email.

Best,
{{sender_name}}`,
  },
  rejection: {
    subject: 'Your application for {{role_title}} at {{company}}',
    body: `Hi {{candidate_name}},

Thank you for your interest in the {{role_title}} role at {{company}} and for the time you put into your application.

We've now completed the process and won't be moving forward with your application this time. We'll keep your details on file and may reach out about future roles that fit.

We wish you the very best.

{{sender_name}}`,
  },
}

export function render(t: EmailTemplate, vars: Record<string, string>): EmailTemplate {
  const fill = (s: string) => s.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => (k in vars ? vars[k] : m))
  return { subject: fill(t.subject).replace(/\s+/g, ' ').trim(), body: fill(t.body) }
}

/** Variables used in a template that don't exist — shown as a warning in the editor. */
export function unknownVariables(t: EmailTemplate, key: TemplateKey): string[] {
  const known = new Set(TEMPLATE_INFO[key].variables)
  return [...new Set([...`${t.subject}\n${t.body}`.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map(m => m[1]))].filter(v => !known.has(v))
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Plain text → simple, readable HTML. Links become clickable; nothing else is interpreted. */
export function toHtml(body: string): string {
  const html = esc(body)
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#4f46e5">$1</a>')
    .split(/\n{2,}/)
    .map(p => `<p style="margin:0 0 14px">${p.replace(/\n/g, '<br>')}</p>`)
    .join('')
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#16161d;max-width:560px">${html}</div>`
}
