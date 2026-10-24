import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

// Runs supabase/schema.sql on a real (in-process) Postgres, set up the way a
// Supabase project is: an auth schema with auth.uid(), the anon and authenticated
// roles, and the default grants Supabase gives new tables. Then it acts as
// different people and checks what the access rules allow.

const SCHEMA = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const TOKEN = 'T'.repeat(22);
const TOKEN2 = 'U'.repeat(22);

let db;

const SUPABASE_LIKE = `
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create role anon nologin;
  create role authenticated nologin;
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
  insert into auth.users (id, email) values ('${A}', 'a@example.test'), ('${B}', 'b@example.test');
`;

// Run SQL as a signed-in user (id) or as an anonymous visitor (null). Returns rows,
// or { error } when Postgres refuses.
async function as(id, sql, params = []) {
  try {
    return await db.transaction(async (tx) => {
      await tx.exec(`set local role ${id ? 'authenticated' : 'anon'}`);
      await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [id ?? '']);
      return (await tx.query(sql, params)).rows;
    });
  } catch (error) {
    return { error: error.message };
  }
}

// Starting the in-process Postgres sometimes never finishes (a race in its WebAssembly start-up while the
// test runner is still setting up). A short pause makes that rare, and each attempt is given a few seconds
// before it is abandoned and tried again, so a stall costs a few seconds instead of hanging the suite.
async function startDb(attempts = 4, waitMs = 6000) {
  for (let i = 1; i <= attempts; i++) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    const candidate = new PGlite();
    const worked = await Promise.race([candidate.exec(SUPABASE_LIKE).then(() => true, () => false), new Promise((resolve) => setTimeout(() => resolve(false), waitMs))]);
    if (worked) {
      db = candidate;
      return;
    }
    candidate.close().catch(() => {});
  }
  throw new Error('Postgres did not start');
}

before(async () => {
  await startDb();
  await db.exec(SCHEMA);
});
after(async () => { await db.close(); });

test('the schema can be run again without errors', async () => {
  await db.exec(SCHEMA);
});

test('each person sees and changes only their own decks', async () => {
  const [mine] = await as(A, `insert into decks (title, data) values ('A deck', '{"slides":[1]}') returning id, owner`);
  assert.equal(mine.owner, A, 'owner is filled in from the signed-in user');
  assert.equal((await as(A, 'select id from decks')).length, 1);
  assert.deepEqual(await as(B, 'select id from decks'), [], 'B sees nothing');
  assert.deepEqual(await as(B, `select id from decks where id = $1`, [mine.id]), [], 'not even by id');
  assert.deepEqual(await as(B, `update decks set title = 'hijacked' where id = $1 returning id`, [mine.id]), [], 'B cannot edit it');
  assert.deepEqual(await as(B, `delete from decks where id = $1 returning id`, [mine.id]), [], 'B cannot delete it');
  assert.equal((await as(A, 'select title from decks'))[0].title, 'A deck', 'untouched');
});

test('nobody can write a deck as someone else, or hand a deck to someone else', async () => {
  const forged = await as(B, `insert into decks (owner, title, data) values ($1, 'forged', '{}')`, [A]);
  assert.match(forged.error ?? '', /row-level security/i);
  const [row] = await as(A, `insert into decks (title, data) values ('Keep', '{}') returning id`);
  const moved = await as(A, `update decks set owner = $2 where id = $1 returning owner`, [row.id, B]);
  assert.equal(moved[0]?.owner ?? moved.error, A, 'the owner cannot be changed by an update');
  assert.deepEqual(await as(B, 'select id from decks where id = $1', [row.id]), []);
});

test('anonymous visitors have no direct access to the table', async () => {
  assert.match((await as(null, 'select * from decks')).error ?? '', /permission denied/i);
  assert.match((await as(null, `insert into decks (title, data) values ('x', '{}')`)).error ?? '', /permission denied/i);
  assert.match((await as(null, `update decks set title = 'x'`)).error ?? '', /permission denied/i);
  assert.match((await as(null, `delete from decks`)).error ?? '', /permission denied/i);
});

test('share links: exact token only, anonymous works, turning it off ends it', async () => {
  const [row] = await as(A, `insert into decks (title, data) values ('Public talk', '{"hello":"world"}') returning id`);
  const fetchShared = (who, t) => as(who, 'select public.get_shared_deck($1) as d', [t]);

  assert.equal((await fetchShared(null, TOKEN))[0].d, null, 'not shared yet');
  await as(A, `update decks set share_token = $2 where id = $1`, [row.id, TOKEN]);
  assert.deepEqual((await fetchShared(null, TOKEN))[0].d, { hello: 'world' }, 'a visitor with no account can read it');
  assert.deepEqual((await fetchShared(B, TOKEN))[0].d, { hello: 'world' }, 'so can another signed-in person');
  assert.equal((await fetchShared(null, TOKEN2))[0].d, null, 'a different token gets nothing');
  assert.equal((await fetchShared(null, TOKEN.slice(0, 21)))[0].d, null, 'a near miss gets nothing');
  assert.equal((await fetchShared(null, null))[0].d, null, 'null matches nothing, even though unshared decks have a null token');
  assert.equal((await fetchShared(null, ''))[0].d, null);
  assert.equal((await fetchShared(null, "' or 1=1 --"))[0].d, null);

  // the visitor still cannot read the table, only the function's answer
  assert.match((await as(null, 'select title from decks')).error ?? '', /permission denied/i);

  await as(A, `update decks set share_token = null where id = $1`, [row.id]);
  assert.equal((await fetchShared(null, TOKEN))[0].d, null, 'stopped sharing');
});

test('share tokens are unique and cannot be short', async () => {
  const [a1] = await as(A, `insert into decks (title, data) values ('One', '{}') returning id`);
  const [b1] = await as(B, `insert into decks (title, data) values ('Two', '{}') returning id`);
  await as(A, `update decks set share_token = $2 where id = $1`, [a1.id, TOKEN2]);
  const clash = await as(B, `update decks set share_token = $2 where id = $1`, [b1.id, TOKEN2]);
  assert.match(clash.error ?? '', /unique|duplicate/i);
  const short = await as(A, `update decks set share_token = 'abc' where id = $1`, [a1.id]);
  assert.match(short.error ?? '', /check constraint/i);
});

test('limits: a title over 200 characters is refused; updated_at moves on every change', async () => {
  const long = await as(A, `insert into decks (title, data) values ($1, '{}')`, ['x'.repeat(201)]);
  assert.match(long.error ?? '', /check constraint/i);
  const [row] = await as(A, `insert into decks (title, data) values ('Clock', '{}') returning id, updated_at`);
  await new Promise((r) => setTimeout(r, 20));
  const [after] = await as(A, `update decks set title = 'Clock 2' where id = $1 returning updated_at`, [row.id]);
  assert.ok(new Date(after.updated_at) > new Date(row.updated_at));
  const spoof = await as(A, `update decks set updated_at = '2001-01-01' where id = $1 returning updated_at`, [row.id]);
  assert.ok(new Date(spoof[0].updated_at) > new Date('2020-01-01'), 'the browser cannot set updated_at');
});

test('deleting an account deletes its decks', async () => {
  await db.exec(`insert into auth.users (id, email) values ('33333333-3333-3333-3333-333333333333', 'c@example.test')`);
  await as('33333333-3333-3333-3333-333333333333', `insert into decks (title, data) values ('Temp', '{}')`);
  await db.exec(`delete from auth.users where id = '33333333-3333-3333-3333-333333333333'`);
  const left = await db.query(`select count(*)::int as n from decks where owner = '33333333-3333-3333-3333-333333333333'`);
  assert.equal(left.rows[0].n, 0);
});

test('delete_my_account removes only the caller, and only when signed in', async () => {
  const C = '44444444-4444-4444-4444-444444444444';
  const D = '55555555-5555-5555-5555-555555555555';
  await db.exec(`insert into auth.users (id, email) values ('${C}', 'c2@example.test'), ('${D}', 'd@example.test')`);
  await as(C, `insert into decks (title, data) values ('C deck', '{}')`);
  await as(D, `insert into decks (title, data) values ('D deck', '{}')`);

  assert.match((await as(null, 'select public.delete_my_account()')).error ?? '', /permission denied/i, 'anonymous visitors cannot call it');
  assert.equal((await db.query(`select count(*)::int as n from auth.users where id = '${C}'`)).rows[0].n, 1, 'still there');

  const ok = await as(C, 'select public.delete_my_account()');
  assert.ok(!ok.error, ok.error);
  assert.equal((await db.query(`select count(*)::int as n from auth.users where id = '${C}'`)).rows[0].n, 0, 'the account is gone');
  assert.equal((await db.query(`select count(*)::int as n from decks where owner = '${C}'`)).rows[0].n, 0, 'and its decks');
  assert.equal((await db.query(`select count(*)::int as n from auth.users where id = '${D}'`)).rows[0].n, 1, 'other people are untouched');
  assert.equal((await db.query(`select count(*)::int as n from decks where owner = '${D}'`)).rows[0].n, 1);
});

test('the thumbnail column accepts a small image and refuses an oversized one', async () => {
  const [row] = await as(A, `insert into decks (title, data, thumb) values ('With pic', '{}', 'data:image/png;base64,AAAA') returning id`);
  assert.ok(row.id);
  const big = await as(A, `insert into decks (title, data, thumb) values ('Big pic', '{}', $1)`, ['x'.repeat(60001)]);
  assert.match(big.error ?? '', /check constraint/i);
});


// ---- limits ------------------------------------------------------------------------

import { LIMITS } from '../src/billing/plans.js';

const asService = (sql, params = []) => db.query(sql, params).then((r) => r.rows);

test('everything is free: a long run of decks is allowed, and there are no subscription or payment tables', async () => {
  await asService('delete from decks where owner = $1', [B]);
  for (let i = 0; i < 12; i++) {
    const r = await as(B, `insert into decks (title, data) values ('d${i}', '{}') returning id`);
    assert.ok(Array.isArray(r), `deck ${i}: ${JSON.stringify(r)}`);
  }
  assert.equal((await as(B, 'select my_plan() as p'))[0].p, 'free');
  const tables = (await asService(`select table_name from information_schema.tables where table_schema = 'public' and (table_name like 'paddle%' or table_name = 'subscriptions')`)).map((r) => r.table_name);
  assert.deepEqual(tables, [], 'a fresh install has no billing tables');
});

test('editing and deleting decks work, and a new deck is refused only past the cap, with a clear reason', async () => {
  const rows = await as(B, 'select id from decks');
  const upd = await as(B, `update decks set title = 'renamed' where id = $1 returning title`, [rows[0].id]);
  assert.equal(upd[0].title, 'renamed');
  await as(B, 'delete from decks where id = $1', [rows[1].id]);
  // lower the cap for this test only: the trigger reads deck_limit() each time
  await asService(`create or replace function public.deck_limit(p text) returns int language sql immutable as $$ select 11 $$`);
  const refused = await as(B, `insert into decks (title, data) values ('over', '{}')`);
  assert.match(refused.error ?? '', /deck_limit/);
  await as(B, 'delete from decks where id = $1', [rows[2].id]);
  assert.ok(Array.isArray(await as(B, `insert into decks (title, data) values ('fits', '{}') returning id`)), 'deleting frees a place');
  await asService(`create or replace function public.deck_limit(p text) returns int language sql immutable as $$ select 1000 $$`);
});

test('the limits in the database match the ones in the app', async () => {
  const [{ n }] = await asService(`select deck_limit('free') as n`);
  assert.equal(n, LIMITS.cloudDecks);
  const [{ seats }] = await asService(`select team_seats('free') as seats`);
  assert.equal(seats, LIMITS.teamSeats);
  assert.ok((await as(B, 'select plan_of($1)', [A])).error, 'nobody can look up another person\'s plan');
});

test('course completions: visitors can add one for a shared deck only, and only the owner can read the list', async () => {
  const T = 'K'.repeat(22);
  const [deck] = await as(A, `insert into decks (title, data) values ('Course', '{}') returning id`);
  const record = (who, t, name) => as(who, 'select public.record_completion($1, $2) as ok', [t, name]);

  assert.equal((await record(null, T, 'Sam'))[0].ok, false, 'not shared yet');
  await as(A, `update decks set share_token = $2 where id = $1`, [deck.id, T]);
  assert.equal((await record(null, T, '  Sam  '))[0].ok, true, 'a visitor with no account can record');
  assert.equal((await record(null, T, '   '))[0].ok, false, 'a blank name is refused');
  assert.equal((await record(null, 'Z'.repeat(22), 'Sam'))[0].ok, false, 'a wrong token is refused');
  assert.equal((await record(null, null, 'Sam'))[0].ok, false);
  assert.equal((await record(B, T, `Bo\nb${'x'.repeat(200)}`))[0].ok, true);

  const mine = await as(A, 'select name from completions where deck_id = $1 order by id', [deck.id]);
  assert.equal(mine[0].name, 'Sam', 'trimmed');
  assert.ok(mine[1].name.length <= 80 && !/\n/.test(mine[1].name), 'long names are cut and control characters removed');
  assert.deepEqual(await as(B, 'select name from completions'), [], 'another account sees nothing');
  assert.match((await as(null, 'select * from completions')).error ?? '', /permission denied/i);
  assert.ok((await as(B, `insert into completions (deck_id, name) values ($1, 'forged')`, [deck.id])).error, 'no direct inserts from the browser');
  assert.ok((await as(A, `insert into completions (deck_id, name) values ($1, 'forged')`, [deck.id])).error, 'not even the owner');

  await as(A, `update decks set share_token = null where id = $1`, [deck.id]);
  assert.equal((await record(null, T, 'Late'))[0].ok, false, 'stopped sharing');
  await as(A, 'delete from decks where id = $1', [deck.id]);
  assert.equal((await db.query('select count(*)::int as n from completions')).rows[0].n, 0, 'deleting the deck deletes its list');
});

// ---- team workspaces ------------------------------------------------------------------
const C = '33333333-3333-3333-3333-333333333333';

test('anyone signed in can create a team', async () => {
  await db.query(`insert into auth.users (id, email) values ($1, 'c@example.test') on conflict do nothing`, [C]);
  assert.match((await as(A, `select create_team('   ') as id`)).error ?? '', /team_needs_name/);
  const [t] = await as(A, `select create_team('Design team') as id`);
  assert.ok(t.id);
  assert.deepEqual((await as(A, 'select role from team_members where team_id = $1', [t.id])).map((r) => r.role), ['owner']);
  assert.ok((await as(B, `insert into teams (name, owner) values ('self-made', $1)`, [B])).error, 'no direct inserts');
  assert.ok((await as(B, `insert into team_members (team_id, user_id, role) values ($1, $2, 'owner')`, [t.id, B])).error, 'no adding yourself');
  assert.deepEqual(await as(B, 'select * from teams'), [], 'outsiders see nothing');
});

test('invites: owner makes a link, one person uses it, a team has a seat limit', async () => {
  const [team] = await as(A, `select id from teams where name = 'Design team'`);
  assert.match((await as(B, 'select create_team_invite($1) as t', [team.id])).error ?? '', /not_team_owner/);
  const [{ t: token }] = await as(A, 'select create_team_invite($1) as t', [team.id]);
  assert.ok(token.length >= 22);
  assert.match((await as(B, 'select accept_team_invite($1) as id', ['x'.repeat(30)])).error ?? '', /invite_invalid/);
  assert.match((await as(null, 'select accept_team_invite($1) as id', [token])).error ?? '', /permission denied|not signed in/i);
  assert.equal((await as(B, 'select accept_team_invite($1) as id', [token]))[0].id, team.id);
  assert.match((await as(C, 'select accept_team_invite($1) as id', [token])).error ?? '', /invite_invalid/, 'a link works once');
  assert.deepEqual((await as(B, 'select user_id from team_members where team_id = $1 order by role', [team.id])).length, 2, 'a member sees the roster');
  assert.equal((await as(B, 'select name from teams'))[0].name, 'Design team');
  assert.ok((await as(B, `update teams set name = 'Mine' where id = $1 returning id`, [team.id])).length === 0, 'a member cannot rename it');
  // seats: a team holds 25, and the owner and B already fill two
  await db.query(`insert into auth.users (id, email) select gen_random_uuid(), 'u' || g || '@example.test' from generate_series(1, 23) g`);
  for (const row of (await db.query(`select id from auth.users where email like 'u%@example.test'`)).rows) {
    await db.query(`insert into team_members (team_id, user_id) values ($1, $2)`, [team.id, row.id]);
  }
  const [{ t: t2 }] = await as(A, 'select create_team_invite($1) as t', [team.id]);
  assert.match((await as(C, 'select accept_team_invite($1) as id', [t2])).error ?? '', /team_full/);
  await db.query(`delete from team_members where team_id = $1 and email like 'u%@example.test'`, [team.id]);
});

test('team decks: members edit them, only the maker can delete, share or move them', async () => {
  const [team] = await as(A, `select id from teams where name = 'Design team'`);
  const [deck] = await as(A, `insert into decks (title, data, team_id) values ('Team deck', '{"v":1}', $1) returning id`, [team.id]);
  assert.equal((await as(B, 'select title from decks where id = $1', [deck.id]))[0].title, 'Team deck', 'a member can open it');
  assert.deepEqual(await as(C, 'select title from decks where id = $1', [deck.id]), [], 'an outsider cannot');
  await as(B, `update decks set data = '{"v":2}', share_token = $2, team_id = null where id = $1`, [deck.id, 'S'.repeat(22)]);
  const [after] = await as(A, 'select data, share_token, team_id from decks where id = $1', [deck.id]);
  assert.deepEqual(after.data, { v: 2 }, 'the edit went through');
  assert.equal(after.share_token, null, 'but a member cannot publish a link');
  assert.equal(after.team_id, team.id, 'or take it out of the team');
  assert.deepEqual(await as(B, 'delete from decks where id = $1 returning id', [deck.id]), [], 'a member cannot delete it');
  assert.match((await as(C, `insert into decks (title, data, team_id) values ('Sneak', '{}', $1)`, [team.id])).error ?? '', /not_in_team/, 'cannot file a deck into a team you are not in');
});

test('comments: team members read and write, mark done, and only the author edits the words', async () => {
  const [team] = await as(A, `select id from teams where name = 'Design team'`);
  const [deck] = await as(A, `select id from decks where title = 'Team deck'`);
  assert.deepEqual(await as(C, 'select * from deck_comments'), []);
  assert.ok((await as(C, `insert into deck_comments (deck_id, slide_id, body) values ($1, 's1', 'hi')`, [deck.id])).error, 'outsiders cannot comment');
  const [c1] = await as(B, `insert into deck_comments (deck_id, slide_id, author_name, body) values ($1, 's1', 'Bo', 'Make this bigger') returning id`, [deck.id]);
  assert.ok((await as(B, `insert into deck_comments (deck_id, slide_id, author, body) values ($1, 's1', $2, 'forged') returning id`, [deck.id, A])).error, 'cannot write as someone else');
  assert.equal((await as(A, 'select body from deck_comments where id = $1', [c1.id]))[0].body, 'Make this bigger');
  await as(A, `update deck_comments set resolved = true, body = 'edited by owner' where id = $1`, [c1.id]);
  const [after] = await as(B, 'select body, resolved from deck_comments where id = $1', [c1.id]);
  assert.deepEqual(after, { body: 'Make this bigger', resolved: true });
  assert.deepEqual(await as(C, 'delete from deck_comments returning id'), []);
  assert.equal((await as(A, 'delete from deck_comments where id = $1 returning id', [c1.id])).length, 1, 'the deck owner can remove any comment');
  void team;
});

test('leaving and removing: the owner removes people, people leave, decks go back to their makers', async () => {
  const [team] = await as(A, `select id from teams where name = 'Design team'`);
  const [bdeck] = await as(B, `insert into decks (title, data, team_id) values ('Bo deck', '{}', $1) returning id`, [team.id]);
  assert.equal((await as(C, 'select remove_team_member($1, $2) as ok', [team.id, B]))[0].ok, false, 'a stranger cannot remove anyone');
  assert.equal((await as(A, 'select remove_team_member($1, $2) as ok', [team.id, A]))[0].ok, false, 'the owner cannot be removed');
  assert.equal((await as(A, 'select remove_team_member($1, $2) as ok', [team.id, B]))[0].ok, true);
  assert.deepEqual(await as(A, 'select * from decks where id = $1', [bdeck.id]), [], 'their deck is no longer in the team');
  assert.equal((await as(B, 'select team_id from decks where id = $1', [bdeck.id]))[0].team_id, null, 'it is theirs alone again');
  assert.deepEqual(await as(B, 'select * from teams'), [], 'and they see no team');
  const [{ t }] = await as(A, 'select create_team_invite($1) as t', [team.id]);
  await as(B, 'select accept_team_invite($1)', [t]);
  assert.equal((await as(B, 'select remove_team_member($1, $2) as ok', [team.id, B]))[0].ok, true, 'anyone can leave');
});

// ---- the Claude connector link -------------------------------------------------------------
const HASH1 = 'a'.repeat(64);
const HASH2 = 'b'.repeat(64);

test('a person can make, replace and remove their own connector link, and nobody can read anyone\'s hash', async () => {
  assert.ok((await as(null, `select set_connector_key($1)`, [HASH1])).error, 'signed-out people cannot');
  assert.ok((await as(B, `select set_connector_key('not-a-hash')`)).error, 'only a sha-256 hex string is accepted');
  assert.ok(!(await as(B, `select set_connector_key($1)`, [HASH1])).error);
  assert.equal((await as(B, 'select count(*)::int as n from connector_key_info()'))[0].n, 1);
  assert.ok((await as(B, 'select token_hash from connector_keys')).error, 'the hash is not readable from the browser');
  assert.equal((await as(A, 'select count(*)::int as n from connector_key_info()'))[0].n, 0, 'A sees nothing of B\'s link');
  assert.ok(!(await as(B, `select set_connector_key($1)`, [HASH2])).error);
  assert.equal((await db.query('select token_hash from connector_keys where user_id = $1', [B])).rows[0].token_hash, HASH2, 'a new link replaces the old one');
  assert.ok((await as(A, `select set_connector_key($1)`, [HASH2])).error, 'two people cannot share one link');
  assert.ok((await as(B, 'insert into connector_keys (user_id, token_hash) values ($1, $2)', [B, HASH1])).error, 'no direct writes');
  await as(B, 'select remove_connector_key()');
  assert.equal((await as(B, 'select count(*)::int as n from connector_key_info()'))[0].n, 0);
});

test('deleting an account removes its connector link', async () => {
  await as(B, `select set_connector_key($1)`, [HASH1]);
  await db.query('delete from auth.users where id = $1', [B]);
  assert.equal((await db.query('select count(*)::int as n from connector_keys')).rows[0].n, 0);
  await db.query(`insert into auth.users (id, email) values ($1, 'b@example.test') on conflict do nothing`, [B]);
});
