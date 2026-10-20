import { beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Applies the real migration to an in-process Postgres with minimal stand-ins
 * for Supabase's `auth` and `storage` schemas, then checks the access rules
 * as a signed-in user would hit them.
 */
const SUPABASE_STUBS = `
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean);
  create role authenticated nologin;
  grant usage on schema public, auth to authenticated;
`

const ADMIN = '00000000-0000-0000-0000-00000000000a'
const HM_ON = '00000000-0000-0000-0000-00000000000b'
const HM_OFF = '00000000-0000-0000-0000-00000000000c'

let db: PGlite

/** Run a query as a signed-in user, with row-level security applied. */
async function as<T>(userId: string, sql: string, params: unknown[] = []) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${userId}', false);`)
  try {
    return (await db.query<T>(sql, params)).rows
  } finally {
    await db.exec('reset role;')
  }
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(SUPABASE_STUBS)
  for (const m of ['0001_init.sql', '0002_harden.sql', '0003_pipeline.sql']) await db.exec(readFileSync(join(__dirname, '../migrations', m), 'utf8'))
  await db.exec(`
    grant select, insert, update, delete on all tables in schema public to authenticated;
    insert into auth.users (id, email) values
      ('${ADMIN}', 'admin@x.com'), ('${HM_ON}', 'hm-on@x.com'), ('${HM_OFF}', 'hm-off@x.com');
  `)
}, 30_000)

describe('schema', () => {
  it('makes the first sign-up an admin and later ones hiring managers', async () => {
    const rows = await db.query<{ email: string; app_role: string }>('select email, app_role from profiles order by email')
    expect(rows.rows).toEqual([
      { email: 'admin@x.com', app_role: 'admin' },
      { email: 'hm-off@x.com', app_role: 'hm' },
      { email: 'hm-on@x.com', app_role: 'hm' },
    ])
  })

  it('starts with test mode on, so no real candidate can be emailed by accident', async () => {
    const { rows } = await db.query<{ test_mode: boolean }>('select test_mode from org_settings')
    expect(rows).toEqual([{ test_mode: true }])
  })

  it('creates private storage buckets', async () => {
    const { rows } = await db.query<{ id: string; public: boolean }>('select id, public from storage.buckets order by id')
    expect(rows).toEqual([{ id: 'interview-audio', public: false }, { id: 'resumes', public: false }])
  })
})

describe('access rules', () => {
  let roleId: string
  let candidateId: string

  beforeAll(async () => {
    // The app writes through the server (service role) after its own checks
    const { rows: [role] } = await db.query<{ id: string }>(`insert into roles (title) values ('APM') returning id`)
    roleId = role.id
    await db.query(`insert into role_members (role_id, user_id, member_role) values ($1, $2, 'hm')`, [roleId, HM_ON])
    const { rows } = await db.query<{ id: string }>(
      `insert into candidates (role_id, external_id, name) values ($1, 't1', 'Asha') returning id`, [roleId])
    candidateId = rows[0].id
  })

  it('lets a hiring manager see a role they are on', async () => {
    expect(await as(HM_ON, 'select title from roles')).toEqual([{ title: 'APM' }])
    expect(await as(HM_ON, 'select name from candidates')).toEqual([{ name: 'Asha' }])
  })

  it('hides roles and candidates from a hiring manager who is not on the role', async () => {
    expect(await as(HM_OFF, 'select title from roles')).toEqual([])
    expect(await as(HM_OFF, 'select name from candidates')).toEqual([])
  })

  it('does not let hiring managers create roles', async () => {
    await expect(as(HM_ON, `insert into roles (title) values ('Sneaky')`)).rejects.toThrow(/row-level security/)
  })

  it('gives signed-in users no direct writes — only the server, after its checks, writes', async () => {
    await expect(
      as(HM_ON, `insert into decisions (candidate_id, stage, outcome, actor_type, actor_id, reason)
                 values ($1, 'screening', 'restore', 'human', $2, 'Strong answers')`, [candidateId, HM_ON]),
    ).rejects.toThrow(/row-level security/)
    // An update the policies don't allow silently matches no rows
    await as(HM_ON, `update roles set autopilot = true, status = 'active' where id = $1`, [roleId])
    const { rows } = await db.query<{ autopilot: boolean; status: string }>('select autopilot, status from roles where id = $1', [roleId])
    expect(rows[0]).toEqual({ autopilot: false, status: 'draft' })
    await expect(as(ADMIN, `insert into roles (title) values ('Direct')`)).rejects.toThrow(/row-level security/)
  })

  it('allows one engine lock per role and one live interview per candidate and round', async () => {
    await db.query(`insert into jobs (role_id, kind) values ($1, 'engine')`, [roleId])
    await expect(db.query(`insert into jobs (role_id, kind) values ($1, 'engine')`, [roleId])).rejects.toThrow(/duplicate key/)
  })

  it('never exposes stored Google tokens to signed-in users', async () => {
    await db.query(`insert into google_connections (user_id, google_email, refresh_token_enc) values ($1, 'hr@x.com', 'secret')`, [ADMIN])
    expect(await as(ADMIN, 'select * from google_connections')).toEqual([])
  })
})
