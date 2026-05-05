# HireEasy

AI-powered recruiting automation platform that streamlines the entire hiring pipeline — from candidate screening to interview scheduling.

## Download & Install

### Mac (Apple Silicon — M1/M2/M3/M4)

1. Download **`HireEasy-1.0.0-arm64.dmg`** from [Releases](https://github.com/Shashank-95/HireEasy/releases/latest)
2. Open the `.dmg` file
3. Drag **HireEasy** into the **Applications** folder
4. Open **HireEasy** from Applications
5. **First launch only:** macOS will show _"HireEasy can't be opened because Apple cannot check it for malicious software"_. To fix this:
   - Open **System Settings > Privacy & Security**
   - Scroll down — you'll see _"HireEasy was blocked from use because it is not from an identified developer"_
   - Click **Open Anyway**
   - Or: right-click the app in Applications > click **Open** > click **Open** in the dialog

### Mac (Intel)

1. Download **`HireEasy-1.0.0.dmg`** from [Releases](https://github.com/Shashank-95/HireEasy/releases/latest)
2. Follow the same steps as above (steps 2-5)

### Windows

1. Download **`HireEasy-Setup-1.0.0.exe`** from [Releases](https://github.com/Shashank-95/HireEasy/releases/latest)
2. Run the installer — if Windows Defender SmartScreen shows a warning:
   - Click **More info**
   - Click **Run anyway**
3. Follow the installation wizard (you can choose the install location)
4. Launch **HireEasy** from the Start Menu or Desktop shortcut

### First-Time Setup (All Platforms)

After launching the app, go to **Settings** and configure:

1. **LLM Provider** — Add your API key for one of:
   - OpenAI (GPT-4o-mini) — [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
   - Google Gemini (free tier available) — [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
   - Anthropic Claude — [console.anthropic.com](https://console.anthropic.com)

2. **Google Integration** — For Sheets import, Gmail invites, and Calendar scheduling:
   - Create OAuth credentials at [console.cloud.google.com](https://console.cloud.google.com) > APIs & Services > Credentials
   - Enable: Google Sheets API, Gmail API, Google Calendar API
   - Add your Client ID and Client Secret in Settings
   - Add your email as a test user in the OAuth consent screen

3. **Interview App URL** — Set to your deployed interview app URL (see below)

## Features

- **Multi-Job Dashboard** — Manage multiple job openings with funnel analytics
- **Smart Sheet Parsing** — Auto-detect column headers from Google Sheets / Typeform
- **AI-Powered Screening** — L1 (response analysis) and L2 (resume deep-dive) screening
- **AI Detection** — Flag candidates with AI-generated responses (Sapling / GPTZero / Originality.ai)
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
│   ├── electron/           # Main process (OAuth, database, IPC)
│   ├── src/                # React UI (pages, components, stores)
│   ├── prisma/             # Database schema
│   └── package.json
├── interview-app/          # Next.js (Vercel-deployed audio interviews)
│   ├── src/app/            # Pages + API routes
│   ├── src/components/     # Interview room UI
│   └── package.json
└── README.md
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop | Electron + Vite + React 18 |
| Language | TypeScript |
| State | Zustand (persisted to localStorage + JSON DB) |
| UI | Tailwind CSS + Radix UI + Framer Motion |
| LLM | OpenAI / Anthropic Claude / Google Gemini (user chooses) |
| AI Detection | Sapling AI (free) / GPTZero / Originality.ai / Copyleaks |
| PDF Parsing | pdf.js (pdfjs-dist) |
| Speech-to-Text | Deepgram Nova-2 |
| Google APIs | Sheets, Gmail, Calendar (OAuth 2.0) |
| Interview App | Next.js 14 + Web Audio API + SpeechSynthesis |

## Deploy the Interview App

The interview app is a separate Next.js app that candidates use for AI-conducted audio interviews. Deploy it to Vercel:

```bash
cd interview-app
npm install
npx vercel --prod
```

Set the `DEEPGRAM_API_KEY` environment variable in Vercel for speech-to-text:

```bash
vercel env add DEEPGRAM_API_KEY
```

Then paste the deployed URL (e.g. `https://your-app.vercel.app`) into HireEasy Settings > Interview App URL.

## Development Setup

### Prerequisites

- Node.js 18+
- npm

### Main App (Desktop)

```bash
cd app
npm install
npm run dev        # Starts Vite + Electron in dev mode
```

### Interview App

```bash
cd interview-app
npm install
npm run dev        # Starts Next.js on port 3000
```

### Build Desktop App Locally

```bash
cd app
npx vite build
npx electron-builder --mac        # Mac DMG
npx electron-builder --win        # Windows installer (run on Windows)
```

## Workflow

1. **Create Job Opening** — Add title and department
2. **Import Candidates** — Paste Google Sheet URL with form responses
3. **Upload JD** — Upload job description PDF for context
4. **Configure Skills** — Set technical/non-technical skills with weights (must total 100%)
5. **L1 Screening** — AI analyzes responses + detects AI-generated content
6. **Select Top N** — Choose how many candidates advance
7. **L2 Screening** — Deep resume analysis against JD
8. **Final Shortlist** — Percentile-based cutoff
9. **Interview Setup** — Choose human or AI interview, configure questions
10. **Send Invites** — Gmail sends calendar events with interview links
11. **Conduct Interviews** — Via Google Meet or the audio interview app
12. **Review Results** — Score transcripts, provide feedback, make final selections

## License

MIT
