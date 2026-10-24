import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { isRight, pointsFor, Scoreboard, BASE_POINTS } from '../src/live/scoring.js';
import { LiveHost } from '../src/live/host.js';
import { newRoom, parseHello, cleanAudienceState } from '../src/live/protocol.js';
import { normalizeDeck } from '../src/core/schema.js';
import { collectKeys, collectPrompts } from '../src/live/prompts.js';

test('single and multiple choice answers are marked the same way the quiz block marks them', () => {
  const single = { mode: 'single', correct: [false, true, false] };
  assert.ok(isRight(single, [1]));
  assert.ok(!isRight(single, [0]) && !isRight(single, [1, 2]) && !isRight(single, []));
  const multi = { mode: 'multiple', correct: [true, false, true] };
  assert.ok(isRight(multi, [2, 0, 2]));
  assert.ok(!isRight(multi, [0]) && !isRight(multi, [0, 1, 2]));
  assert.ok(!isRight({ mode: 'single', correct: [false, false] }, [0]), 'a question with no right answer marks everything wrong');
});

test('points: 1000 for right, half guaranteed on a timed question, the rest for speed, zero for wrong', () => {
  assert.equal(pointsFor({ correct: true }), BASE_POINTS);
  assert.equal(pointsFor({ correct: false, limitS: 20 }), 0);
  assert.equal(pointsFor({ correct: true, elapsedS: 0, limitS: 20 }), 1000);
  assert.equal(pointsFor({ correct: true, elapsedS: 10, limitS: 20 }), 750);
  assert.equal(pointsFor({ correct: true, elapsedS: 20, limitS: 20 }), 500);
  assert.equal(pointsFor({ correct: true, elapsedS: 99, limitS: 20 }), 500, 'never below half for a right answer');
  assert.equal(pointsFor({ correct: true, elapsedS: -5, limitS: 20 }), 1000);
  assert.ok(pointsFor({ correct: true, elapsedS: 2, limitS: 30 }) > pointsFor({ correct: true, elapsedS: 12, limitS: 30 }), 'faster scores more');
});

test('the scoreboard ranks players, replaces a changed answer and ranks teams by average', () => {
  const b = new Scoreboard();
  b.join('a', { name: 'Amira', team: 'red' }, ['Red', 'Blue']);
  b.join('b', { name: 'Ben', team: 'Blue' }, ['Red', 'Blue']);
  b.join('c', { name: 'Cho', team: 'Blue' }, ['Red', 'Blue']);
  b.record('a', 'q1', { correct: true, points: 900 });
  b.record('b', 'q1', { correct: true, points: 700 });
  b.record('c', 'q1', { correct: false, points: 0 });
  assert.deepEqual(b.players().map((p) => [p.name, p.points]), [['Amira', 900], ['Ben', 700], ['Cho', 0]]);
  assert.deepEqual(b.rankOf('b'), { rank: 2, of: 3, points: 700 });
  b.record('c', 'q1', { correct: true, points: 800 }); // changed their mind
  assert.equal(b.players().find((p) => p.name === 'Cho').points, 800);
  b.record('a', 'q2', { correct: true, points: 1000 });
  assert.equal(b.players()[0].points, 1900);
  const teams = b.teams();
  assert.deepEqual(teams.map((t) => [t.team, t.average, t.members]), [['Red', 1900, 1], ['Blue', 750, 2]], 'a bigger team has no advantage');
  assert.equal(b.rankOf('nobody'), null);
  b.forget('q1');
  assert.equal(b.players().find((p) => p.name === 'Ben'), undefined, 'a player with no answers is not listed');
});

test('names are tidied and a rude one is replaced before it reaches the big screen', () => {
  const b = new Scoreboard();
  b.join('a', { name: '  Sam   the   Man  ' });
  b.join('b', { name: 'f u c k' });
  b.join('c', {});
  for (const c of ['a', 'b', 'c']) b.record(c, 'q', { correct: true, points: 100 });
  const names = Object.fromEntries(b.players().map((p) => [p.cid, p.name]));
  assert.equal(names.a, 'Sam the Man');
  assert.equal(names.b, 'Player');
  assert.match(names.c, /^Guest \d$/);
  b.join('d', { name: 'x'.repeat(80) });
  b.record('d', 'q', { correct: true, points: 1 });
  assert.equal(b.players().find((p) => p.cid === 'd').name.length, 24);
  const t = new Scoreboard();
  t.join('z', { name: 'Zed', team: 'Purple' }, ['Red', 'Blue']);
  t.record('z', 'q', { correct: true, points: 5 });
  assert.equal(t.players()[0].team, '', 'a team that does not exist is ignored');
});

test('hello may carry a nickname and team, cleaned and capped', () => {
  assert.deepEqual(parseHello({ t: 'hello', cid: 'u1', name: '  Ana\n  B ', team: 'Red' }), { cid: 'u1', name: 'Ana B', team: 'Red' });
  assert.deepEqual(parseHello({ t: 'hello', cid: 'u1' }), { cid: 'u1', name: '', team: '' });
  assert.equal(parseHello({ t: 'hello', cid: 'u1', name: 'n'.repeat(99) }).name.length, 24);
  assert.equal(parseHello({ t: 'hello', cid: 'u1', name: 42 }).name, '');
  const s = cleanAudienceState({ t: 'state', prompts: [], names: true, teams: ['Red', '', 5, 'Blue'], remaining: { x: 5 } });
  assert.deepEqual([s.names, s.teams, s.remaining], [true, ['Red', 'Blue'], {}]);
});

// ---- a whole timed game ---------------------------------------------------------------

function hub() {
  const channels = new Map();
  return { transport: () => ({ open(name, { onMessage, onStatus }) { const me = { onMessage, send(m) { for (const p of channels.get(name) ?? []) if (p !== me) p.onMessage(JSON.parse(JSON.stringify(m))); }, close() { channels.get(name)?.delete(me); } }; if (!channels.has(name)) channels.set(name, new Set()); channels.get(name).add(me); queueMicrotask(() => onStatus('connected')); return me; }, close() {} }) };
}
const wait = (ms = 330) => new Promise((r) => setTimeout(r, ms));

function game({ plan = 'starter', names = true, teams = ['Red', 'Blue'], limit = 20 } = {}) {
  const { deck } = normalizeDeck({ slides: [{ id: 's', layout: 'content', blocks: [
    { id: 'q1', type: 'quiz', slot: 'body', props: { question: 'Two plus two?', choices: [{ text: '4', correct: true }, { text: '5', correct: false }], timeLimit: limit } },
  ] }] });
  const h = hub();
  const room = newRoom();
  let clock = 1_000_000;
  const host = new LiveHost({ transport: h.transport(), room, plan, names, teams, now: () => clock });
  host.start();
  host.attach({ deck, state: { slide: 0, step: 0 }, nav: { stepCounts: [0] }, subscribe: () => () => {}, next() {}, prev() {}, first() {}, last() {} });
  const msgs = [];
  const ch = h.transport().open(`is-a-${room.code}`, { onMessage: (m) => msgs.push(m), onStatus() {} });
  return { host, ch, msgs, advance: (s) => { clock += s * 1000; }, deck };
}

test('the answer key is read for scoring but never sent to phones', () => {
  const { deck, host } = game();
  host.stop(); // this test only reads the deck
  const key = collectKeys(deck.slides[0]).get('q1');
  assert.deepEqual([key.mode, key.correct, key.timeLimit], ['single', [true, false], 20]);
  const prompt = collectPrompts(deck.slides[0])[0];
  assert.equal(prompt.timeLimit, 20);
  assert.ok(!JSON.stringify(prompt).includes('correct'));
});

test('a timed game: faster right answers score more, wrong scores nothing, late answers and second tries are refused', async () => {
  const g = game();
  after(() => g.host.stop());
  await wait(10);
  g.ch.send({ t: 'hello', cid: 'a', name: 'Amira', team: 'Red' });
  g.ch.send({ t: 'hello', cid: 'b', name: 'Ben', team: 'Blue' });
  g.ch.send({ t: 'hello', cid: 'c', name: 'Cho', team: 'Blue' });
  g.advance(5);
  g.ch.send({ t: 'vote', cid: 'a', id: 'q1', picks: [0] }); // right at 5 s: 875
  g.advance(10);
  g.ch.send({ t: 'vote', cid: 'b', id: 'q1', picks: [0] }); // right at 15 s: 625
  g.ch.send({ t: 'vote', cid: 'c', id: 'q1', picks: [1] }); // wrong
  g.ch.send({ t: 'vote', cid: 'a', id: 'q1', picks: [1] }); // a second try is ignored on a timed question
  await wait();
  assert.deepEqual(g.host.leaderboard().map((r) => [r.name, r.points]), [['Amira', 875], ['Ben', 625], ['Cho', 0]]);
  assert.deepEqual(g.host.teamBoard().map((t) => [t.team, t.average]), [['Red', 875], ['Blue', 313]]);
  assert.equal(g.host.remaining('q1'), 5);
  const mine = g.msgs.filter((m) => m.t === 'score' && m.cid === 'a');
  assert.deepEqual([mine[0].correct, mine[0].points, mine[0].rank, mine[0].of], [true, 875, 1, 1]);
  assert.ok(!JSON.stringify(g.msgs.filter((m) => m.t === 'state')).includes('"correct"'), 'phones are never sent the key');

  g.advance(30);
  g.ch.send({ t: 'hello', cid: 'd', name: 'Dee', team: 'Red' });
  g.ch.send({ t: 'vote', cid: 'd', id: 'q1', picks: [0] });
  await wait();
  assert.equal(g.host.leaderboard().find((r) => r.name === 'Dee'), undefined, 'too late');
  assert.ok(g.msgs.some((m) => m.t === 'score' && m.cid === 'd' && m.late));
  assert.equal(g.host.remaining('q1'), 0);

  g.host.resetVotes('q1');
  assert.deepEqual(g.host.leaderboard(), []);
  assert.ok(g.host.remaining('q1') === null || g.host.remaining('q1') > 0, 'resetting a question restarts its clock');
});

test('without names there is no leaderboard', async () => {
  const noNames = game({ names: false });
  after(() => noNames.host.stop());
  await wait(10);
  noNames.ch.send({ t: 'vote', cid: 'a', id: 'q1', picks: [0] });
  await wait();
  assert.deepEqual(noNames.host.leaderboard(), []);
  assert.equal(noNames.host.names, false);
});
