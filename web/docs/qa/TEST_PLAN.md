# HireEasy 2.0 — QA test plan

## Results — 20 Oct 2026 (2 rounds: code audits + hands-on browser QA)

| Area | Result | Notes |
|---|---|---|
| A. Automated gates | ✅ | 502 tests, typecheck, ESLint, production build, no secrets in the browser bundle |
| B. Auth and access | ✅ | HM sees only their roles (pages, exports, audio, Ask); HR-only controls hidden and refused server-side; branded 404s; bad interview links handled; wrong password keeps the email |
| C. Roles | ✅ | Create from template; go live; pause (HR only); close → read-only, invites cancelled, rejections queued, summary shown |
| D. Setup / templates | ✅ | Saves persist; comma lists and number boxes type naturally; versioning only on scoring changes; template reminders vs role blockers; no overlaps |
| E. Import | ✅ | CSV upload, mapping, 13.2 L/13.3 L edges, duplicates merged, re-import adds nobody, private-address and non-link errors |
| F. Eligibility | ✅ | Ambiguous / monthly salaries → Needs a look; "5" years from a years column excluded; restore with reason |
| G. Screening, resume, cut | ✅ | Injection flagged and scored 2/100; parallel screening; quota pauses explained; unreadable resumes go to a person; overrides; cut preview = real cut |
| H. Calibration, autopilot | ✅ | Blind labelling, per-applicant counting, small samples unlock the role only, autopilot re-locks when answer keys change |
| I. AI interviews | ✅ | Round 4: invite/reminder emails with working links; full interview via the API (transcription, follow-up, submit, playback); link states. Scoring of that run waits for Gemini's quota; real-microphone capture can't be automated |
| J. Emails, Google | ✅ | Live Gmail send (19 + 3 test-mode emails delivered), Meet booking, outcome, close-role cancels the Calendar event — round 3, G1–G4 |
| K. Reports, exports | ✅ | Shortlist report, CSV exports (formula-safe), activity log |
| L. Ask HireEasy | ✅ | Reasons quoted, wrong premises corrected, same-name choices, no invented people/pages/links, off-topic declined, honest limit messages |
| M. Design / UX | ✅ | 24 pages at 390 px with no overflow; light + dark; no console errors; aria-pressed; contrast fixed |

Every defect found is in [BUGLOG.md](BUGLOG.md) with its fix.

Status key: ☐ not run · ✅ pass · ❌ fail (bug id) · ⏭ blocked (reason)

Matrix for every UI case unless marked otherwise: **Desktop 1440 · Mobile 390** × **Dark · Light**, as **Admin/HR** and (where access differs) **Hiring manager (HM)**.

## A. Automated gates
| ID | Case |
|---|---|
| A1 | `vitest run` — all unit, parser, scoring, grounding, schema (PGlite) tests pass |
| A2 | `tsc --noEmit` clean |
| A3 | `eslint` clean (no errors) |
| A4 | `next build` succeeds (production compile, route types, no server/client boundary errors) |
| A5 | No secrets in source / client bundle (AI keys, service key, CRON_SECRET) |

## B. Auth and access
| ID | Case |
|---|---|
| B1 | Logged-out visit to any app page → redirected to /login; after login returns to app |
| B2 | Wrong password → clear error, no crash; empty fields → validation |
| B3 | Sign out ends session; back button doesn't show data |
| B4 | HM sees only roles they are a member of (list, direct URL, Ask, export, audio) |
| B5 | HM cannot run admin/HR-only actions (settings, user roles, template create, close role, go live) — UI hidden AND server action refuses |
| B6 | Direct URL to a non-existent role/candidate/template → 404 page, not a crash |
| B7 | API routes: /api/export, /api/audio, /api/chat reject unauthenticated requests; /api/cron/tick rejects missing/wrong secret |
| B8 | Interview link /i/[token]: invalid / expired / used token → friendly message; token can't read another session |

## C. Roles list and creation
| ID | Case |
|---|---|
| C1 | Roles list: empty state, cards show counts/status, links work |
| C2 | New role from template and from blank; title required; duplicate titles allowed but distinguishable |
| C3 | Role overview: pipeline counts reconcile with Applicants totals; "Getting running" steps reflect real state |
| C4 | Pause / resume role; paused role engine does nothing and says why |
| C5 | Close role: confirmation, counts, rejection emails queued (test mode), role read-only afterwards |

## D. Setup / template editor (SpecEditor)
| ID | Case |
|---|---|
| D1 | Every section edits and saves; reload shows saved values |
| D2 | Unsaved-changes warning on leave; Discard restores |
| D3 | Readiness checklist updates live; blocks Go live while blocking issues exist; template mode treats per-role fields as reminders |
| D4 | Numeric bounds: negative, huge, decimals, blank in budget/experience/notice/tolerance/score bar/max count/hours |
| D5 | Lists at limits: add/remove/reorder must-haves, questions, rounds; can't exceed LIMITS; delete last item |
| D6 | Locked version: editing answer keys on a live role creates a new version, history kept |
| D7 | Long text (5,000 chars), emoji, Hindi text, HTML/script text renders as text |
| D8 | Side column sticky/scroll, save bar, Ask button — no overlap at any size |

## E. Import
| ID | Case |
|---|---|
| E1 | Valid sheet link → preview → mapping auto-proposed → commit; counts (new/updated/merged/skipped) correct |
| E2 | Invalid link, private sheet, non-Google URL, empty sheet, wrong gid → clear error |
| E3 | Re-import same sheet → 0 new, updates only, decisions preserved |
| E4 | Mapping screen: change mapping, unmapped required field warning, noise columns ignored |
| E5 | "What we changed" log lists raw → standard value per change |
| E6 | Placeholder email/phone not used for dedupe; real duplicates merged |

## F. Eligibility
| ID | Case |
|---|---|
| F1 | 13.2 L passes, 13.3 L excluded (11 L + 20%); ambiguous salary → Needs a look, never auto-excluded |
| F2 | Experience "2+" → not excluded, verified from resume |
| F3 | Restore an excluded candidate → back in pipeline with decision row; exclude again |
| F4 | Counts excluded + review + pass = total |

## G. Screening, resume, cut
| ID | Case |
|---|---|
| G1 | Scores land 0–100 with per-question breakdown, quotes, element coverage |
| G2 | Quota/outage pause message is plain English; resumes on its own |
| G3 | Repeated AI failure → Needs a look after 3 tries |
| G4 | Resume stage reads PDF, computes years, flags mismatch; unreadable PDF handled |
| G5 | Cut only after everyone scored; bar ± borderline; cap → waitlist; override keeps |
| G6 | Human decision buttons: advance / reject / restore / hold with reason, appear in Activity and Ask |

## H. Calibration and autopilot
| ID | Case |
|---|---|
| H1 | Start calibration needs ≥10 scored; sample ~40 stratified; AI scores hidden while labelling |
| H2 | Label all → agreement + kappa shown; <80% doesn't unlock; ≥80% unlocks autopilot |
| H3 | Autopilot switch disabled until unlocked; explains why; pause works |

## I. AI interviews
| ID | Case |
|---|---|
| I1 | "Try this interview" preview: mic consent, question spoken + shown, record, follow-up, finish, score shown; preview never counts |
| I2 | Candidate link: consent, resume after refresh, can't reuse after submit, expiry message |
| I3 | No mic / denied permission / in-app browser → instructions |
| I4 | Silence → not transcribed as words; long answer cut at time limit |
| I5 | Results table, per-question summary, transcript, audio playback for HR and HM |

## J. Human rounds, emails, Google
| ID | Case |
|---|---|
| J1 | Human round reached → Inbox notification; scheduling form validates time |
| J2 | Without Google connected → clear "connect Google" guidance, nothing silently dropped |
| J3 | Emails page: queue, preview, test-mode redirect recorded (intended vs actual) |
| J4 | Settings: Google connect explains setup; test-mode toggle + address validation |
| J5 | ✅ Connect Google (OAuth) → Settings shows the connected account |
| J6 | ✅ Send now → outbox `sent`, delivered to the test address with "[TEST → original]" subject and the configured sender name |
| J7 | ✅ Schedule a human round → Calendar event with Meet link at the right IST time; invite email with the link; candidate invite goes to the test address |
| J8 | ✅ Record outcome → candidate moves on / hired; meeting done |
| J9 | ✅ Close role → booked Calendar events deleted (Google emails the cancellation), meetings cancelled, rejections sent to everyone not hired |

## K. Reports and exports
| ID | Case |
|---|---|
| K1 | Shortlist report empty state and populated |
| K2 | CSV candidates / decisions download, open correctly (commas, quotes, newlines, ₹, Hindi) |
| K3 | Activity log complete and ordered |

## L. Ask HireEasy
| ID | Case |
|---|---|
| L1 | Why was X rejected (exact reason, actor, date, link) |
| L2 | Wrong premise corrected |
| L3 | Ambiguous name → options; clicking an option answers |
| L4 | Non-existent person → "no candidate named …", no invention |
| L5 | Off-topic and prompt-injection ("ignore rules") → declines |
| L6 | Page context: role page and candidate page |
| L7 | HM can't get data from roles they can't access |
| L8 | Numbers/links verified; markdown renders; long answers scroll; new conversation clears |
| L9 | AI down → friendly message, no stack trace |

## M. Design / UX sweep (every page)
| ID | Case |
|---|---|
| M1 | No horizontal scroll at 390 px; no element past viewport |
| M2 | No overlapping fixed elements (save bar, Ask, bottom tabs, toasts) |
| M3 | Light and dark: contrast readable, no hard-coded colours, badges legible |
| M4 | Empty, loading and error states present and helpful |
| M5 | Every interactive element has an accessible name; keyboard focus visible; Esc closes panels |
| M6 | Console: no errors or React warnings on any page |
| M7 | Copy: no jargon, no raw JSON/IDs shown to users, consistent terms |
