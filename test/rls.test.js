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
