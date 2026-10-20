import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Badge, Card, PageHeader } from '@/components/ui'

export const metadata: Metadata = { title: 'How HireEasy works' }

/**
 * The guide for anyone opening HireEasy for the first time: why it exists,
 * the one-time setup, then a role from start to hire. Each step can carry a
 * screenshot (public/guide/*.jpg) or a short video (public/guide/*.mp4).
 */

type Step = { id: string; title: string; who?: string; body: ReactNode; shot?: { src: string; alt: string }; video?: string }

const SECTIONS = [
  { id: 'why', label: 'Why HireEasy' },
  { id: 'flow', label: 'The flow' },
  { id: 'setup', label: 'One-time setup' },
  { id: 'role', label: 'Running a role' },
  { id: 'candidate', label: 'What candidates see' },
  { id: 'daily', label: 'Day to day' },
  { id: 'people', label: 'Who can do what' },
  { id: 'limits', label: 'Limits and tips' },
]

const PROBLEMS = [
  { problem: 'Hundreds of applications, read one by one', fix: 'Every answer and resume is read and scored the same way, with the reason written next to the score.' },
  { problem: 'Screening calls that repeat the same questions', fix: 'Shortlisted candidates do a spoken AI interview on their own time; you get scores, a summary, the transcript and the recording.' },
  { problem: 'Decisions nobody can explain later', fix: 'Every move — by the AI or a person — is logged with its reason, and Ask HireEasy answers “why” from those records.' },
  { problem: 'Emails, reminders and invites done by hand', fix: 'Invites, reminders, Meet bookings and “not moving forward” emails go out from your Gmail, with a test mode to try everything safely.' },
]

const STAGES: { name: string; how: string; auto: boolean }[] = [
  { name: 'Eligibility', how: 'Budget, experience, notice period and location checked against the role', auto: true },
  { name: 'Answer screening', how: 'Application answers scored against your answer keys', auto: true },
  { name: 'Resume check', how: 'Resume read for the must-have skills', auto: true },
  { name: 'Shortlist', how: 'You apply the cut (or autopilot does, once calibrated)', auto: false },
  { name: 'AI interview rounds', how: 'Invite, reminder, spoken interview and scoring', auto: true },
  { name: 'Round with a person', how: 'You pick a time; Google Meet invite goes out; you record the outcome', auto: false },
  { name: 'Hired', how: 'Moving forward from the last round marks them hired', auto: false },
]

const SETUP: Step[] = [
  {
    id: 'setup-account',
    title: 'Sign in and set up your team',
    who: 'Admin',
    body: (
      <>
        <p>Everyone creates their own account on the sign-in page (<b>Create account</b>). An admin then gives each person a role in <b>Settings → Team</b>: <b>Admin</b>, <b>HR</b> or <b>Hiring manager</b>.</p>
        <p>Hiring managers only see roles they are added to (each role’s <b>Setup → Hiring team</b>), so add them after they have an account.</p>
      </>
    ),
  },
  {
    id: 'setup-company',
    title: 'Company details and test mode',
    who: 'HR',
    shot: { src: '/guide/settings.jpg', alt: 'Settings page with company details, test mode, Google and AI cards' },
    body: (
      <>
        <p>In <Link href="/settings" className="text-accent-text underline">Settings</Link>, fill in <b>Company name</b>, <b>About the company</b> (shown at the top of every job description) and <b>Emails are signed by</b> (for example “Priya, Talent team”).</p>
        <p>Keep <b>Test mode</b> on until you have tried the whole flow. While it is on, every candidate email and calendar invite goes to the <b>Test email address</b> instead, with the real recipient in the subject: <code>[TEST → candidate@email]</code>. The yellow badge in the sidebar reminds you it is on.</p>
      </>
    ),
  },
  {
    id: 'setup-google',
    title: 'Connect Google (email and Meet)',
    who: 'HR',
    body: (
      <>
        <p>HireEasy sends email from your Gmail and books interviews with Google Meet. Click <b>Connect Google</b> in Settings, choose the account that should send, and allow both permissions. Only “send email” and “calendar events” are requested — HireEasy can’t read your mail.</p>
        <p>The first time, someone with server access creates a Google OAuth client (the exact steps are shown in Settings until it is done). While that Google app is in <b>Testing</b>, the connection lasts 7 days — click <b>Reconnect</b> when Settings or the Emails tab says it expired.</p>
      </>
    ),
  },
  {
    id: 'setup-ai',
    title: 'Check the AI keys',
    who: 'Server',
    body: (
      <p>The <b>AI</b> card in Settings shows <Badge tone="success">Connected</Badge> for <b>Gemini</b> (screening, resumes, interview scoring) and <b>Groq</b> (second opinions, follow-up questions, transcription). Both are free tiers; the keys live on the server (GEMINI_API_KEY, GROQ_API_KEY). If one says Missing, ask whoever runs the server to add it.</p>
    ),
  },
  {
    id: 'setup-emails',
    title: 'Review the emails candidates get',
    who: 'HR',
    body: (
      <p>Under <b>Emails to candidates</b> in Settings you can edit the subject and message of each email — the AI interview invitation, the reminder, the interview with the hiring team, and “not moving forward”. <b>Preview</b> shows it filled in; <b>Reset to default</b> undoes your edits. Words in <code>{'{{double braces}}'}</code> are filled in for each candidate.</p>
    ),
  },
  {
    id: 'setup-templates',
    title: 'Pick or build a template',
    who: 'HR',
    shot: { src: '/guide/templates.jpg', alt: 'Templates page with two templates and the New template form' },
    body: (
      <>
        <p>A template is the structure for a kind of role you hire for repeatedly: responsibilities, must-have skills and where each is checked, screening questions with answer keys (what a 1, 3 and 5 answer looks like), eligibility limits and the interview plan (AI rounds and rounds with a person).</p>
        <p>Start from <b>Product — Associate Product Manager</b> or create a new one (<b>Templates → New template</b>, blank or a copy). A role takes its own copy, so changing a template only affects roles created later. Badges like <Badge tone="warn">3 to finish</Badge> show what is still missing.</p>
      </>
    ),
  },
]

const ROLE: Step[] = [
  {
    id: 'role-create',
    title: 'Create the role',
    shot: { src: '/guide/new-role.jpg', alt: 'New role page with template cards and job title' },
    body: <p>On <b>Roles</b>, click <b>New role</b>, pick the closest template, set the <b>Job title</b> candidates will see and, if you have one, paste the original job description. Click <b>Create role and continue to setup</b>.</p>,
  },
  {
    id: 'role-setup',
    title: 'Finish setup',
    shot: { src: '/guide/role-setup.jpg', alt: 'Role Setup tab with changes from the JD and the application form fields' },
    body: (
      <>
        <p>The <b>Setup</b> tab shows what was changed from your JD and why, the exact <b>Application form</b> fields to build (in Typeform or similar — the screening questions must be on it), the <b>Hiring team</b>, and the full role: budget, experience, skills, questions, answer keys and interview rounds.</p>
        <p>Add the interviewer’s email to every round with a person. A red number on the tab means something blocks going live; the checklist on the right says what.</p>
      </>
    ),
  },
  {
    id: 'role-import',
    title: 'Add applications',
    shot: { src: '/guide/applicants.jpg', alt: 'Applicants tab with stages, statuses, scores and reasons' },
    body: (
      <>
        <p>On <b>Applicants</b>, click <b>Add or refresh applications</b>. Paste a Google Sheet link (shared as “Anyone with the link can view”) or upload a CSV. Check the column matches, link each screening question to its column, then <b>Import</b>.</p>
        <p>Run it again whenever new applications come in: repeat applications are merged by email and phone, and earlier decisions are kept. Anything the import had to interpret (like “12 LPA” or “15–30 days”) is listed under <b>What we changed in the data</b>.</p>
      </>
    ),
  },
  {
    id: 'role-live',
    title: 'Go live and let it work',
    shot: { src: '/guide/role-overview.jpg', alt: 'Role Overview with pipeline counts, processing card and the getting-started checklist' },
    body: (
      <>
        <p>Click <b>Go live</b>. The <b>Overview</b> shows where everyone is, the <b>Getting this role running</b> checklist, and the <b>Processing</b> card. Once deployed, processing runs every minute on its own; on your own computer, click <b>Run now</b> or tick <b>Keep running</b>.</p>
        <p>It works in small batches to stay inside the free AI limits. When a daily limit is used up the role simply waits and says when it continues — nothing is lost. <b>Pause role</b> stops everything for that role.</p>
      </>
    ),
  },
  {
    id: 'role-review',
    title: 'Check the ones that need a look',
    body: (
      <p>Some applicants can’t be decided automatically — a salary that could be monthly or yearly, a resume that couldn’t be opened, an answer that looks pasted from ChatGPT. They show as <Badge tone="warn">Needs a look</Badge> with the reason. Open one and choose <b>Restore</b>, <b>Approve and move on</b>, <b>Guarantee a place</b> or <b>Stop</b>, with a short reason that is saved in the history.</p>
    ),
  },
  {
    id: 'role-calibrate',
    title: 'Calibrate once (to unlock autopilot)',
    shot: { src: '/guide/calibration.jpg', alt: 'Calibration tab with labelling progress and agreement score' },
    body: (
      <>
        <p>Before you let the AI shortlist on its own, check it agrees with you. On <b>Calibration</b>, click <b>Start calibration</b> (needs at least 10 screened applicants). You label a sample of about 40 as <b>Strong</b>, <b>Possible</b> or <b>Not a fit</b> without seeing names, colleges or AI scores.</p>
        <p>Some of the sample is held back to test agreement. At 80% or more, click <b>Lock answer keys and unlock autopilot</b>. If it is lower, look at the disagreements, sharpen the answer keys in Setup and re-score.</p>
      </>
    ),
  },
  {
    id: 'role-cut',
    title: 'Apply the shortlist and run the AI interviews',
    shot: { src: '/guide/interviews.jpg', alt: 'Interviews tab with screening shortlist and AI round counts' },
    body: (
      <>
        <p>When screening is done you get an Inbox note. On <b>Interviews</b>, the shortlist preview shows who would move on, who is waitlisted (above the bar but over the limit) and who is below the bar. Click <b>Apply cut</b> to send the AI interview invitations. With <b>autopilot</b> on, this happens by itself.</p>
        <p>Each AI round shows invited, in progress, completed and expired. Candidates get a reminder before the deadline. Use <b>Try this interview</b> to take it yourself — it is never scored.</p>
      </>
    ),
  },
  {
    id: 'role-human',
    title: 'Schedule the round with a person',
    body: (
      <>
        <p>Candidates who clear the AI rounds appear under the round with a person, and the Inbox tells you. Agree a time with the interviewer and candidate, pick it, and click <b>Schedule</b>. HireEasy creates a Google Calendar event with a Meet link and emails the candidate.</p>
        <p>After the interview, click <b>Record outcome</b>, add notes and choose <b>Move forward</b> or <b>Not proceeding</b>. Moving forward from the last round marks the candidate <Badge tone="success">Hired</Badge>.</p>
      </>
    ),
  },
  {
    id: 'role-report',
    title: 'Compare finalists',
    shot: { src: '/guide/report.jpg', alt: 'Shortlist report with finalists side by side' },
    body: <p><b>Shortlist report</b> puts finalists side by side with every score, pay expectation, experience, notice and location. Open a candidate for the full transcript, recordings and per-question scores. <b>Download all applicants</b> and <b>Download every decision</b> give you CSVs.</p>,
  },
  {
    id: 'role-emails',
    title: 'Check what was sent',
    shot: { src: '/guide/emails.jpg', alt: 'Emails tab listing sent emails with intended and actual recipients' },
    body: <p>The <b>Emails</b> tab lists every email for the role: who it was for, where it actually went (in test mode) and whether it was sent. Emails go out automatically; <b>Send now</b> sends anything waiting straight away and <b>Try again</b> resends a failed one. <b>Activity</b> is the full history of who did what and why.</p>,
  },
  {
    id: 'role-close',
    title: 'Close the role',
    shot: { src: '/guide/role-overview-2.jpg', alt: 'Close the role card on the Overview' },
    body: (
      <>
        <p>When the position is filled, click <b>Close role…</b> on the Overview. Unsent invites are cancelled, open interview links stop working, and booked Meet interviews are removed from the calendar (Google tells the attendees).</p>
        <p>Tick the box to send the <b>“not moving forward”</b> email to everyone who wasn’t hired — this is the only time it is sent, so candidates aren’t rejected mid-process. The role becomes read-only and its history stays.</p>
      </>
    ),
  },
]

const CANDIDATE: Step[] = [
  {
    id: 'candidate-interview',
    title: 'The AI interview',
    shot: { src: '/guide/candidate-interview.jpg', alt: 'Candidate interview start screen' },
    body: (
      <>
        <p>The invitation email has a private link. The candidate agrees to recording, tests their microphone, and answers each question out loud. Questions are read aloud and shown on screen; the timer starts only when they press <b>Start answering</b>. There may be a short follow-up.</p>
        <p>They can leave and come back before the deadline (72 hours by default) — finished answers are saved. Expired, completed or cancelled links show a clear message instead.</p>
      </>
    ),
  },
  {
    id: 'candidate-emails',
    title: 'The emails they get',
    body: (
      <ul className="list-disc space-y-1 pl-5">
        <li><b>AI interview invitation</b> — when they enter an AI round.</li>
        <li><b>AI interview reminder</b> — before the deadline if they haven’t finished (24 hours by default).</li>
        <li><b>Interview with the hiring team</b> — when you schedule a round with a person, plus Google’s calendar invite with the Meet link.</li>
        <li><b>Not moving forward</b> — only when you close the role with that box ticked.</li>
      </ul>
    ),
  },
]

const DAILY: Step[] = [
  {
    id: 'daily-inbox',
    title: 'Inbox',
    shot: { src: '/guide/inbox.jpg', alt: 'Inbox with a ready-to-shortlist note' },
    body: <p>Anything that needs a person — a shortlist ready to apply, candidates ready for a round with you — shows up here with a link straight to it.</p>,
  },
  {
    id: 'daily-ask',
    title: 'Ask HireEasy',
    shot: { src: '/guide/ask.jpg', alt: 'Ask HireEasy chat with suggested questions' },
    body: <p>Ask in plain words: “What needs my attention?”, “Why was Priya rejected for APM?”, “Who is ready for the final round?”. Answers come only from HireEasy’s records, link to where you can check them, and only cover roles you can see. It reads; it never changes anything. The <b>Ask</b> button inside a role asks about that role or candidate.</p>,
  },
]

function Shot({ src, alt }: { src: string; alt: string }) {
  return (
    <a href={src} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-line bg-surface-2 transition-opacity hover:opacity-90" title="Open full size">
      <Image src={src} alt={alt} width={1460} height={792} sizes="(min-width: 1024px) 560px, 100vw" className="h-auto w-full" />
    </a>
  )
}

function StepCard({ step, n }: { step: Step; n: number }) {
  const media = step.video ? (
    <video src={step.video} controls preload="metadata" className="w-full rounded-lg border border-line" />
  ) : step.shot ? (
    <Shot {...step.shot} />
  ) : null
  return (
    <Card id={step.id} className="scroll-mt-20 p-5">
      <div className={media ? 'grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-start' : ''}>
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[12px] font-semibold text-accent-text">{n}</span>
            <h3 className="font-semibold text-ink">{step.title}</h3>
            {step.who && <Badge>{step.who}</Badge>}
          </div>
          <div className="space-y-2 text-[14px] leading-relaxed text-muted [&_b]:font-medium [&_b]:text-ink [&_code]:whitespace-nowrap [&_code]:rounded [&_code]:bg-surface-2 [&_code]:px-1 [&_code]:text-[12.5px]">{step.body}</div>
        </div>
        {media}
      </div>
    </Card>
  )
}

function Section({ id, title, intro, children }: { id: string; title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20">
      <h2 className="text-lg font-semibold tracking-tight text-ink">{title}</h2>
      {intro && <p className="mt-1 max-w-3xl text-[14px] text-muted">{intro}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  )
}

const Steps = ({ steps }: { steps: Step[] }) => <>{steps.map((s, i) => <StepCard key={s.id} step={s} n={i + 1} />)}</>

export default function GuidePage() {
  return (
    <>
      <PageHeader title="How HireEasy works" description="What it does, the one-time setup, and a role from first application to hire. Read it once; come back to any step." />

      <nav aria-label="Guide sections" className="-mx-1 mb-8 flex flex-wrap gap-1.5">
        {SECTIONS.map(s => (
          <a key={s.id} href={`#${s.id}`} className="rounded-full border border-line bg-surface px-3 py-1 text-[13px] text-muted hover:border-accent hover:text-ink">{s.label}</a>
        ))}
      </nav>

      <div className="space-y-12">
        <Section id="why" title="Why HireEasy" intro="It runs the first rounds of hiring for you — screening, shortlists and AI interviews — and hands over when it is time for a person. Everything it decides comes with a reason you can check and override.">
          <div className="grid gap-3 sm:grid-cols-2">
            {PROBLEMS.map(p => (
              <Card key={p.problem} className="p-4">
                <p className="text-[13px] text-faint line-through decoration-faint/60">{p.problem}</p>
                <p className="mt-1.5 text-[14px] text-ink">{p.fix}</p>
              </Card>
            ))}
          </div>
        </Section>

        <Section id="flow" title="The flow at a glance" intro="Every applicant moves through the same stages. Automatic steps run on their own while the role is live; the others wait for you (or for autopilot, once you have calibrated).">
          <Card className="divide-y divide-line">
            {STAGES.map((s, i) => (
              <div key={s.name} className="flex items-start gap-3 px-5 py-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[12px] font-semibold text-muted">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium text-ink">{s.name}</p>
                  <p className="text-[13px] text-muted">{s.how}</p>
                </div>
                <Badge tone={s.auto ? 'success' : 'info'} className="shrink-0">{s.auto ? 'Automatic' : 'You'}</Badge>
              </div>
            ))}
          </Card>
        </Section>

        <Section id="setup" title="One-time setup" intro="Done once for the whole company, usually by an admin or HR. The badge on each step says who.">
          <Steps steps={SETUP} />
        </Section>

        <Section id="role" title="Running a role" intro="The same steps for every opening. The Overview checklist tracks where you are.">
          <Steps steps={ROLE} />
        </Section>

        <Section id="candidate" title="What candidates see">
          <Steps steps={CANDIDATE} />
        </Section>

        <Section id="daily" title="Day to day">
          <Steps steps={DAILY} />
        </Section>

        <Section id="people" title="Who can do what">
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-[13px]">
              <thead className="text-faint">
                <tr className="border-b border-line">
                  <th className="px-5 py-2.5 font-medium">Can…</th>
                  <th className="px-3 py-2.5 font-medium">Admin</th>
                  <th className="px-3 py-2.5 font-medium">HR</th>
                  <th className="px-3 py-2.5 font-medium">Hiring manager</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-muted">
                {[
                  ['See roles', 'All', 'All', 'Roles they are added to'],
                  ['Create roles, go live, pause, close', '✓', '✓', '—'],
                  ['Schedule interviews with a person', '✓', '✓', '—'],
                  ['Review applicants, label for calibration, apply a shortlist, record interview outcomes', '✓', '✓', '✓'],
                  ['Lock calibration, turn autopilot on', '✓', '✓', '— (can turn it off)'],
                  ['Create and edit templates', '✓', '✓', 'View only'],
                  ['Change Settings, connect Google', '✓', '✓', 'View only'],
                  ['Change people’s roles', '✓', '—', '—'],
                ].map(r => (
                  <tr key={r[0]}>
                    <td className="px-5 py-2.5 text-ink">{r[0]}</td>
                    <td className="px-3 py-2.5">{r[1]}</td>
                    <td className="px-3 py-2.5">{r[2]}</td>
                    <td className="px-3 py-2.5">{r[3]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </Section>

        <Section id="limits" title="Limits and tips">
          <Card className="p-5">
            <ul className="list-disc space-y-2 pl-5 text-[14px] leading-relaxed text-muted [&_b]:font-medium [&_b]:text-ink">
              <li><b>Free AI limits.</b> Screening uses about 480 Gemini requests a day. Daily limits reset at midnight Pacific time — 12:30 pm IST (1:30 pm IST from November to March). Large roles take a few days; the Overview shows how much is used today.</li>
              <li><b>Gmail.</b> A personal Gmail account sends up to about 500 emails a day. Emails wait in the outbox and go out in order.</li>
              <li><b>Test mode first.</b> Run a small role end to end with test mode on, check the emails in the test inbox, then turn it off in Settings when you are ready for real candidates.</li>
              <li><b>Every decision can be changed.</b> Restore anyone with a reason; the history keeps both decisions.</li>
              <li><b>Changing answer keys</b> after calibration creates a new version of the role and asks you to check agreement again before autopilot carries on.</li>
              <li><b>Stuck?</b> Ask HireEasy “what needs my attention?”, or check the role’s Activity tab for the last thing that happened.</li>
            </ul>
          </Card>
        </Section>
      </div>
    </>
  )
}
