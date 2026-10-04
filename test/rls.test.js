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

before(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_LIKE);
  await db.exec(SCHEMA);
  // Person A is on a big plan so the older tests below can create many decks; person B stays on the free plan.
  await db.query(`insert into subscriptions (user_id, plan, status) values ($1, 'advanced', 'active')`, [A]);
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


// ---- plans and billing ------------------------------------------------------------

import { PLANS } from '../src/billing/plans.js';

const asService = (sql, params = []) => db.query(sql, params).then((r) => r.rows); // the webhook's role bypasses the rules

test('a free account may keep three decks online, and the fourth is refused with a clear reason', async () => {
  await asService('delete from decks where owner = $1', [B]);
  for (let i = 0; i < 3; i++) {
    const r = await as(B, `insert into decks (title, data) values ('d${i}', '{}') returning id`);
    assert.ok(Array.isArray(r), `deck ${i}: ${JSON.stringify(r)}`);
  }
  const fourth = await as(B, `insert into decks (title, data) values ('d4', '{}')`);
  assert.match(fourth.error ?? '', /deck_limit/);
});

test('editing and deleting still work at the limit, and deleting frees a place', async () => {
  const rows = await as(B, 'select id from decks');
  assert.equal(rows.length, 3);
  const upd = await as(B, `update decks set title = 'renamed' where id = $1 returning title`, [rows[0].id]);
  assert.equal(upd[0].title, 'renamed');
  await as(B, 'delete from decks where id = $1', [rows[1].id]);
  const again = await as(B, `insert into decks (title, data) values ('new', '{}') returning id`);
  assert.ok(Array.isArray(again));
});

test('a paid plan raises the limit, a lapsed one lowers it again, nothing existing is deleted', async () => {
  await asService(`insert into subscriptions (user_id, plan, status) values ($1, 'starter', 'active') on conflict (user_id) do update set plan = 'starter', status = 'active', ends_at = null`, [B]);
  assert.equal((await as(B, 'select my_plan() as p'))[0].p, 'starter');
  for (let i = 0; i < 5; i++) assert.ok(Array.isArray(await as(B, `insert into decks (title, data) values ('s${i}', '{}') returning id`)));
  const count = (await as(B, 'select count(*)::int as n from decks'))[0].n;
  assert.ok(count > 3);
  await asService(`update subscriptions set status = 'canceled' where user_id = $1`, [B]);
  assert.equal((await as(B, 'select my_plan() as p'))[0].p, 'free');
  assert.equal((await as(B, 'select count(*)::int as n from decks'))[0].n, count, 'decks are kept');
  assert.match((await as(B, `insert into decks (title, data) values ('x', '{}')`)).error ?? '', /deck_limit/);
  await asService(`update subscriptions set status = 'active', ends_at = now() - interval '1 day' where user_id = $1`, [B]);
  assert.equal((await as(B, 'select my_plan() as p'))[0].p, 'free', 'a plan past its end date no longer counts');
  await asService(`update subscriptions set status = 'trialing', ends_at = now() + interval '3 days' where user_id = $1`, [B]);
  assert.equal((await as(B, 'select my_plan() as p'))[0].p, 'starter', 'a trial counts');
});

test('people can read only their own subscription and can never write one', async () => {
  await asService(`update subscriptions set plan = 'pro' where user_id = $1`, [A]);
  assert.equal((await as(B, 'select * from subscriptions')).length, 1, 'B sees only their own row');
  assert.equal((await as(B, 'select * from subscriptions'))[0].user_id, B);
  assert.ok((await as(B, `update subscriptions set plan = 'advanced' where user_id = $1`, [B])).error, 'no update');
  assert.ok((await as(B, `insert into subscriptions (user_id, plan, status) values ($1, 'advanced', 'active')`, [B])).error, 'no insert');
  assert.ok((await as(B, 'delete from subscriptions')).error, 'no delete');
  assert.ok((await as(null, 'select * from subscriptions')).error, 'anonymous visitors see nothing');
  assert.ok((await as(B, 'select * from paddle_events')).error, 'the webhook log is private');
  assert.ok((await as(B, 'select plan_of($1)', [A])).error, 'nobody can look up another person\'s plan');
});

test('the deck limits in the database match the plan table in the app', async () => {
  for (const [id, plan] of Object.entries(PLANS)) {
    const [{ n }] = await asService('select deck_limit($1) as n', [id]);
    assert.equal(n, plan.cloudDecks, id);
  }
});

// ---- the webhook's database function ----------------------------------------------------

const rec = (over = {}) => ({ user_id: B, plan: 'pro', status: 'active', billing_interval: 'month', paddle_customer_id: 'ctm_B', paddle_subscription_id: 'sub_B', trial_ends_at: '', ends_at: '', update_payment_url: '', cancel_url: '', ...over });
const apply = async (id, at, r) => (await db.query('select paddle_apply($1, $2, $3, $4::jsonb) as r', [id, 'subscription.updated', at, JSON.stringify(r)])).rows[0].r;

test('paddle_apply: applies once, ignores a retry, ignores an older event, and rejects an unknown person', async () => {
  await db.query('delete from subscriptions where user_id = $1', [B]);
  assert.equal(await apply('e1', '2026-10-04T10:00:00Z', rec()), 'applied');
  assert.equal(await apply('e1', '2026-10-04T10:00:00Z', rec({ plan: 'advanced' })), 'duplicate');
  assert.equal((await db.query('select plan from subscriptions where user_id = $1', [B])).rows[0].plan, 'pro');
  assert.equal(await apply('e0', '2026-10-04T09:00:00Z', rec({ plan: 'starter' })), 'stale');
  assert.equal((await db.query('select plan from subscriptions where user_id = $1', [B])).rows[0].plan, 'pro', 'an older event cannot undo a newer one');
  assert.equal(await apply('e2', '2026-10-04T11:00:00Z', rec({ plan: 'advanced', status: 'active' })), 'applied');
  assert.equal((await db.query('select plan from subscriptions where user_id = $1', [B])).rows[0].plan, 'advanced');
  assert.equal(await apply('e3', '2026-10-04T12:00:00Z', rec({ user_id: '99999999-9999-9999-9999-999999999999' })), 'unknown_user');
});

test('paddle_apply: a stranger\'s payment cannot replace someone else\'s paying subscription', async () => {
  // B pays for sub_B. Someone else completes checkout with B's id in the custom data.
  const before = (await db.query('select plan, paddle_subscription_id from subscriptions where user_id = $1', [B])).rows[0];
  assert.equal(await apply('e4', '2026-10-05T00:00:00Z', rec({ plan: 'starter', paddle_subscription_id: 'sub_ATTACKER' })), 'conflict');
  const after = (await db.query('select plan, paddle_subscription_id from subscriptions where user_id = $1', [B])).rows[0];
  assert.deepEqual(after, before);
  // once B's own subscription has ended, a new one may take its place
  await db.query(`update subscriptions set status = 'canceled' where user_id = $1`, [B]);
  assert.equal(await apply('e5', '2026-10-06T00:00:00Z', rec({ paddle_subscription_id: 'sub_NEW', plan: 'starter' })), 'applied');
  // the same Paddle subscription cannot be claimed by a second account
  assert.equal(await apply('e6', '2026-10-07T00:00:00Z', rec({ user_id: A, paddle_subscription_id: 'sub_NEW' })), 'conflict');
});

test('nobody but the webhook can run paddle_apply', async () => {
  assert.ok((await as(B, `select paddle_apply('x', 't', now(), '{}'::jsonb)`)).error);
  assert.ok((await as(null, `select paddle_apply('x', 't', now(), '{}'::jsonb)`)).error);
});
