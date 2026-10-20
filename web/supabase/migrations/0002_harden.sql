-- 0002 · Harden writes and pipeline locks (QA pass, 2026-10-20)
--
-- 1. Every write goes through server actions that check access first and use
--    the service role. Signed-in users therefore need no direct write access;
--    leaving it open let a hiring manager PATCH a role (e.g. turn autopilot on,
--    skip calibration) with their own login token and the public anon key.
-- 2. One engine lock row per role and kind, and one live interview session per
--    candidate per round, so two ticks at once can't double-lock or re-invite.

drop policy if exists profiles_admin on profiles;
drop policy if exists org_write on org_settings;
drop policy if exists templates_write on templates;
drop policy if exists roles_insert on roles;
drop policy if exists roles_update on roles;
drop policy if exists role_versions_insert on role_versions;
drop policy if exists role_members_write on role_members;
drop policy if exists decisions_insert on decisions;
drop policy if exists calibration_write on calibration_labels;
drop policy if exists notifications_mark on notifications;

create unique index if not exists jobs_role_kind_key on jobs (role_id, kind);
create unique index if not exists interview_sessions_one_live
  on interview_sessions (candidate_id, round_id) where not preview;
