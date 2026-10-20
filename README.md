# HireEasy

**Hiring on autopilot, until your final round.**

HireEasy takes a role from a sheet of applications to a hiring-manager-ready shortlist. It checks eligibility, scores written answers and resumes, runs AI voice interviews with follow-up questions, and books the final round on Google Meet. Every automated decision carries its reason, and a person can reverse it in one click.

It runs entirely on free AI tiers (Google Gemini and Groq).

> **HireEasy 2.0** is a hosted web app in [`web/`](web). The original desktop app (v1) is still in [`app/`](app) — see [Legacy desktop app](#legacy-desktop-app-v1).

---

## Why it exists

A recruiter screening 300 applications reads every form, opens every resume, emails every shortlisted candidate and repeats it for each round. Most of that is mechanical, and it's where good candidates get missed or scored inconsistently.

HireEasy does the mechanical part and leaves the judgement to people:

- **Humans set up the role once**, calibrate the AI against their own judgement, then step away until the round they take themselves.
- **The AI never decides alone where it's unsure.** Ambiguous salaries, unreadable resumes and borderline scores go to a person instead of being guessed.
- **Everything is explainable.** Each score quotes the candidate's own words, each decision records who made it (rules, AI or a named person) and why.

## How a role runs

1. **Set up the role** from a template: skills (High / Medium / Low), screening questions with answer keys, eligibility (budget, experience, notice, each with a tolerance), preferred colleges and the interview plan (any number of AI or human rounds).
2. **Import applications** from a Google Sheet link or a CSV. Columns map automatically, duplicates merge, and every value the tool reinterpreted is listed under *What we changed*.
3. **Eligibility** runs instantly with no AI: out-of-range candidates are excluded with the exact reason (restorable), unclear answers go to *Needs a look*.
4. **Screening** scores each answer against its answer key, element by element, and only counts evidence it can quote from the answer. Prompt-injection attempts and pasted ChatGPT output are flagged.
5. **Resume check** reads the PDF, works out real years of experience (so "2+ years" gets verified) and scores the resume-only skills.
6. **Calibration** — you label ~40 applicants blind; the tool shows how often the AI agrees with you. At 80%+ the answer keys lock and autopilot unlocks.
7. **AI interview rounds** — candidates get an emailed link, answer spoken questions, get one probing follow-up when an answer is thin, and are transcribed and scored per question. Reminders and deadlines run themselves.
8. **Shortlist** — each stage uses a score bar plus a maximum; the preview always matches the real cut. Overrides guarantee a place or stop someone, with a reason.
9. **Final round with a person** — HR picks a time; HireEasy creates the Google Calendar event with a Meet link and invites the hiring manager and candidate.
10. **Close the role** — unsent invites and booked meetings are cancelled, "not moving forward" emails go out once, and the role becomes a read-only record.

## Features

| | |
|---|---|
| **Autopilot** | Moves people between stages, sends invites and reminders, and notifies HR only when a person is needed |
| **Ask HireEasy** | A chat assistant over your hiring data: *"Why was Priya stopped?"*, *"Who's ready for the final round?"* It answers only from the records, quotes the recorded reason, asks which person you mean when names clash, and links every record it mentions |
| **Transparency** | Per-question scores with quotes, interview transcripts and recordings, a shortlist report, an activity log and CSV exports of every candidate and decision |
| **Test mode** | Every email goes to one test address (with the intended recipient in the subject) until you switch it off |
| **Roles and access** | HR and admins run roles; hiring managers see only the roles they're added to |
| **Free-tier aware** | Paces itself inside free AI limits, falls back across models, and tells you plainly when it will continue |
| **Mobile and dark mode** | Works on a phone, including the candidate interview |

## Tech stack

| Layer | Technology |
|---|---|
| App | Next.js 16 (App Router, server actions), React 19, TypeScript, Tailwind CSS 4 |
| Data | Supabase — Postgres with row-level security, Auth, private Storage for resumes and recordings |
| AI (free tiers) | Google Gemini (screening, resumes, interview scoring — with fallback models), Groq `gpt-oss-120b` / `gpt-oss-20b` (second opinions, follow-ups, chat), Groq Whisper (transcription), browser speech for reading questions aloud |
| Google | Gmail (sending) and Calendar with Meet (final rounds), via OAuth |
| Hosting | Vercel |
| Tests | Vitest — 500+ tests, including database access rules on an in-memory Postgres |

## Run it yourself

You need Node 20+, a free [Supabase](https://supabase.com) project, a free [Gemini key](https://aistudio.google.com/apikey) and a free [Groq key](https://console.groq.com/keys).

```bash
cd web
npm install
cp .env.example .env.local   # then fill in the values below
npm run dev                  # http://localhost:3000
```

| Variable | What it is |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | From your Supabase project's API settings |
| `GEMINI_API_KEY`, `GROQ_API_KEY` | Free AI keys |
| `APP_SECRET`, `CRON_SECRET` | Any long random strings |
| `NEXT_PUBLIC_APP_URL` | Where the app runs, e.g. `http://localhost:3000` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Optional — needed for sending email and booking Meet calls (setup steps are on the Settings page) |
| `AI_MODEL_CHAIN` | Optional — comma-separated Gemini models to try in order |

Then run the SQL files in [`web/supabase/migrations`](web/supabase/migrations) in order in Supabase's SQL editor. The first person to sign up becomes the admin.

To keep roles moving when nobody has the app open, call `GET /api/cron/tick` every minute with the header `Authorization: Bearer <CRON_SECRET>` (any scheduler works).

```bash
npm test          # unit and database-rule tests
npx tsc --noEmit  # type check
npm run build     # production build
```

## Repository

```
HireEasy/
├── web/            # HireEasy 2.0 — the web app (Next.js + Supabase)
│   ├── src/app/    # Pages, server actions and API routes
│   ├── src/lib/    # Parsing, eligibility, pipeline engine, AI, email, chat
│   ├── supabase/   # Database migrations and access-rule tests
│   └── docs/qa/    # Test plan and bug log from the QA passes
├── app/            # v1 desktop app (Electron)
└── interview-app/  # v1 audio interview app
```

## Legacy desktop app (v1)

The first version was an Electron desktop app with a separate interview app. Installers for Mac and Windows are on the [Releases page](https://github.com/Shashank-95/HireEasy/releases/latest) (v1.0.1). It is no longer developed; HireEasy 2.0 replaces it.

## License

MIT
