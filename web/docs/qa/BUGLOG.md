# HireEasy QA — bug log

Status: 🔧 fixing · ✅ fixed + verified · ⏭ deferred (reason)

## Round 1 — code audits (security, pipeline, UI) + automated gates

### Security
| ID | Sev | Defect | Status |
|---|---|---|---|
| S1 | High | `meetingOutcomeAction` accepted a meeting from another role (HM on role A could reject/hire role B's candidate) | ✅ scoped to role |
| S2 | High | Interviews page listed every role's human-round meetings (shared round id `hm-final`) | ✅ scoped to role |
| S3 | High | Role pages relied on the layout alone for access; pages now check access themselves (`getRoleForPage`) | ✅ |
| S4 | Med | HM could close/reopen a role via `setRoleStatus`; direct DB PATCH with own token could flip autopilot/status | ✅ HR-only + migration 0002 drops client write policies |
| S5 | Med | CSV export formula injection | ✅ `escapeFormulae` |
| S6 | Med | SSRF via sheet link / resume link (redirects, private IPs, uncapped size) | ✅ `safeFetch` |
| S7 | Low | Open redirect after login via `/\evil.com` | ✅ |
| S8 | Low | "Send now" on one role flushed every role's emails | ✅ role-scoped |
| S9 | Low | Inbox "mark all read" marked other users' personal notifications | ✅ |
| S10 | Low | Interview audio: any content type, overwrite on concurrent upload | ✅ allowlist, no upsert |

### Pipeline
| ID | Sev | Defect | Status |
|---|---|---|---|
| P1 | High | Cap ignored human-applied cuts → cap exceeded across batches | ✅ code fixed — browser retest pending |
| P2 | High | Resume / interview scoring retried forever on bad AI output → cut never fires | ✅ code fixed — browser retest pending |
| P3 | High | No unique lock row → lock and invite dedupe could break permanently | ✅ code fixed — browser retest pending |
| P4 | High | Whisper quota hit saved an empty transcript → answer silently scored 1 | ✅ code fixed — browser retest pending |
| P5 | High | Test mode applied at queue time only; switching it on before sending still emailed real candidates | ✅ code fixed — browser retest pending |
| P6 | Med | Interviews re-scored against the current version, not the one the candidate took | ✅ code fixed — browser retest pending |
| P7 | Med | Advancing/restoring at the last stage → stage done + status active (limbo, rejected at close) | ✅ code fixed — browser retest pending |
| P8 | Med | Closing a role left meetings and queued invites live | ✅ code fixed — browser retest pending |
| P9 | Med | Calibration hold-out counted labels, not candidates | ✅ code fixed — browser retest pending |
| P10 | Med | Autopilot re-enabled without recalibration after answer keys change; any save made a new version | ✅ code fixed — browser retest pending |
| P11 | Med | Unpaginated selects capped at 1,000 rows (re-import of 1,247-row sheet loses data) | ✅ code fixed — browser retest pending |
| P12 | Med | Quota check races with 4 parallel screenings | ✅ code fixed — browser retest pending |
| P13 | Low | Double-clicked cut ran twice | ✅ code fixed — browser retest pending |
| P14 | Low | Email stuck in "sending" after a timeout | ✅ code fixed — browser retest pending |
| P15 | Low | Follow-up event lost to a concurrent `tab_hidden` write | ✅ code fixed — browser retest pending |

### UI
| ID | Sev | Defect | Status |
|---|---|---|---|
| U1 | High | Comma-list inputs (locations, interviewer emails) eat commas/spaces while typing | ✅ code fixed — browser retest pending |
| U2 | High | Calibration form carried the previous applicant's band and note | ✅ code fixed — browser retest pending |
| U3 | High | Template name/family/description edits not marked unsaved | ✅ code fixed — browser retest pending |
| U4 | High | Interview answer upload failure silently skipped the answer | ✅ code fixed — browser retest pending |
| U5 | High | Interview submit failure still showed "All done" | ✅ code fixed — browser retest pending |
| U6 | High | Ask: 16th question onwards → "Bad request" | ✅ code fixed — browser retest pending |
| U7 | Med | Server-rendered dates in UTC, not IST | ✅ code fixed — browser retest pending |
| U8 | Med | Engine card time → hydration mismatch | ✅ code fixed — browser retest pending |
| U9 | Med | Engine "Run now" stuck on Working… after a failed call | ✅ code fixed — browser retest pending |
| U10 | Med | Forms wipe typed values on validation error (login, settings, team, new role) | ✅ code fixed — browser retest pending |
| U11 | Med | Email template "Reset to default" kept old text in the editor | ✅ code fixed — browser retest pending |
| U12 | Med | User role select shows a refused change | ✅ code fixed — browser retest pending |
| U13 | Med | Import wizard: re-mapping a linked column left a stale question link | ✅ code fixed — browser retest pending |
| U14 | Med | Number inputs snap to minimum when cleared (150 → 30150) | ✅ code fixed — browser retest pending |
| U15 | Med | "Try this interview" blocked by Safari popup blocker | ✅ code fixed — browser retest pending |
| U16 | Med | Interview page stuck on Loading on network/500 error | ✅ code fixed — browser retest pending |
| U17 | Med | Import button overflows at 390 px | ✅ code fixed — browser retest pending |
| U18 | Low | Chat links accepted `//evil.com` | ✅ code fixed — browser retest pending |
| U20 | Low | Interview big buttons rendered 14 px (`text-base` lost to `text-sm`) | ✅ code fixed — browser retest pending |
| U21 | Low | Import file input can't re-pick the same file after an error | ✅ code fixed — browser retest pending |
| U22 | Low | Close-role success message never visible | ✅ code fixed — browser retest pending |
| U23 | Low | Candidate page: raw float salary, dangling " · " | ✅ code fixed — browser retest pending |
| U24 | Low | Chat bubble overflows on long URLs | ✅ code fixed — browser retest pending |
| U25 | Low | Contrast: white on dark-mode accent 3.6:1; light `--faint` 2.8:1 | ✅ code fixed — browser retest pending |
| U26 | Low | Schedule default date hydration mismatch after midnight IST | ✅ code fixed — browser retest pending |

### Automated gates
| ID | Defect | Status |
|---|---|---|
| A3 | 24 ESLint errors (unescaped quotes, hook-purity false positives) | ✅ |

### Found while fixing round 1
| ID | Sev | Defect | Status |
|---|---|---|---|
| P16 | High | Cut "overrides" lookup treated decisions written by an HR-applied cut as one-off overrides (a waitlisted "hold" would be forced through next cut) | ✅ code fixed |
| P17 | High | Resume read thrown away when a quote was paraphrased twice → ~1 in 3 resumes failing on the real role | ✅ unverified claims earn no credit; read kept |
| P18 | Med | Filters listing every candidate id overflowed URL length on big roles | ✅ chunked |
| P19 | Low | Engine printed database errors as "[object Object]" | ✅ |
| S11 | Low | Schedule-meeting action loaded a meeting from any role | ✅ scoped |

## Round 2 — browser QA (QA Sandbox role, synthetic applicants)
| ID | Sev | Defect | Status |
|---|---|---|---|
| R2-1 | High | Dev server served a stale globals.css (new colour tokens missing → logo/buttons lost their colour) | ✅ restart; production build unaffected |
| R2-2 | High | Quota reservations leaked when an AI call failed → app falsely reported "per-minute limit" forever | ✅ released on every failure |
| R2-3 | High | Google's daily free limit was reported as "per-minute, continues in 1 min" | ✅ 429 details parsed; daily shown with real resume time; tracker marked full |
| R2-4 | Med | A clean "5" years from a column asked "in years" went to Needs a look instead of auto-exclude | ✅ unit taken from the column header |
| R2-5 | Med | Engine card said "Up to date — nothing new" while paused with applicants waiting | ✅ |
| R2-6 | Low | Quota messages showed raw model ids ("gemini-3.5-flash-lite free-tier minute limit") | ✅ plain words |
| R2-7 | Low | CSV file input had no accessible name | ✅ |
| R2-7 | Low | CSV file input had no accessible name | ✅ |
| R2-8 | Med | Application answers listed out of question order | ✅ |
| R2-9 | Low | Restore confirmed as "moved forward"; now says where they are | ✅ |
| R2-10 | Low | Experience shown as "1 yrs" | ✅ |
| R2-11 | Med | Bare Next.js 404 with no way back (also shown for roles you can't access) | ✅ branded 404s |
| R2-12 | Med | HM saw a "Pause role" button the server refuses | ✅ HR-only control; HM sees a status badge |
| R2-13 | Low | HM settings page: disabled fields with no explanation | ✅ note |
| R2-14 | Low | Ask said "not in the system" for a candidate the HM can't see | ✅ "in the roles you can see" |
| R2-15 | Med | Mobile: floating Ask covered page content; tab strip showed a scrollbar; active tab could be off-screen | ✅ bottom-bar Ask opens the in-context panel; strip scrolls to the active tab |
| R2-16 | Low | Ask on a candidate page could answer without naming them | ✅ name enforced in code |
| R2-17 | — | Login password box has no accessible label | Not a defect — implicit `<label>` |
| R2-17 | — | Login password "no label" | Not a defect — implicit `<label>`; tool limitation |
| R2-18 | High | Calibrating a sandbox of 3 held-out applicants would mark the whole template calibrated and unlock autopilot on every role from it (incl. the real APM role) | ✅ template-wide only with ≥10 held-out; small samples unlock the role alone, with a warning |
| R2-19 | Low | Band/filter toggle buttons didn't expose their selected state (aria-pressed) | ✅ |
| R2-20 | Low | Autopilot card said "one-time check per template" — no longer true | ✅ |
| R2-21 | Low | Interview header cramped on phones | ✅ wraps cleanly |
| R2-22 | Med | Our daily counter for Groq blocked calls Groq would accept (Groq's day is rolling) | ✅ provider's own daily 429 is the gate |
| R2-23 | High | Ask invented a "Candidates page", an outside link and an "actions menu" when asked to reject someone | ✅ links must be real app pages (checked in code); app map in prompt |
| R2-24 | Med | Ask: same-name candidates offered as "1 / 2" chips; picking one could loop | ✅ labelled choices; a chosen option resolves |
| R2-25 | Med | Ask linked a shared name to one of the two people | ✅ shared names never auto-linked |
| R2-26 | Low | Ask used gendered pronouns guessed from a name | ✅ prompt rule |
| R2-27 | Low | Ask showed raw paths, `<candidate_id>` placeholders and "Open" link text | ✅ pages named; placeholders replaced; code marks plain |
| R2-28 | High | Chat never released quota reservations on failed calls (phantom limits) | ✅ |
| R2-29 | Med | Rolling-day provider blocked until our midnight instead of the time it gave | ✅ |
| R2-30 | Med | Ask conversation lost when navigating away (empty first render overwrote it) | ✅ |
| R2-31 | Low | Chat pause message had doubled punctuation | ✅ |
| R2-32 | High | Applicants whose resume couldn't be read were ranked on answers alone (resume-only skills dropped) → unfairly high or low | ✅ the cut hands them to a person ("Need a look — resume couldn't be read"), outside the cap |
| R2-33 | Med | Cut preview ignored manual overrides, so it could differ from the real cut | ✅ preview and cut share one plan |
| R2-34 | Low | "Guarantee a place" confirmed as "Moved forward"; button still offered after | ✅ "Place guaranteed" state |
| R2-35 | Low | Cut result never shown after applying | ✅ last cut summary on the Interviews tab |
| R2-36 | Low | Queued test-mode emails said "delivered to" | ✅ "will go to / sent to" |
| R2-37 | Low | Cancel stayed clickable while a cut/close/decision was running | ✅ |
| R2-38 | Med | A closed role could still be edited (setup, decisions, cuts, calibration, preview) — UI and server | ✅ server guard on every role-changing action; read-only UI |
| R2-39 | Low | Closed role overview still showed processing ("Go live to start screening"), checklist and autopilot | ✅ hidden |
| R2-40 | Med | Ask reported only the last model's limit (e.g. "Gemini, back at 12:30") when another was back much sooner | ✅ reports the soonest |
| R2-41 | Med | Ask gave up on a "try again in 8 s" per-minute limit instead of waiting | ✅ waits once (≤30 s, early in a question) |
| R2-42 | Med | One multi-step answer could exceed one Groq model's per-minute tokens; steps now alternate between the two Groq models, size estimated from the provider's own count | ✅ |
| R2-43 | Low | Ask: a link inside bold text and "> quote" lines showed as raw markdown | ✅ |

## Round 3 — live Google (Gmail send + Meet), test mode on

Google OAuth client created (project hiring-pipeline-automation, consent screen in Testing, so the connection lasts 7 days). Connected as the HR account; every email went to the test address.

| ID | Sev | Defect | Status |
|---|---|---|---|
| G1 | Med | Sender name never shown: `From: … <me>` made Gmail swap in the account's profile name, and an unquoted comma ("Shashank, Hiring Team") would split the name | ✅ real connected address + RFC 5322 quoting / encoded-word; verified in "Show original" |
| G2 | High | Header injection: candidate email, subject and sender name went into raw headers with any line breaks intact (imported data) | ✅ line breaks stripped from every header value |
| G3 | Med | Meet event description (seen by the candidate) contained the internal applicant-profile URL | ✅ round, role and company only |
| G4 | Low | Close-role copy: "the 1 applicant who weren’t hired" | ✅ "who wasn’t" |

Verified live: 19 queued rejections sent (outbox `sent`, all 19 in the test inbox with "[TEST → original]" subjects; Hindi and `<script>` names render as text, no bounces). Two Meet bookings: Calendar events with Meet links, IST times, only the test address and organizer invited; invite emails sent. Outcome recorded (→ Hired). Closing the role deleted the booked event (Google sent the cancellation), cancelled the meeting and sent the one rejection; the hired candidate got none.

Known limits (not defects): interviewers on a round are invited at their real addresses even in test mode (Settings says test mode covers candidates); the app can't be published until it has a public home page and privacy policy.

## Round 4 — final end-to-end pass (live Gmail, AI interview via API, HM view, link crawl)

| ID | Sev | Defect | Status |
|---|---|---|---|
| F1 | Med | A reminder window as long as the deadline (Setup only warns) sent the reminder in the same run as the invite | ✅ no reminder within 1 h of the invite; verified live both ways |
| F2 | Low | Every run reported already-invited candidates as "N invited" again | ✅ counts only new invites |
| F3 | Low | "1 emails sent" / "1 resumes read" | ✅ singular/plural |
| F4 | Med | Answered-but-unscored interview questions showed a red "0/5" | ✅ "Pending" badge; test added |
| F5 | Low | Interview page deadline had no time zone and a different format from the email | ✅ "Tue, 20 Oct, 10:08 pm IST" style with the viewer's zone |
| F6 | Med | Hiring managers could turn autopilot on, lock calibration (template-wide), and create/edit templates | ✅ HR-only on the server and hidden in the UI; HMs can still turn autopilot off, label, cut and record outcomes |
| F7 | Low | Closed roles showed "In interviews" counts on the Roles list | ✅ closed roles show Applicants · Reached interviews · Hired |
| F8 | Low | Settings told you to "Publish app" for Google, which needs a public home page and privacy policy | ✅ explains Testing (7-day reconnect) vs publishing |
| F9 | High | Interview (and screening) scoring: gemini-3.1-flash-lite returned only element 1 per question, copying the one-element example; the skipped elements silently counted as absent, so a solid interview scored 32/100 (Python 2/5 though it named what it replaced, how, and "saved two hours a week") | ✅ prompt asks for every numbered element (example shows two); output missing any element is rejected and retried; tests added. Same transcript re-run: 5, 5, 3, 4 per question |
| F10 | High | 20 Oct 2026: gemini-3.5-flash-lite's free day (~480 requests, resets 12:30 pm IST) ran out and paused all scoring, though every other Gemini model has its own free allowance on the same key | ✅ scoring walks a chain — gemini-3.5-flash-lite → gemini-3.1-flash-lite → gemini-3.5-flash (env `AI_MODEL_CHAIN`, comma-separated; `AI_PRIMARY_MODEL` = a one-model chain). Next model only on a day-quota 429 (ours or Google's) or a 503 "high demand"; a per-minute 429 waits, 401/403 and bad output never switch. One candidate's screening / resume / interview is one call on one model (a repair retry stays on it; if that model's day ends mid-call the next model redoes the whole call). Each model has its own quota_usage rows and limits (flash-lite tier 14/min, 480/day; 3.5-flash 9/min, 240/day; unlisted Gemini = flash-lite). Calibration only vouched for the first model, so a fallback score is recorded with "scored by …" plus `fellBackFrom` and a "fallback" note on the applicant page; a person may cut on it, but autopilot sends those candidates to "need a look" and the early "can't reach the bar" stop is skipped. Overview "Free AI used today" lists every chain model. Tests added |

Verified: AI invite + reminder emails delivered with working links and the right sender name; candidate link states (open, completed, invalid); a full AI interview driven through the interview API with synthetic speech — 4 answers transcribed, a follow-up asked and answered, submitted; recordings play back on the applicant page. HM: sees only their roles, status badge instead of Pause/Close, templates read-only, no "New template". Crawl of 65 internal pages: no broken links; both CSV exports download. Production build passes.

Scoring verified live on https://hireeasy-web.vercel.app (Vercel, region bom1, same Supabase; `AI_PRIMARY_MODEL=gemini-3.1-flash-lite` there because 3.5-flash-lite's daily quota was spent and gemini-3.5-flash kept returning 503 "high demand"): Run now → "1 interview scored"; applicant page shows n/5 badges, element quotes, summary, strengths/concerns and "scored by" model. That run exposed F9. After the fix (old evaluation removed, Run now again): 77/100 with 5, 5, 3, 4; Interviews tab shows Final Tester 2 completed under "Would move on". Closed the role with the rejection box ticked: Final Tester 1's open link now says "This interview was cancelled by the hiring team."; both rejections sent from the live site in test mode, only to the test inbox ("[TEST → qa-final…]").

Not covered: a real microphone in a browser can't be automated (earlier rounds verified recording via the API).
