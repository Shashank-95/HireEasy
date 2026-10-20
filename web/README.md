# HireEasy 2.0 — web app

The hosted HireEasy app (Next.js 16 + Supabase). See the [main README](../README.md) for what it does and full setup.

```bash
npm install
cp .env.example .env.local   # fill in the values
npm run dev                  # http://localhost:3000
npm test                     # unit + database-rule tests
```

- `src/app/` — pages, server actions and API routes (`api/cron/tick` advances every live role)
- `src/lib/` — parsing, eligibility, pipeline engine, AI providers and quota, email, Google, chat
- `supabase/migrations/` — run in order in the Supabase SQL editor
- `docs/qa/` — test plan and bug log
