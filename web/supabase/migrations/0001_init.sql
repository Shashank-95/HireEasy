-- HireEasy 2.0 — initial schema.
--
-- Design notes
-- * A role's whole configuration (JD sections, skills, questions, answer keys,
--   eligibility, interview plan) is one JSON document validated in the app by
--   the RoleSpec schema. Every edit that affects scoring makes a new version,
--   so each evaluation can say exactly which answer keys it was scored against.
-- * Decisions are append-only. An override or a restore is a new row that
--   supersedes the old one; nothing about how a candidate moved is lost.
-- * Candidates and interviewers never touch tables directly. Candidate pages
--   and the background runner go through server code with the service key.


-- ───────────────────────── people ─────────────────────────

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  full_name text not null default '',
  -- hr: runs roles and templates; hm: hiring manager; admin: everything
  app_role text not null default 'hm' check (app_role in ('hr', 'hm', 'admin')),
  created_at timestamptz not null default now()
);

-- Organisation-wide settings: one row.
create table org_settings (
  id boolean primary key default true check (id),
  company_name text not null default '',
  about_company text not null default '',
  -- While on, every outgoing email goes to test_email instead of the candidate
  test_mode boolean not null default true,
  test_email text not null default '',
  sender_name text not null default 'Hiring Team',
  email_templates jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
insert into org_settings default values;

-- The Google account that sends email and creates Meet invites.
create table google_connections (
  user_id uuid primary key references profiles (id) on delete cascade,
  google_email text not null,
  -- Encrypted in the app before storage; never sent to the browser
  refresh_token_enc text not null,
  scopes text[] not null default '{}',
  updated_at timestamptz not null default now()
);

-- ───────────────────────── templates and roles ─────────────────────────

create table templates (
  id uuid primary key default gen_random_uuid(),
  slug text unique,
  name text not null,
  family text not null default '',
  description text not null default '',
  spec jsonb not null,
  change_notes jsonb not null default '[]'::jsonb,
  -- Calibration on a role built from this template unlocks autopilot for it
  calibrated boolean not null default false,
  created_by uuid references profiles (id),
  updated_at timestamptz not null default now()
);

create table roles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  template_id uuid references templates (id),
  -- Original JD text as pasted, kept so the conversion stays visible
  source_jd text not null default '',
  change_notes jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'closed')),
  autopilot boolean not null default false,
  current_version int not null default 1,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table role_versions (
  role_id uuid not null references roles (id) on delete cascade,
  version int not null,
  spec jsonb not null,
  -- Locked once calibration passes; editing answer keys then makes a new version
  locked_at timestamptz,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  primary key (role_id, version)
);

create table role_members (
  role_id uuid not null references roles (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  member_role text not null check (member_role in ('hr', 'hm')),
  primary key (role_id, user_id)
);

-- ───────────────────────── applicants ─────────────────────────

create table imports (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references roles (id) on delete cascade,
  source_url text not null,
  mapping jsonb not null,
  total_rows int not null,
  empty_rows int not null,
  applicants int not null,
  duplicates int not null,
  -- "What we changed": every raw value the import normalised, and how
  change_log jsonb not null default '[]'::jsonb,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

create table candidates (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references roles (id) on delete cascade,
  -- The form's own submission id; re-imports update instead of duplicating
  external_id text not null,
  name text not null default '',
  email text not null default '',
  phone text not null default '',
  fields jsonb not null default '{}'::jsonb,
  answers jsonb not null default '{}'::jsonb,
  -- Parsed salary / experience / notice with confidence
  parsed jsonb not null default '{}'::jsonb,
  -- Where the candidate is now: 'eligibility', 'screening', 'resume', a round id, or 'done'
  stage text not null default 'eligibility',
  -- 'active' | 'review' | 'excluded' | 'rejected' | 'advanced' | 'hired' | 'withdrawn'
  status text not null default 'active',
  merged_into uuid references candidates (id),
  last_import_id uuid references imports (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (role_id, external_id)
);
create index candidates_role_stage on candidates (role_id, stage, status);

create table documents (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references candidates (id) on delete cascade,
  kind text not null default 'resume',
  source_url text not null,
  storage_path text,
  text_content text,
  sha256 text,
  status text not null default 'pending' check (status in ('pending', 'stored', 'failed')),
  error text,
  created_at timestamptz not null default now()
);

-- One row per assessment: eligibility check, answer screening, resume match,
-- an AI interview score, or a human's scorecard.
create table evaluations (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references candidates (id) on delete cascade,
  stage text not null,
  actor_type text not null check (actor_type in ('system', 'ai', 'human')),
  actor_id uuid references profiles (id),
  model text,
  role_version int,
  score numeric,
  band text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index evaluations_candidate on evaluations (candidate_id, stage, created_at desc);

-- Append-only. The current outcome for a stage is its newest row.
create table decisions (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references candidates (id) on delete cascade,
  stage text not null,
  outcome text not null check (outcome in ('advance', 'exclude', 'review', 'reject', 'restore', 'hold')),
  actor_type text not null check (actor_type in ('system', 'ai', 'human')),
  actor_id uuid references profiles (id),
  reason text not null,
  supersedes uuid references decisions (id),
  created_at timestamptz not null default now()
);
create index decisions_candidate on decisions (candidate_id, stage, created_at desc);

create table calibration_labels (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references roles (id) on delete cascade,
  candidate_id uuid not null references candidates (id) on delete cascade,
  user_id uuid not null references profiles (id),
  band text not null check (band in ('strong', 'possible', 'no')),
  split text not null check (split in ('tune', 'validate')),
  note text not null default '',
  created_at timestamptz not null default now(),
  unique (candidate_id, user_id)
);

-- ───────────────────────── interviews ─────────────────────────

create table interview_sessions (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid references candidates (id) on delete cascade,
  role_id uuid not null references roles (id) on delete cascade,
  round_id text not null,
  role_version int not null,
  -- The link carries a random token; only its hash is stored
  token_hash text not null unique,
  -- A preview is HR or the HM trying the interview themselves; never scored into the role
  preview boolean not null default false,
  state text not null default 'invited' check (state in ('invited', 'started', 'submitted', 'expired', 'cancelled')),
  invited_at timestamptz not null default now(),
  reminded_at timestamptz,
  expires_at timestamptz not null,
  started_at timestamptz,
  submitted_at timestamptz,
  -- Tab switches, mic problems, timings
  events jsonb not null default '[]'::jsonb
);

create table interview_answers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references interview_sessions (id) on delete cascade,
  question_id text not null,
  -- 0 = the main question, 1+ = AI follow-ups
  followup_index int not null default 0,
  prompt text not null,
  audio_path text,
  transcript text,
  duration_ms int,
  created_at timestamptz not null default now(),
  unique (session_id, question_id, followup_index)
);

-- Human rounds: HR schedules once both sides are free; the tool books the Meet.
create table meetings (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references candidates (id) on delete cascade,
  round_id text not null,
  starts_at timestamptz,
  duration_min int not null,
  interviewer_emails text[] not null,
  calendar_event_id text,
  meet_link text,
  state text not null default 'to_schedule' check (state in ('to_schedule', 'scheduled', 'done', 'cancelled')),
  created_at timestamptz not null default now()
);

-- ───────────────────────── automation ─────────────────────────

create table jobs (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references roles (id) on delete cascade,
  kind text not null,
  state text not null default 'queued' check (state in ('queued', 'running', 'waiting_quota', 'done', 'failed', 'cancelled')),
  progress jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table job_items (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs (id) on delete cascade,
  candidate_id uuid references candidates (id) on delete cascade,
  state text not null default 'queued' check (state in ('queued', 'running', 'waiting_quota', 'done', 'failed')),
  attempts int not null default 0,
  -- A worker owns an item until this time; two tabs never process the same one
  locked_until timestamptz,
  not_before timestamptz,
  result jsonb,
  error text,
  updated_at timestamptz not null default now()
);
create index job_items_claim on job_items (state, not_before, locked_until);

-- Shared counters for free-tier AI limits, across every server instance.
create table quota_usage (
  model text not null,
  window_kind text not null check (window_kind in ('minute', 'day')),
  window_start timestamptz not null,
  requests int not null default 0,
  tokens int not null default 0,
  primary key (model, window_kind, window_start)
);

create table outbox (
  id uuid primary key default gen_random_uuid(),
  role_id uuid references roles (id) on delete cascade,
  candidate_id uuid references candidates (id) on delete cascade,
  kind text not null,
  -- Who it was meant for, and who actually got it (differs in test mode)
  intended_to text not null,
  actual_to text not null,
  test_mode boolean not null,
  subject text not null,
  html text not null,
  text_body text not null,
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed')),
  provider_id text,
  error text,
  -- Same email never sent twice for the same reason
  dedupe_key text unique,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  role_id uuid references roles (id) on delete cascade,
  -- null = everyone with access to the role
  user_id uuid references profiles (id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null default '',
  link text not null default '',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table audit_log (
  id bigserial primary key,
  role_id uuid references roles (id) on delete cascade,
  actor_id uuid references profiles (id),
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ───────────────────────── access ─────────────────────────

-- New sign-ups get a profile; the very first user becomes admin.
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, full_name, app_role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    case when exists (select 1 from profiles) then 'hm' else 'admin' end
  );
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

create function my_app_role() returns text
language sql stable security definer set search_path = public as $$
  select app_role from profiles where id = auth.uid()
$$;

-- HR and admins see every role; hiring managers see the roles they are on.
create function can_access_role(rid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select my_app_role() in ('hr', 'admin')
      or exists (select 1 from role_members where role_id = rid and user_id = auth.uid())
$$;

create function can_access_candidate(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select can_access_role((select role_id from candidates where id = cid))
$$;

alter table profiles enable row level security;
alter table org_settings enable row level security;
alter table google_connections enable row level security;
alter table templates enable row level security;
alter table roles enable row level security;
alter table role_versions enable row level security;
alter table role_members enable row level security;
alter table imports enable row level security;
alter table candidates enable row level security;
alter table documents enable row level security;
alter table evaluations enable row level security;
alter table decisions enable row level security;
alter table calibration_labels enable row level security;
alter table interview_sessions enable row level security;
alter table interview_answers enable row level security;
alter table meetings enable row level security;
alter table jobs enable row level security;
alter table job_items enable row level security;
alter table quota_usage enable row level security;
alter table outbox enable row level security;
alter table notifications enable row level security;
alter table audit_log enable row level security;

-- Signed-in team members can see each other (to assign hiring managers).
create policy profiles_read on profiles for select to authenticated using (true);
create policy profiles_admin on profiles for update to authenticated using (my_app_role() = 'admin');

create policy org_read on org_settings for select to authenticated using (true);
create policy org_write on org_settings for update to authenticated using (my_app_role() in ('hr', 'admin'));

-- google_connections: no client policies — only server code reads tokens.

-- Templates: HR and hiring managers can both create and edit (user decision).
create policy templates_read on templates for select to authenticated using (true);
create policy templates_write on templates for all to authenticated
  using (my_app_role() in ('hr', 'hm', 'admin')) with check (my_app_role() in ('hr', 'hm', 'admin'));

create policy roles_read on roles for select to authenticated using (can_access_role(id));
create policy roles_insert on roles for insert to authenticated with check (my_app_role() in ('hr', 'admin'));
create policy roles_update on roles for update to authenticated using (can_access_role(id));

create policy role_versions_read on role_versions for select to authenticated using (can_access_role(role_id));
create policy role_versions_insert on role_versions for insert to authenticated with check (can_access_role(role_id));

create policy role_members_read on role_members for select to authenticated using (can_access_role(role_id));
create policy role_members_write on role_members for all to authenticated
  using (my_app_role() in ('hr', 'admin')) with check (my_app_role() in ('hr', 'admin'));

create policy imports_read on imports for select to authenticated using (can_access_role(role_id));
create policy candidates_read on candidates for select to authenticated using (can_access_role(role_id));
create policy documents_read on documents for select to authenticated using (can_access_candidate(candidate_id));
create policy evaluations_read on evaluations for select to authenticated using (can_access_candidate(candidate_id));
create policy decisions_read on decisions for select to authenticated using (can_access_candidate(candidate_id));
-- People record their own overrides; everything else is written by server code
create policy decisions_insert on decisions for insert to authenticated
  with check (actor_type = 'human' and actor_id = auth.uid() and can_access_candidate(candidate_id));

create policy calibration_read on calibration_labels for select to authenticated using (can_access_role(role_id));
create policy calibration_write on calibration_labels for insert to authenticated
  with check (user_id = auth.uid() and can_access_role(role_id));

create policy sessions_read on interview_sessions for select to authenticated using (can_access_role(role_id));
create policy answers_read on interview_answers for select to authenticated
  using (exists (select 1 from interview_sessions s where s.id = session_id and can_access_role(s.role_id)));
create policy meetings_read on meetings for select to authenticated using (can_access_candidate(candidate_id));
create policy jobs_read on jobs for select to authenticated using (can_access_role(role_id));
create policy outbox_read on outbox for select to authenticated using (can_access_role(role_id));
create policy notifications_read on notifications for select to authenticated
  using ((user_id = auth.uid()) or (user_id is null and can_access_role(role_id)));
create policy notifications_mark on notifications for update to authenticated
  using ((user_id = auth.uid()) or (user_id is null and can_access_role(role_id)));
create policy audit_read on audit_log for select to authenticated using (can_access_role(role_id));

-- ───────────────────────── storage ─────────────────────────

-- Private buckets: resumes and interview audio are served through signed URLs only.
insert into storage.buckets (id, name, public) values ('resumes', 'resumes', false), ('interview-audio', 'interview-audio', false)
  on conflict (id) do nothing;
