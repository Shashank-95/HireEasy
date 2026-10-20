-- 0003 · Pipeline fixes from the QA pass (2026-10-20)
--
-- decisions.via: how a decision was made, so a cut's cap counts every place
--   given out by a cut (whoever applied it) but not one-off overrides.
-- outbox.claimed_at + 'cancelled': emails stuck mid-send can be found, and
--   closing a role cancels invites and reminders that haven't gone out yet.

alter table decisions add column if not exists via text
  check (via in ('cut', 'override', 'rules', 'ai', 'interview'));
create index if not exists decisions_cut on decisions (stage, via) where via = 'cut';

alter table outbox add column if not exists claimed_at timestamptz;
alter table outbox drop constraint if exists outbox_status_check;
alter table outbox add constraint outbox_status_check
  check (status in ('queued', 'sending', 'sent', 'failed', 'cancelled'));
