import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newRoom, normalizeCode, normalizeKey, parseVote, parseCommand, parseHello, cleanAudienceState, cleanRemoteState,
  cleanConfig, encodeConfig, decodeConfig, Tally, LIMITS, isStale, STALE_AFTER_MS, cleanSavedSession,
} from '../src/live/protocol.js';
import { collectPrompts } from '../src/live/prompts.js';
import { LiveHost, HEARTBEAT_MS } from '../src/live/host.js';
import { normalizeDeck } from '../src/core/schema.js';

const poll = { id: 'p1', kind: 'poll', question: 'Q', options: ['a', 'b', 'c'], multi: false };
const multi = { id: 'p2', kind: 'poll', question: 'Q', options: ['a', 'b', 'c'], multi: true };

test('rooms: code and key shapes, and normalising what people type', () => {
  const r = newRoom();
  assert.match(r.code, /^[A-HJ-NP-Z2-9]{6}$/);
  assert.equal(r.key.length, 22);
  assert.notEqual(newRoom().key, r.key);
  assert.equal(normalizeCode(' ab c-234 '), 'ABC234');
  assert.equal(normalizeCode('ABC10O'), null, 'no 0, 1, O or I');
  assert.equal(normalizeCode('ABC23'), null);
  assert.equal(normalizeKey(r.key), r.key);
  assert.equal(normalizeKey('short'), null);
});

test('votes: only real prompts and real options, one pick unless multi', () => {
  const ok = { t: 'vote', cid: 'u_1', id: 'p1', picks: [1] };
  assert.deepEqual(parseVote(ok, [poll]), { cid: 'u_1', id: 'p1', picks: [1] });
  assert.equal(parseVote({ ...ok, id: 'nope' }, [poll]), null, 'unknown prompt');
  assert.equal(parseVote({ ...ok, picks: [3] }, [poll]), null, 'option out of range');
  assert.equal(parseVote({ ...ok, picks: [-1] }, [poll]), null);
  assert.equal(parseVote({ ...ok, picks: [0, 1] }, [poll]), null, 'two picks on a single-choice prompt');
  assert.equal(parseVote({ ...ok, picks: [] }, [poll]), null);
  assert.equal(parseVote({ ...ok, picks: ['1'] }, [poll]), null, 'not numbers');
  assert.equal(parseVote({ ...ok, cid: '<script>' }, [poll]), null);
  assert.equal(parseVote({ ...ok, cid: 'x'.repeat(41) }, [poll]), null);
  assert.deepEqual(parseVote({ ...ok, id: 'p2', picks: [2, 0, 2] }, [multi]).picks, [0, 2], 'multi: sorted, deduplicated');
  assert.equal(parseVote(null, [poll]), null);
  assert.equal(parseVote({ t: 'cmd' }, [poll]), null);
});

test('commands and hellos are checked', () => {
  assert.deepEqual(parseCommand({ t: 'cmd', op: 'next' }), { op: 'next' });
  assert.equal(parseCommand({ t: 'cmd', op: 'eval' }), null);
  assert.equal(parseCommand({ t: 'cmd', op: '__proto__' }), null);
  assert.equal(parseCommand('next'), null);
  assert.deepEqual(parseHello({ t: 'hello', cid: 'abc' }), { cid: 'abc' });
  assert.equal(parseHello({ t: 'hello', cid: '' }), null);
});

test('tally: a voter has one answer per prompt, counts are derived, capped voters', () => {
  const t = new Tally();
  t.vote({ cid: 'a', id: 'p1', picks: [0] }, poll);
  t.vote({ cid: 'b', id: 'p1', picks: [0] }, poll);
  t.vote({ cid: 'c', id: 'p1', picks: [2] }, poll);
  assert.deepEqual(t.counts('p1', 3), [2, 0, 1]);
  t.vote({ cid: 'a', id: 'p1', picks: [1] }, poll); // changes their mind
  assert.deepEqual(t.counts('p1', 3), [1, 1, 1]);
  assert.equal(t.voters('p1'), 3);
  assert.deepEqual(t.counts('nothing', 3), [0, 0, 0]);
  t.reset('p1');
  assert.equal(t.voters('p1'), 0);
  const many = new Tally();
  for (let i = 0; i < LIMITS.voters; i++) assert.ok(many.vote({ cid: `v${i}`, id: 'p1', picks: [0] }, poll));
  assert.equal(many.vote({ cid: 'one-too-many', id: 'p1', picks: [0] }, poll), false);
  assert.ok(many.vote({ cid: 'v0', id: 'p1', picks: [1] }, poll), 'an existing voter can still change');
});

test('state messages from the network are cleaned', () => {
  const s = cleanAudienceState({ t: 'state', title: 'T', prompts: [poll, { id: 'bad' }, { ...poll, id: 'p3', options: ['only one'] }], counts: { p1: [1, 'x', 3], zzz: [9] } });
  assert.equal(s.prompts.length, 1);
  assert.deepEqual(s.counts, { p1: [1, 0, 3] });
  assert.equal(cleanAudienceState({ t: 'vote' }), null);
  assert.equal(cleanAudienceState({ t: 'state', prompts: 'x' }).prompts.length, 0);
  assert.equal(cleanRemoteState({ t: 'state', slide: 0, total: 0 }), null);
  assert.equal(cleanRemoteState({ t: 'state', slide: 2, total: 5, title: 'Hi', notes: 'n'.repeat(9000) }).notes.length, LIMITS.notes);
});

test('connection settings round-trip through a link and reject junk', () => {
  const cfg = { kind: 'realtime', url: 'https://abc.supabase.co/', key: 'eyJhbGciOi.x.y' };
  assert.deepEqual(cleanConfig(cfg), { kind: 'realtime', url: 'https://abc.supabase.co', key: 'eyJhbGciOi.x.y' });
  assert.deepEqual(decodeConfig(encodeConfig(cleanConfig(cfg))), cleanConfig(cfg));
  assert.deepEqual(decodeConfig(encodeConfig({ kind: 'local' })), { kind: 'local' });
  for (const pasted of ['https://abc.supabase.co/rest/v1/', 'https://abc.supabase.co/rest/v1', 'https://abc.supabase.co/auth/v1/token']) {
    assert.equal(cleanConfig({ kind: 'realtime', url: pasted, key: 'k' }).url, 'https://abc.supabase.co', pasted);
  }
  assert.equal(cleanConfig({ kind: 'realtime', url: 'javascript:alert(1)', key: 'k' }), null);
  assert.equal(cleanConfig({ kind: 'realtime', url: 'https://x.co', key: '' }), null);
  assert.equal(decodeConfig('%%% not base64 %%%'), null);
  assert.equal(decodeConfig(encodeConfig({ kind: 'other' })), null);
});

test('prompts are found on a slide, including inside tabs, as plain text', () => {
  const { deck } = normalizeDeck({ slides: [{ layout: 'content', blocks: [
    { type: 'poll', slot: 'body', props: { question: 'Best <b>day</b>?', options: [{ text: 'Mon &amp; Tue' }, { text: 'Fri' }] } },
    { type: 'tabs', slot: 'body', props: { tabs: [
      { title: 'One', blocks: [{ type: 'quiz', props: { question: 'Two plus two?', mode: 'single', choices: [{ text: '4', correct: true }, { text: '5', correct: false }] } }] },
      { title: 'Two', blocks: [] },
    ] } },
    { type: 'text', slot: 'body', props: { text: 'not a prompt' } },
  ] }] });
  const prompts = collectPrompts(deck.slides[0]);
  assert.deepEqual(prompts.map((p) => [p.kind, p.question, p.options]), [
    ['poll', 'Best day?', ['Mon & Tue', 'Fri']],
    ['quiz', 'Two plus two?', ['4', '5']],
  ]);
  assert.ok(prompts.every((p) => !('correct' in p)), 'the answer key is never sent');
  assert.equal(JSON.stringify(prompts).includes('"correct"'), false);
});

// ---- the host, over an in-memory transport ---------------------------------------

function hub() {
  const channels = new Map();
  return {
    transport() {
      return {
        open(name, { onMessage, onStatus }) {
          const me = { onMessage, sent: [], send(m) { for (const peer of channels.get(name) ?? []) if (peer !== me) peer.onMessage(JSON.parse(JSON.stringify(m))); me.sent.push(m); }, close() { channels.get(name)?.delete(me); } };
          if (!channels.has(name)) channels.set(name, new Set());
          channels.get(name).add(me);
          queueMicrotask(() => onStatus('connected'));
          return me;
        },
        close() {},
      };
    },
  };
}

function fakePlayer(deck) {
  const subs = new Set();
  const player = {
    deck, state: { slide: 0, step: 0 }, nav: { stepCounts: deck.slides.map(() => 0) }, calls: [],
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    go(i) { player.state = { slide: i, step: 0 }; for (const fn of subs) fn(); },
  };
  for (const op of ['next', 'prev', 'first', 'last']) player[op] = () => player.calls.push(op);
  return player;
}

const wait = (ms = 330) => new Promise((r) => setTimeout(r, ms));

test('host: votes tally for the current slide only, remote commands drive the player', async () => {
  const { deck } = normalizeDeck({ slides: [
    { id: 's1', layout: 'content', notes: 'say <b>hi</b>', blocks: [{ id: 'poll1', type: 'poll', slot: 'body', props: { question: 'Q', options: [{ text: 'A' }, { text: 'B' }] } }] },
    { id: 's2', layout: 'content', blocks: [{ type: 'text', slot: 'body', props: { text: 'x' } }] },
  ] });
  const h = hub();
  const room = newRoom();
  const host = new LiveHost({ transport: h.transport(), room });
  host.start();
  const player = fakePlayer(deck);
  host.attach(player);
  await wait(10);

  const phone = h.transport();
  const aud = [];
  const audCh = phone.open(`is-a-${room.code}`, { onMessage: (m) => aud.push(m), onStatus() {} });
  const rem = [];
  const remCh = phone.open(`is-r-${room.key}`, { onMessage: (m) => rem.push(m), onStatus() {} });

  audCh.send({ t: 'hello', cid: 'u1' });
  audCh.send({ t: 'vote', cid: 'u1', id: 'poll1', picks: [1] });
  audCh.send({ t: 'vote', cid: 'u2', id: 'poll1', picks: [1] });
  audCh.send({ t: 'vote', cid: 'u3', id: 'poll1', picks: [0] });
  audCh.send({ t: 'vote', cid: 'u3', id: 'poll1', picks: [5] }); // invalid, ignored
  await wait();
  assert.deepEqual(host.counts('poll1', 2), [1, 2]);
  assert.equal(host.voters('poll1'), 3);
  assert.equal(host.audienceSize, 3);
  const last = aud.filter((m) => m.t === 'state').at(-1);
  assert.deepEqual(last.counts.poll1, [1, 2]);
  assert.equal(last.prompts[0].question, 'Q');

  player.go(1);
  await wait();
  assert.deepEqual(host.prompts, []);
  audCh.send({ t: 'vote', cid: 'u9', id: 'poll1', picks: [0] });
  await wait();
  assert.deepEqual(host.counts('poll1', 2), [1, 2], 'a vote for a slide that is not showing is ignored');
  player.go(0);
  await wait();
  assert.deepEqual(host.counts('poll1', 2), [1, 2], 'and the totals are still there when you come back');

  remCh.send({ t: 'cmd', op: 'next' });
  remCh.send({ t: 'cmd', op: 'rm -rf' });
  assert.deepEqual(player.calls, ['next']);
  remCh.send({ t: 'hello' });
  const rs = rem.filter((m) => m.t === 'state').at(-1);
  assert.equal(rs.notes, 'say hi');
  assert.equal(rs.total, 2);
  assert.equal(rs.next.length > 0, true);

  // commands on the audience channel are not honoured
  audCh.send({ t: 'cmd', op: 'next' });
  assert.deepEqual(player.calls, ['next']);

  host.vote('poll1', [0]);
  assert.deepEqual(host.counts('poll1', 2), [2, 2], 'the presenter can answer too');
  host.stop();
  assert.equal(host.status, 'stopped');
});

test('presenter heartbeat: phones give up after three missed beats, never before', () => {
  assert.equal(STALE_AFTER_MS, 3 * HEARTBEAT_MS);
  assert.equal(isStale(null, 1e9), false, 'nothing heard yet is "waiting", not "lost"');
  assert.equal(isStale(1000, 1000 + STALE_AFTER_MS), false);
  assert.equal(isStale(1000, 1000 + STALE_AFTER_MS + 1), true);
});

test('the host keeps announcing itself while live, and stops when ended', async () => {
  const h = hub();
  const room = newRoom();
  const host = new LiveHost({ transport: h.transport(), room });
  const heard = [];
  h.transport().open(`is-a-${room.code}`, { onMessage: (m) => heard.push(m), onStatus() {} });
  host.start();
  const { deck } = normalizeDeck({ slides: [{ layout: 'content', blocks: [] }] });
  host.attach(fakePlayer(deck));
  await wait(20);
  const before = heard.length;
  assert.ok(before >= 1);
  host.stop();
  assert.equal(heard.at(-1).ended, true, 'phones are told the session ended');
});

test('a presenter page that restarts announces a new session id, so phones know to re-send', async () => {
  const h = hub();
  const room = newRoom();
  const heard = [];
  h.transport().open(`is-a-${room.code}`, { onMessage: (m) => heard.push(cleanAudienceState(m)), onStatus() {} });
  const first = new LiveHost({ transport: h.transport(), room });
  const second = new LiveHost({ transport: h.transport(), room });
  assert.notEqual(first.sessionId, second.sessionId);
  first.start();
  await wait(20);
  assert.equal(heard.at(-1).session, first.sessionId);
  first.stop();
  second.start();
  await wait(20);
  assert.equal(heard.at(-1).session, second.sessionId);
  second.stop();
});

test('a saved session is only resumed if it is complete and valid', () => {
  const room = newRoom();
  const good = { room, config: { kind: 'realtime', url: 'https://abc.supabase.co', key: 'k' }, base: 'https://x.test/' };
  assert.deepEqual(cleanSavedSession(good), good);
  assert.equal(cleanSavedSession({ ...good, room: { code: 'BAD', key: room.key } }), null);
  assert.equal(cleanSavedSession({ ...good, room: { code: room.code, key: 'short' } }), null);
  assert.equal(cleanSavedSession({ ...good, config: { kind: 'realtime', url: 'javascript:1', key: 'k' } }), null);
  assert.equal(cleanSavedSession(null), null);
  assert.equal(cleanSavedSession('x'), null);
});
