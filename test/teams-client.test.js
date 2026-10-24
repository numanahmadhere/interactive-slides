import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Cloud, memoryStore } from '../src/cloud/client.js';

// A scripted server: answers each request with the next canned reply and records what was asked.
function scripted(replies) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url: String(url), method: init?.method ?? 'GET', body: init?.body ? JSON.parse(init.body) : undefined });
    const r = replies.shift() ?? { status: 200, body: [] };
    return { ok: r.status < 400, status: r.status, text: async () => JSON.stringify(r.body) };
  };
  return { fetch, calls };
}

function signedIn(replies) {
  const store = memoryStore();
  store.set('session', JSON.stringify({ access_token: 'tok', refresh_token: 'r', expires_at: Math.floor(Date.now() / 1000) + 3000, user: { id: 'u1', email: 'a@example.com' } }));
  const s = scripted(replies);
  return { cloud: new Cloud({ url: 'https://x.supabase.co', key: 'k', fetch: s.fetch, store }), calls: s.calls };
}

test('database team rules come back as plain sentences', async () => {
  const cases = { team_full: /no free seats/, invite_invalid: /not valid any more/, team_limit: /three teams/, not_team_owner: /person who made the team/ };
  for (const [code, words] of Object.entries(cases)) {
    const { cloud } = signedIn([{ status: 400, body: { message: code, code: 'P0001' } }]);
    await assert.rejects(cloud.createTeam('X'), (err) => words.test(err.message) && err.code === code, code);
  }
});

test('creating, inviting and joining call the right database functions with the right words', async () => {
  const { cloud, calls } = signedIn([{ status: 200, body: 'team-1' }, { status: 200, body: 'tok-abc' }, { status: 200, body: 'team-1' }]);
  assert.equal(await cloud.createTeam('Design'), 'team-1');
  assert.equal(await cloud.createInvite('team-1'), 'tok-abc');
  assert.equal(await cloud.acceptInvite('tok-abc'), 'team-1');
  assert.deepEqual(calls.map((c) => [c.method, c.url.replace('https://x.supabase.co', ''), c.body]), [
    ['POST', '/rest/v1/rpc/create_team', { n: 'Design' }],
    ['POST', '/rest/v1/rpc/create_team_invite', { t: 'team-1' }],
    ['POST', '/rest/v1/rpc/accept_team_invite', { tok: 'tok-abc' }],
  ]);
});

test('a project without the team tables simply has no teams or comments', async () => {
  const { cloud } = signedIn([{ status: 404, body: { message: 'relation does not exist' } }, { status: 404, body: { message: 'x' } }]);
  assert.deepEqual(await cloud.teams(), []);
  assert.deepEqual(await cloud.comments('d1'), []);
});

test('comments are trimmed to the database limits before they are sent', async () => {
  const { cloud, calls } = signedIn([{ status: 201, body: [{ id: 1 }] }]);
  await cloud.addComment('d1', 's'.repeat(100), 'n'.repeat(200), 'b'.repeat(2000));
  const sent = calls[0].body;
  assert.equal(sent.slide_id.length, 64);
  assert.equal(sent.author_name.length, 80);
  assert.equal(sent.body.length, 1000);
});
