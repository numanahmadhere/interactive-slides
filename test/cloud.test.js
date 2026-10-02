import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Cloud, CloudError, memoryStore } from '../src/cloud/client.js';
import { startFakeSupabase } from './helpers/fake-supabase.js';
import { normalizeDeck } from '../src/core/schema.js';

const KEY = 'anon-key';
const deckOf = (title) => normalizeDeck({ meta: { title }, slides: [{ layout: 'content', blocks: [] }] }).deck;
const client = (srv, store = memoryStore()) => new Cloud({ url: srv.url, key: KEY, store });

test('sign up, save, list, load, update, delete', async () => {
  const srv = await startFakeSupabase({ anonKey: KEY });
  try {
    const c = client(srv);
    assert.equal(c.user, null);
    await assert.rejects(c.list(), { code: 'signed_out' });
    assert.deepEqual(await c.signUp('a@example.com', 'secret1'), { signedIn: true });
    assert.equal(c.user.email, 'a@example.com');

    const row = await c.create({ title: 'First', data: deckOf('First') });
    assert.ok(row.id);
    assert.equal((await c.list()).length, 1);
    assert.equal((await c.get(row.id)).data.meta.title, 'First');

    await c.update(row.id, { title: 'Renamed', data: deckOf('Renamed') });
    assert.equal((await c.get(row.id)).title, 'Renamed');

    await c.remove(row.id);
    assert.deepEqual(await c.list(), []);
    await assert.rejects(c.update(row.id, { title: 'x', data: {} }), { code: 'not_found' });
  } finally { await srv.close(); }
});

test('accounts only see their own decks, and cannot change another account\'s', async () => {
  const srv = await startFakeSupabase({ anonKey: KEY });
  try {
    const a = client(srv);
    const b = client(srv);
    await a.signUp('a@example.com', 'secret1');
    await b.signUp('b@example.com', 'secret2');
    const mine = await a.create({ title: 'Mine', data: deckOf('Mine') });
    assert.deepEqual(await b.list(), []);
    await assert.rejects(b.get(mine.id), { code: 'not_found' });
    await assert.rejects(b.update(mine.id, { title: 'Hijack', data: {} }), { code: 'not_found' });
    await b.remove(mine.id); // silently affects nothing
    assert.equal((await a.get(mine.id)).title, 'Mine');
  } finally { await srv.close(); }
});

test('wrong password and short password show the server\'s message', async () => {
  const srv = await startFakeSupabase({ anonKey: KEY });
  try {
    const c = client(srv);
    await assert.rejects(c.signUp('a@example.com', '123'), /at least 6/);
    await c.signUp('a@example.com', 'secret1');
    const other = client(srv);
    await assert.rejects(other.signIn('a@example.com', 'nope'), /Invalid login credentials/);
    assert.equal(other.user, null);
    await other.signIn('a@example.com', 'secret1');
    assert.equal(other.user.email, 'a@example.com');
  } finally { await srv.close(); }
});

test('projects that confirm email first: sign up reports it instead of signing in', async () => {
  const srv = await startFakeSupabase({ anonKey: KEY, confirmEmails: true });
  try {
    const c = client(srv);
    assert.deepEqual(await c.signUp('a@example.com', 'secret1'), { signedIn: false, needsConfirmation: true });
    assert.equal(c.user, null);
    await assert.rejects(c.signIn('a@example.com', 'secret1'), /not confirmed/);
  } finally { await srv.close(); }
});

test('an expired token is refreshed before the request; a dead refresh token signs out', async () => {
  const srv = await startFakeSupabase({ anonKey: KEY });
  try {
    let now = Date.now();
    const store = memoryStore();
    const c = new Cloud({ url: srv.url, key: KEY, store, now: () => now });
    await c.signUp('a@example.com', 'secret1');
    await c.create({ title: 'T', data: deckOf('T') });
    const before = srv.state.requests.filter((r) => r.path.includes('grant_type=refresh_token')).length;
    now += 2 * 3600 * 1000; // the access token has lapsed on this side...
    srv.state.clock = () => now / 1000; // ...and on the server's
    assert.equal((await c.list()).length, 1);
    assert.equal(srv.state.requests.filter((r) => r.path.includes('grant_type=refresh_token')).length, before + 1);
    // the session is restored from storage by a new client
    const again = new Cloud({ url: srv.url, key: KEY, store, now: () => now });
    assert.equal(again.user.email, 'a@example.com');
    assert.equal((await again.list()).length, 1);
    // refresh token revoked
    now += 2 * 3600 * 1000;
    srv.state.clock = () => now / 1000;
    for (const k of [...srv.tokens.keys()]) srv.tokens.delete(k);
    const stale = new Cloud({ url: srv.url, key: KEY, store: memoryStore(), now: () => now });
    await assert.rejects(stale.list(), { code: 'signed_out' });
  } finally { await srv.close(); }
});

test('sign out forgets the session', async () => {
  const srv = await startFakeSupabase({ anonKey: KEY });
  try {
    const store = memoryStore();
    const c = client(srv, store);
    await c.signUp('a@example.com', 'secret1');
    await c.signOut();
    assert.equal(c.user, null);
    assert.equal(store.get('session'), null);
    assert.equal(new Cloud({ url: srv.url, key: KEY, store }).user, null);
    await assert.rejects(c.list(), { code: 'signed_out' });
  } finally { await srv.close(); }
});

test('share links: work signed out, only for the exact token, and can be turned off', async () => {
  const srv = await startFakeSupabase({ anonKey: KEY });
  try {
    const owner = client(srv);
    await owner.signUp('a@example.com', 'secret1');
    const row = await owner.create({ title: 'Public talk', data: deckOf('Public talk') });
    const anon = client(srv); // never signed in
    await assert.rejects(anon.getShared('x'.repeat(22)), { code: 'not_found' });

    const token = await owner.setShared(row.id, true);
    assert.equal(token.length, 22);
    assert.equal((await anon.getShared(token)).meta.title, 'Public talk');
    assert.equal(await owner.setShared(row.id, true, token), token, 'turning it on again keeps the same link');
    await assert.rejects(anon.getShared(token.slice(0, 21) + 'z'), { code: 'not_found' });
    await assert.rejects(anon.getShared(''), { code: 'not_found' });
    await assert.rejects(anon.list(), { code: 'signed_out' }, 'anonymous visitors cannot list decks');

    assert.equal(await owner.setShared(row.id, false), null);
    await assert.rejects(anon.getShared(token), { code: 'not_found' });
  } finally { await srv.close(); }
});

test('requests carry the project key, and unreachable servers give a plain message', async () => {
  const srv = await startFakeSupabase({ anonKey: KEY });
  const c = client(srv);
  await c.signUp('a@example.com', 'secret1');
  await c.list();
  assert.ok(srv.state.requests.every((r) => r.apikey === KEY));
  assert.ok(srv.state.requests.at(-1).auth.startsWith('Bearer at_'), 'table requests use the user token, not the anon key');
  await srv.close();
  await assert.rejects(c.list(), (err) => err instanceof CloudError && err.code === 'network');
  const wrongKey = new Cloud({ url: srv.url, key: 'wrong' });
  await assert.rejects(wrongKey.signIn('a@b.co', 'x'), CloudError);
});

test('oversized decks are refused before sending', async () => {
  const srv = await startFakeSupabase({ anonKey: KEY });
  try {
    const c = client(srv);
    await c.signUp('a@example.com', 'secret1');
    await assert.rejects(c.create({ title: 'Big', data: { blob: 'x'.repeat(26 * 1024 * 1024) } }), { code: 'too_big' });
    assert.deepEqual(await c.list(), []);
  } finally { await srv.close(); }
});
