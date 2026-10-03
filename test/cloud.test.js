import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Cloud, CloudError, memoryStore } from '../src/cloud/client.js';
import { CloudSync } from '../src/cloud/sync.js';
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

test('a publishable (non-JWT) key goes in apikey only; a JWT anon key is also the bearer', async () => {
  const seen = [];
  const fake = (headersSeen) => async (url, init) => { headersSeen.push(init.headers); return { ok: true, status: 200, text: async () => 'null' }; };
  const pub = new Cloud({ url: 'https://x.supabase.co', key: 'sb_publishable_abc123', fetch: fake(seen) });
  await assert.rejects(pub.getShared('x'.repeat(22)), { code: 'not_found' });
  assert.equal(seen[0].apikey, 'sb_publishable_abc123');
  assert.equal('Authorization' in seen[0], false);
  const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.c2ln';
  const old = new Cloud({ url: 'https://x.supabase.co', key: jwt, fetch: fake(seen) });
  await assert.rejects(old.getShared('x'.repeat(22)), { code: 'not_found' });
  assert.equal(seen[1].Authorization, `Bearer ${jwt}`);
});

test('email link: requested with a redirect, then the returned address signs this browser in', async () => {
  const srv = await startFakeSupabase({ anonKey: KEY });
  try {
    const c = client(srv);
    assert.deepEqual(await c.providers(), { google: false, email: true });
    srv.state.googleEnabled = true;
    assert.equal((await c.providers()).google, true);

    await c.sendEmailLink('me@example.com', 'https://site.test/');
    assert.deepEqual(srv.state.otpRequests, [{ email: 'me@example.com', redirectTo: 'https://site.test/', createUser: true }]);

    assert.equal(await c.consumeRedirect(''), false, 'an ordinary address is not a sign-in');
    assert.equal(await c.consumeRedirect('#3'), false);
    assert.equal(await c.consumeRedirect(srv.emailLinkHash('me@example.com')), true);
    assert.equal(c.user.email, 'me@example.com');
    assert.deepEqual(await c.list(), []);

    const oauth = new URL(c.oauthUrl('google', 'https://site.test/'));
    assert.equal(oauth.pathname, '/auth/v1/authorize');
    assert.equal(oauth.searchParams.get('provider'), 'google');
    assert.equal(oauth.searchParams.get('redirect_to'), 'https://site.test/');
  } finally { await srv.close(); }
});

test('a forged or failed return is not trusted', async () => {
  const srv = await startFakeSupabase({ anonKey: KEY });
  try {
    const c = client(srv);
    await assert.rejects(c.consumeRedirect('#access_token=forged&refresh_token=x&expires_in=3600'), CloudError);
    assert.equal(c.user, null, 'tokens the project does not recognise sign nobody in');
    await assert.rejects(c.consumeRedirect('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'), /invalid or has expired/);
    assert.equal(c.user, null);
  } finally { await srv.close(); }
});

// ---- automatic saving ---------------------------------------------------------------

function syncRig({ signedIn = true } = {}) {
  const calls = [];
  const rows = new Map();
  let n = 0;
  const cloud = {
    user: signedIn ? { id: 'u1', email: 'a@b.co' } : null,
    failNext: null,
    async create({ title, data }) { if (cloud.failNext) { const e = cloud.failNext; cloud.failNext = null; throw e; } const row = { id: `d${++n}`, updated_at: `t${n}` }; rows.set(row.id, { title, data }); calls.push(['create', title]); return row; },
    async update(id, { title, data, expectedUpdatedAt }) { if (!rows.has(id)) throw new CloudError('gone', { code: 'not_found' }); if (cloud.conflict) throw new CloudError('changed', { code: 'conflict' }); rows.set(id, { title, data }); calls.push(['update', id, title, expectedUpdatedAt]); return { id, updated_at: `u${++n}` }; },
  };
  const rig = { calls, rows, cloud, deck: { meta: { title: 'One', createdAt: 'c1' } }, link: null, states: [], timers: [] };
  rig.sync = new CloudSync({
    getCloud: () => rig.cloudOn === false ? null : cloud,
    getDeck: () => rig.deck,
    inline: async (d) => structuredClone(d),
    getLink: (d) => (rig.link && rig.link.at === d.meta.createdAt ? { id: rig.link.id, updatedAt: rig.link.updatedAt ?? null } : null),
    setLink: async (link, d) => { rig.link = link ? { id: link.id, at: d.meta.createdAt, updatedAt: link.updatedAt } : null; },
    onState: (s, e) => rig.states.push(e ? `${s}:${e}` : s),
    delayMs: 5,
  });
  return rig;
}
const tick = (ms = 40) => new Promise((r) => setTimeout(r, ms));

test('auto-save: first edit creates the cloud deck, later edits update it, one request per pause', async () => {
  const rig = syncRig();
  rig.deck = { meta: { title: 'One', createdAt: 'c1' }, v: 1 };
  rig.sync.changed(); rig.sync.changed(); rig.sync.changed();
  await tick();
  assert.deepEqual(rig.calls, [['create', 'One']]);
  assert.equal(rig.sync.state, 'saved');
  rig.deck = { meta: { title: 'Renamed', createdAt: 'c1' }, v: 2 };
  rig.sync.changed();
  await tick();
  assert.deepEqual(rig.calls.slice(1), [['update', 'd1', 'Renamed', 't1']], 'the update names the version it is based on');
});

test('auto-save: nothing is sent when signed out, and nothing for a deck that was just loaded', async () => {
  const out = syncRig({ signedIn: false });
  assert.equal(out.sync.state, 'signedout');
  out.sync.changed();
  await tick();
  assert.deepEqual(out.calls, []);

  const rig = syncRig();
  const loaded = { meta: { title: 'From cloud', createdAt: 'c9' } };
  rig.deck = loaded;
  rig.sync.markClean(loaded);
  rig.sync.changed(); // a commit that replaced the deck
  rig.sync.markClean(loaded);
  await tick();
  assert.deepEqual(rig.calls, []);
});

test('auto-save: no cloud project means the feature is simply off', async () => {
  const rig = syncRig();
  rig.cloudOn = false;
  rig.sync.refresh();
  assert.equal(rig.sync.state, 'off');
  rig.sync.changed();
  await tick();
  assert.deepEqual(rig.calls, []);
});

test('auto-save: a failed save reports it and recovers on the next change', async () => {
  const rig = syncRig();
  rig.cloud.failNext = new CloudError('Could not reach the server.', { code: 'network' });
  rig.deck = { meta: { title: 'One', createdAt: 'c1' }, v: 1 };
  rig.sync.changed();
  await tick();
  assert.equal(rig.sync.state, 'error');
  assert.match(rig.sync.error, /reach the server/);
  rig.deck = { meta: { title: 'One', createdAt: 'c1' }, v: 2 };
  rig.sync.changed();
  await tick();
  assert.equal(rig.sync.state, 'saved');
  assert.deepEqual(rig.calls, [['create', 'One']]);
});

test('auto-save: a deck deleted elsewhere is saved again as a new one; edits made mid-save are not lost', async () => {
  const rig = syncRig();
  rig.deck = { meta: { title: 'One', createdAt: 'c1' }, v: 1 };
  rig.link = { id: 'gone', at: 'c1' };
  rig.sync.changed();
  await tick();
  assert.deepEqual(rig.calls, [['create', 'One']]);
  assert.equal(rig.link.id, 'd1');

  const slow = syncRig();
  slow.deck = { meta: { title: 'A', createdAt: 'c1' }, v: 1 };
  const origCreate = slow.cloud.create;
  slow.cloud.create = async (x) => { slow.deck = { meta: { title: 'B', createdAt: 'c1' }, v: 2 }; return origCreate(x); };
  slow.sync.changed();
  await tick(80);
  assert.deepEqual(slow.calls.map((c) => [c[0], c[2] ?? c[1]]), [['create', 'A'], ['update', 'B']]);
});

test('manual save reports failures to the caller', async () => {
  const rig = syncRig();
  rig.cloud.failNext = new CloudError('Boom', { code: 'x' });
  rig.deck = { meta: { title: 'One', createdAt: 'c1' }, v: 1 };
  await assert.rejects(rig.sync.flush({ manual: true }), /Boom/);
});

test('a deck that was only opened or created never claims to be saved online', async () => {
  const rig = syncRig();
  const fresh = { meta: { title: 'Brand new', createdAt: 'c7' } };
  rig.deck = fresh;
  rig.sync.changed(); // the commit that replaced the deck
  rig.sync.markClean(fresh);
  assert.equal(rig.sync.state, 'idle', 'no cloud copy exists, so it is not "saved"');
  await tick();
  assert.deepEqual(rig.calls, []);

  const opened = { meta: { title: 'From cloud', createdAt: 'c8' } };
  rig.deck = opened;
  rig.link = { id: 'd9', at: 'c8' };
  rig.sync.changed();
  rig.sync.markClean(opened);
  assert.equal(rig.sync.state, 'saved', 'it has a cloud copy, which matches');
});

test('a conflict stops saving until the person chooses; forcing overwrites', async () => {
  const rig = syncRig();
  rig.deck = { meta: { title: 'One', createdAt: 'c1' }, v: 1 };
  rig.sync.changed();
  await tick();
  assert.equal(rig.sync.state, 'saved');
  rig.cloud.conflict = true;
  rig.deck = { meta: { title: 'Two', createdAt: 'c1' }, v: 2 };
  rig.sync.changed();
  await tick();
  assert.equal(rig.sync.state, 'conflict');
  const callsBefore = rig.calls.length;
  rig.deck = { meta: { title: 'Three', createdAt: 'c1' }, v: 3 };
  rig.sync.changed();
  await tick();
  assert.equal(rig.calls.length, callsBefore, 'no further attempts while the choice is pending');
  assert.equal(rig.sync.state, 'conflict');
  rig.cloud.conflict = false;
  await rig.sync.flush({ force: true, manual: true });
  assert.equal(rig.sync.state, 'saved');
  assert.equal(rig.calls.at(-1)[3], null, 'a forced save does not name a base version');
});

test('update refuses to overwrite a newer online copy, and says so', async () => {
  const srv = await startFakeSupabase({ anonKey: KEY });
  try {
    const a = client(srv);
    const b = client(srv);
    await a.signUp('a@example.com', 'secret1');
    await b.signIn('a@example.com', 'secret1');
    const row = await a.create({ title: 'Shared', data: deckOf('Shared') });
    const seen = row.updated_at;
    await b.update(row.id, { title: 'B edited', data: deckOf('B'), expectedUpdatedAt: seen });   // fine: based on the latest
    await assert.rejects(a.update(row.id, { title: 'A edited', data: deckOf('A'), expectedUpdatedAt: seen }), { code: 'conflict' });
    assert.equal((await a.get(row.id)).title, 'B edited', 'the newer copy was not overwritten');
    const forced = await a.update(row.id, { title: 'A forced', data: deckOf('A') });
    assert.equal(forced.title, 'A forced');
    await a.remove(row.id);
    await assert.rejects(a.update(row.id, { title: 'x', data: {}, expectedUpdatedAt: seen }), { code: 'not_found' });
  } finally { await srv.close(); }
});

test('dashboard thumbnails travel with the deck, and only small PNGs are sent', async () => {
  const srv = await startFakeSupabase({ anonKey: KEY });
  try {
    const c = client(srv);
    await c.signUp('a@example.com', 'secret1');
    const png = 'data:image/png;base64,' + 'A'.repeat(100);
    const row = await c.create({ title: 'T', data: deckOf('T'), thumb: png });
    assert.equal((await c.list())[0].thumb, png);
    const noImage = await c.create({ title: 'U', data: deckOf('U'), thumb: 'data:text/html;base64,AAAA' });
    assert.equal(srv.decks.find((d) => d.id === noImage.id).thumb, null, 'not an image');
    const huge = await c.create({ title: 'V', data: deckOf('V'), thumb: 'data:image/png;base64,' + 'A'.repeat(70000) });
    assert.equal(srv.decks.find((d) => d.id === huge.id).thumb, null, 'too big');
    const updated = await c.setThumb(row.id, 'data:image/png;base64,' + 'B'.repeat(50));
    assert.ok(updated.updated_at);
  } finally { await srv.close(); }
});

test('deleting an account removes its decks and signs out', async () => {
  const srv = await startFakeSupabase({ anonKey: KEY });
  try {
    const store = memoryStore();
    const c = client(srv, store);
    await c.signUp('gone@example.com', 'secret1');
    await c.create({ title: 'Mine', data: deckOf('Mine') });
    await c.deleteAccount();
    assert.equal(c.user, null);
    assert.equal(store.get('session'), null);
    assert.equal(srv.decks.length, 0);
    await assert.rejects(client(srv).signIn('gone@example.com', 'secret1'), /Invalid login/);
  } finally { await srv.close(); }
});
