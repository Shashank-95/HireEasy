# HireEasy

AI-powered recruiting automation platform that streamlines the entire hiring pipeline — from candidate screening to interview scheduling.

## Features

- **Multi-Job Dashboard** — Manage multiple job openings with funnel analytics
- **Smart Sheet Parsing** — Auto-detect column headers from Google Sheets
- **AI-Powered Screening** — L1 (response analysis) and L2 (resume deep-dive) screening
- **AI Detection** — Flag candidates with AI-generated responses
- **Configurable Scoring** — Weighted rubrics for technical, non-technical, and behavioral skills
- **Automated Scheduling** — Gmail + Google Calendar integration for interview invites
- **Audio Interview App** — Vercel-deployed app for AI-conducted audio interviews
- **Interview Question Bank** — Save and reuse questions across roles
- **Export at Every Stage** — CSV/Excel downloads for audit trails
- **Conflict Detection** — Avoid scheduling overlaps
- **Structured Feedback** — Star-rating templates for interviewers

## Architecture

```
HireEasy/
├── app/                    # Electron + React + TypeScript (desktop app)
│   ├── electron/           # Main process (OAuth, system)
│   ├── src/                # React UI
│   ├── prisma/             # SQLite database schema
│   └── package.json
├── interview-app/          # Next.js (Vercel-deployed audio interviews)
│   ├── src/app/            # Pages
│   ├── src/components/     # Interview room UI
│   └── package.json
└── README.md
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop | Electron + Vite + React 18 |
| Language | TypeScript |
| Database | SQLite (Prisma ORM) |
| State | Zustand |
| UI | Tailwind CSS + Radix UI + Framer Motion |
| LLM | OpenAI / Anthropic Claude / Google Gemini (user chooses) |
| AI Detection | Sapling AI (free) / GPTZero / Originality.ai / Copyleaks |
| Speech-to-Text | Deepgram |
| Google APIs | Sheets, Gmail, Calendar (OAuth 2.0) |
| Interview App | Next.js 14 + Web Audio API |

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Setup — Main App

```bash
cd app
npm install
npx prisma generate
npx prisma migrate dev
npm run dev
```

### Setup — Interview App

```bash
cd interview-app
npm install
npm run dev
```

### Deploy Interview App

```bash
cd interview-app
npx vercel
```

## API Keys Required

All keys are entered through the in-app Settings panel (never hardcoded):

| Service | Purpose | How to Get |
|---------|---------|-----------|
| OpenAI / Claude / Gemini | Candidate screening & scoring | platform.openai.com / console.anthropic.com / aistudio.google.com |
| Google OAuth | Sheets, Gmail, Calendar access | console.cloud.google.com → Credentials |
| Deepgram | Audio transcription | console.deepgram.com |
| AI Detection (optional) | GPTZero / Originality.ai | respective provider sites |

## Workflow

1. **Create Job Opening** — Add title and department
2. **Import Candidates** — Paste Google Sheet URL with form responses
3. **Upload JD** — Upload job description PDF
4. **Configure Skills** — Set technical/non-technical skills with weights
5. **L1 Screening** — AI analyzes responses + detects AI-generated content
6. **Select Top N** — Choose how many candidates advance (top 5/10/25)
7. **L2 Screening** — Deep resume analysis against JD
8. **Final Shortlist** — Percentile-based cutoff (90th/75th/50th)
9. **Interview Setup** — Choose human or AI interview, configure questions
10. **Send Invites** — Gmail sends calendar events to shortlisted candidates
11. **Conduct Interviews** — Via Google Meet or the audio interview app
12. **Review Results** — Score, feedback, and final selection

## License

MIT
