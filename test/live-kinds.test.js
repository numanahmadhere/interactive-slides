import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { Boards, normalizeEntry, cleanText, BOARD_LIMITS } from '../src/live/boards.js';
import { parseVote, parseText, parseAsk, cleanAudienceState, cleanPrompt, Tally, newRoom } from '../src/live/protocol.js';
import { collectPrompts } from '../src/live/prompts.js';
import { resultsCsv, cell } from '../src/live/results.js';
import { LiveHost } from '../src/live/host.js';
import { normalizeDeck } from '../src/core/schema.js';
import { layoutWords } from '../src/core/blocks/wordcloud.js';
import { average } from '../src/core/blocks/rating.js';

const rank = { id: 'r1', kind: 'ranking', question: 'Q', options: ['a', 'b', 'c'], multi: false };
const cloud = { id: 'c1', kind: 'cloud', question: 'Q', options: [], limit: 2 };
const open = { id: 'o1', kind: 'open', question: 'Q', options: [], limit: 1 };
const qna = { id: 'q1', kind: 'qna', question: 'Q', options: [] };
const rating = { id: 't1', kind: 'rating', question: 'Q', options: ['1', '2', '3', '4', '5'], multi: false };

test('word entries are tidied so "Clear Vision!" and "clear vision" are one word', () => {
  assert.equal(normalizeEntry('  Clear   Vision! '), 'clear vision');
  assert.equal(normalizeEntry('...'), '');
  assert.equal(normalizeEntry('x'.repeat(100)).length, BOARD_LIMITS.entry);
  assert.equal(normalizeEntry('Café'), 'café');
  assert.equal(normalizeEntry('a\u0000b'), 'a b');
  assert.equal(cleanText('  two   words\n ', 50), 'two words');
});

test('a word cloud counts each person once per word and caps how many they send', () => {
  const b = new Boards();
  assert.ok(b.addEntry('c', 'u1', 'Trust', 2));
  assert.ok(!b.addEntry('c', 'u1', 'trust', 2), 'the same word twice from one phone');
  assert.ok(b.addEntry('c', 'u1', 'speed', 2));
  assert.ok(!b.addEntry('c', 'u1', 'third', 2), 'over the limit');
  assert.ok(b.addEntry('c', 'u2', 'TRUST', 2));
  assert.ok(!b.addEntry('c', 'u2', '!!!', 2));
  assert.deepEqual(b.words('c'), [['trust', 2], ['speed', 1]]);
  assert.deepEqual(b.entriesOf('c', 'u1'), ['trust', 'speed']);
  b.reset('c');
  assert.deepEqual(b.words('c'), []);
});

test('open answers keep the newest first and respect each person\'s limit', () => {
  const b = new Boards();
  assert.ok(b.addResponse('o', 'u1', ' first  answer ', 1));
  assert.ok(!b.addResponse('o', 'u1', 'second', 1));
  assert.ok(b.addResponse('o', 'u2', 'second'));
  assert.deepEqual(b.responses('o'), ['second', 'first answer']);
  assert.ok(!b.addResponse('o', 'u3', '   '));
  assert.equal(b.responses('o', 1).length, 1);
  assert.equal(b.responsesOf('o', 'u1').length, 1);
});

test('Q&A: questions rise with upvotes, answered ones sink, hidden ones vanish', () => {
  const b = new Boards();
  const a = b.ask('q', 'u1', 'First?', 1);
  const c = b.ask('q', 'u2', 'Second?', 2);
  assert.deepEqual(b.questions('q').map((x) => x.text), ['First?', 'Second?'], 'oldest first on a tie');
  assert.ok(b.upvote('q', 'u3', c));
  assert.ok(b.upvote('q', 'u4', c));
  assert.deepEqual(b.questions('q').map((x) => [x.text, x.votes]), [['Second?', 3], ['First?', 1]]);
  assert.ok(!b.upvote('q', 'u2', c), 'you cannot withdraw the vote on your own question');
  assert.ok(b.upvote('q', 'u3', c), 'but you can withdraw another vote');
  assert.equal(b.questions('q')[0].votes, 2);
  b.moderate('q', c, 'answered');
  assert.equal(b.questions('q').at(-1).text, 'Second?');
  b.moderate('q', a, 'hide');
  assert.deepEqual(b.questions('q').map((x) => x.text), ['Second?']);
  assert.equal(b.questions('q', { includeHidden: true }).length, 2);
  assert.ok(!b.upvote('q', 'u9', a), 'hidden questions cannot be voted on');
  assert.ok(!b.moderate('q', 'nope', 'hide'));
  assert.ok(!b.moderate('q', c, 'explode'));
  assert.deepEqual(b.upvotedBy('q', 'u4'), [c]);
});

test('Q&A is capped per person and per board', () => {
  const b = new Boards();
  for (let i = 0; i < BOARD_LIMITS.asksPerPerson; i++) assert.ok(b.ask('q', 'u1', `q${i}`));
  assert.equal(b.ask('q', 'u1', 'one more'), null);
  assert.equal(b.ask('q', 'u2', '  '), null);
  assert.ok(b.ask('q', 'u2', 'fine'));
});

test('ranking answers must be a full, valid order, and score by place', () => {
  const ok = { t: 'vote', cid: 'u1', id: 'r1', picks: [2, 0, 1] };
  assert.deepEqual(parseVote(ok, [rank]).picks, [2, 0, 1], 'the order is kept');
  assert.equal(parseVote({ ...ok, picks: [0, 1] }, [rank]), null, 'missing an item');
  assert.equal(parseVote({ ...ok, picks: [0, 0, 1] }, [rank]), null, 'a repeat');
  assert.equal(parseVote({ ...ok, picks: [0, 1, 3] }, [rank]), null, 'out of range');
  const t = new Tally();
  t.vote({ cid: 'a', id: 'r1', picks: [2, 0, 1] }, rank); // c first
  t.vote({ cid: 'b', id: 'r1', picks: [2, 1, 0] }, rank);
  t.vote({ cid: 'c', id: 'r1', picks: [0, 2, 1] }, rank);
  assert.deepEqual(t.scores('r1', 3), [3, 1, 5], 'first earns 2, second 1, last 0');
});

test('typed answers and questions are checked against the prompts on screen', () => {
  const prompts = [cloud, open, qna, rating];
  assert.deepEqual(parseText({ t: 'text', cid: 'u1', id: 'c1', text: 'hi' }, prompts), { cid: 'u1', id: 'c1', kind: 'cloud', text: 'hi', limit: 2 });
  assert.equal(parseText({ t: 'text', cid: 'u1', id: 't1', text: 'hi' }, prompts), null, 'text for a rating');
  assert.equal(parseText({ t: 'text', cid: 'u1', id: 'nope', text: 'hi' }, prompts), null);
  assert.equal(parseText({ t: 'text', cid: 'u1', id: 'c1', text: 5 }, prompts), null);
  assert.equal(parseText({ t: 'text', cid: '<b>', id: 'c1', text: 'x' }, prompts), null);
  assert.equal(parseText({ t: 'text', cid: 'u1', id: 'c1', text: 'x'.repeat(5000) }, prompts).text.length, 400);
  assert.deepEqual(parseAsk({ t: 'ask', cid: 'u1', id: 'q1', text: 'Why?' }, prompts), { op: 'ask', cid: 'u1', id: 'q1', text: 'Why?' });
  assert.deepEqual(parseAsk({ t: 'up', cid: 'u1', id: 'q1', q: 'q3' }, prompts), { op: 'up', cid: 'u1', id: 'q1', q: 'q3' });
  assert.equal(parseAsk({ t: 'ask', cid: 'u1', id: 'c1', text: 'Why?' }, prompts), null, 'not a Q&A');
  assert.equal(parseAsk({ t: 'up', cid: 'u1', id: 'q1', q: 'x'.repeat(30) }, prompts), null);
  assert.equal(parseVote({ t: 'vote', cid: 'u1', id: 'c1', picks: [0] }, prompts), null, 'cannot vote on a cloud');
  assert.deepEqual(parseVote({ t: 'vote', cid: 'u1', id: 't1', picks: [3] }, prompts).picks, [3]);
});

test('state from the network keeps the new kinds and drops junk', () => {
  const s = cleanAudienceState({
    t: 'state', prompts: [cloud, open, qna, rank, { id: 'x', kind: 'rating', options: ['1'] }, { id: 'y', kind: 'wat', options: ['a', 'b'] }],
    counts: { r1: [3, 1, 5] },
    data: { c1: [['trust', 3], ['bad', 'x'], 'junk'], o1: ['hello', 5], q1: [{ id: 'q1', text: 'Why?', votes: 4, answered: true }, { id: 9 }] },
  });
  assert.deepEqual(s.prompts.map((p) => p.kind), ['cloud', 'open', 'qna', 'ranking', 'poll'].slice(0, 5).map((k, i) => (i === 4 ? 'poll' : k)));
  assert.deepEqual(s.data.c1, [['trust', 3]]);
  assert.deepEqual(s.data.o1, ['hello']);
  assert.deepEqual(s.data.q1, [{ id: 'q1', text: 'Why?', votes: 4, answered: true }]);
  assert.deepEqual(s.counts.r1, [3, 1, 5]);
  assert.equal(cleanPrompt({ id: 'z', kind: 'cloud', options: [], limit: 99 }).limit, 3, 'out-of-range limits fall back');
});

test('the new blocks become prompts, and answer keys still never leave the page', () => {
  const { deck } = normalizeDeck({ slides: [{ id: 's', layout: 'content', blocks: [
    { type: 'wordcloud', slot: 'body', props: { question: 'One word?', limit: 2 } },
    { type: 'open-answers', slot: 'body', props: { question: 'Thoughts?' } },
    { type: 'rating', slot: 'body', props: { question: 'Rate it', max: 7, low: 'bad', high: 'good' } },
    { type: 'ranking', slot: 'body', props: { question: 'Order', items: [{ text: 'a' }, { text: 'b' }] } },
    { type: 'qna', slot: 'body', props: { question: 'Ask' } },
  ] }] });
  const prompts = collectPrompts(deck.slides[0]);
  assert.deepEqual(prompts.map((p) => p.kind), ['cloud', 'open', 'rating', 'ranking', 'qna']);
  assert.equal(prompts[0].limit, 2);
  assert.deepEqual(prompts[2].options, ['1', '2', '3', '4', '5', '6', '7']);
  assert.deepEqual([prompts[2].low, prompts[2].high], ['bad', 'good']);
});

// ---- the host, end to end -------------------------------------------------------

function hub() {
  const channels = new Map();
  return {
    transport() {
      return {
        open(name, { onMessage, onStatus }) {
          const me = { onMessage, send(m) { for (const peer of channels.get(name) ?? []) if (peer !== me) peer.onMessage(JSON.parse(JSON.stringify(m))); }, close() { channels.get(name)?.delete(me); } };
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
const wait = (ms = 330) => new Promise((r) => setTimeout(r, ms));

test('host: a whole session of every kind, and the results file', async () => {
  const { deck } = normalizeDeck({ meta: { title: 'Town hall' }, slides: [{ id: 's', layout: 'content', blocks: [
    { id: 'wc', type: 'wordcloud', slot: 'body', props: { question: 'One word?', limit: 2 } },
    { id: 'oa', type: 'open-answers', slot: 'body', props: { question: 'Thoughts?' } },
    { id: 'rt', type: 'rating', slot: 'body', props: { question: 'Rate it', max: 5 } },
    { id: 'rk', type: 'ranking', slot: 'body', props: { question: 'Order', items: [{ text: 'a' }, { text: 'b' }, { text: 'c' }] } },
    { id: 'qa', type: 'qna', slot: 'body', props: { question: 'Ask' } },
  ] }] });
  const h = hub();
  const room = newRoom();
  const host = new LiveHost({ transport: h.transport(), room, title: 'Town hall', plan: 'advanced' });
  host.start();
  after(() => host.stop());
  const subs = new Set();
  const player = { deck, state: { slide: 0, step: 0 }, nav: { stepCounts: [0] }, subscribe: (fn) => { subs.add(fn); return () => subs.delete(fn); }, next() {}, prev() {}, first() {}, last() {} };
  host.attach(player);
  await wait(10);
  const got = [];
  const ch = h.transport().open(`is-a-${room.code}`, { onMessage: (m) => got.push(m), onStatus() {} });

  ch.send({ t: 'text', cid: 'u1', id: 'wc', text: 'Trust' });
  ch.send({ t: 'text', cid: 'u2', id: 'wc', text: 'trust' });
  ch.send({ t: 'text', cid: 'u2', id: 'wc', text: 'speed' });
  ch.send({ t: 'text', cid: 'u2', id: 'wc', text: 'third' }); // over the limit
  ch.send({ t: 'text', cid: 'u1', id: 'oa', text: 'More examples please' });
  ch.send({ t: 'vote', cid: 'u1', id: 'rt', picks: [3] });
  ch.send({ t: 'vote', cid: 'u2', id: 'rt', picks: [4] });
  ch.send({ t: 'vote', cid: 'u1', id: 'rk', picks: [2, 1, 0] });
  ch.send({ t: 'ask', cid: 'u1', id: 'qa', text: 'When does it ship?' });
  ch.send({ t: 'ask', cid: 'u2', id: 'qa', text: 'Is there a free plan?' });
  await wait();
  const q = host.questions('qa');
  ch.send({ t: 'up', cid: 'u3', id: 'qa', q: q[1].id });
  ch.send({ t: 'up', cid: 'u4', id: 'qa', q: q[1].id });
  ch.send({ t: 'text', cid: 'u9', id: 'rt', text: 'nope' }); // text sent to a rating is ignored
  await wait();

  assert.deepEqual(host.words('wc'), [['trust', 2], ['speed', 1]]);
  assert.deepEqual(host.responses('oa'), ['More examples please']);
  assert.deepEqual(host.counts('rt', 5), [0, 0, 0, 1, 1]);
  assert.deepEqual(host.ranking('rk', 3), [0, 1, 2]);
  assert.equal(host.questions('qa')[0].text, 'Is there a free plan?', 'three votes beat one');

  const state = got.filter((m) => m.t === 'state').at(-1);
  assert.deepEqual(state.data.wc, [['trust', 2], ['speed', 1]]);
  assert.deepEqual(state.counts.rk, [0, 1, 2]);
  assert.equal(state.data.qa[0].votes, 3);
  assert.deepEqual(state.prompts.map((p) => p.kind), ['cloud', 'open', 'rating', 'ranking', 'qna']);

  host.moderate('qa', q[0].id, 'hide');
  await wait();
  assert.equal(got.filter((m) => m.t === 'state').at(-1).data.qa.length, 1, 'hidden questions stop reaching phones');

  assert.ok(host.submitText('wc', 'presenter word'));
  assert.ok(host.ask('qa', 'From the stage'));
  const csv = host.exportResults();
  assert.ok(csv.startsWith('﻿'));
  for (const piece of ['Word cloud', 'trust,2', 'Open answers', 'More examples please', 'Average,4.5', 'Ranking', 'place 1', 'Q&A', 'Is there a free plan?,3']) assert.ok(csv.includes(piece), piece);
  host.resetVotes('wc');
  assert.deepEqual(host.words('wc'), []);
  host.stop();
});

test('results files cannot run formulas or break their columns', () => {
  assert.equal(cell('=SUM(A1)'), "'=SUM(A1)");
  assert.equal(cell('+1'), "'+1");
  assert.equal(cell('@x'), "'@x");
  assert.equal(cell('a,b'), '"a,b"');
  assert.equal(cell('say "hi"'), '"say ""hi"""');
  assert.equal(cell('line\nbreak'), '"line\nbreak"');
  assert.equal(cell(null), '');
  assert.equal(cell(0), '0');
  const b = new Boards();
  b.addResponse('o1', 'u', '=HYPERLINK("http://evil")');
  const csv = resultsCsv([{ prompt: open, slide: 2 }], new Tally(), b);
  assert.ok(csv.includes(`"'=HYPERLINK(""http://evil"")"`));
  assert.ok(!/^=/m.test(csv));
});

test('word clouds size words by how common they are and keep a stable order', () => {
  const words = [['big', 9], ['small', 1], ['mid', 4]];
  const laid = layoutWords(words);
  const by = Object.fromEntries(laid.map((w) => [w.word, w.scale]));
  assert.ok(by.big > by.mid && by.mid > by.small);
  assert.ok(by.big <= 3 && by.small >= 0.75);
  assert.deepEqual(layoutWords(words).map((w) => w.word), laid.map((w) => w.word), 'the same order every time');
  assert.deepEqual(layoutWords([]), []);
  assert.equal(average([0, 0, 0, 0, 0]), 0);
  assert.equal(average([1, 0, 0, 0, 1]), 3);
});

// ---- plans decide what a room can do ----------------------------------------------------

const slideWith = (blocks) => normalizeDeck({ slides: [{ id: 's', layout: 'content', blocks: blocks.map((b) => ({ slot: 'body', ...b })) }] }).deck;
function runHost(deck, plan) {
  const h = hub();
  const room = newRoom();
  const host = new LiveHost({ transport: h.transport(), room, plan });
  host.start();
  const player = { deck, state: { slide: 0, step: 0 }, nav: { stepCounts: [0] }, subscribe: () => () => {}, next() {}, prev() {}, first() {}, last() {} };
  host.attach(player);
  const msgs = [];
  const ch = h.transport().open(`is-a-${room.code}`, { onMessage: (m) => msgs.push(m), onStatus() {} });
  return { host, ch, msgs };
}

test('a free room sends polls and ratings to phones but holds back word clouds and Q&A', async () => {
  const deck = slideWith([
    { id: 'poll1', type: 'poll', props: { question: 'Q', options: [{ text: 'A' }, { text: 'B' }] } },
    { id: 'wc1', type: 'wordcloud', props: { question: 'Words?' } },
    { id: 'rt1', type: 'rating', props: { question: 'Rate' } },
    { id: 'qa1', type: 'qna', props: { question: 'Ask' } },
  ]);
  const { host, ch, msgs } = runHost(deck, 'free');
  after(() => host.stop());
  await wait(10);
  assert.deepEqual(host.prompts.map((p) => p.kind), ['poll', 'rating']);
  assert.ok(host.isLocked('wc1') && host.isLocked('qa1') && !host.isLocked('poll1'));
  ch.send({ t: 'text', cid: 'u1', id: 'wc1', text: 'sneaky' });
  ch.send({ t: 'ask', cid: 'u1', id: 'qa1', text: 'sneaky?' });
  await wait();
  assert.deepEqual(host.words('wc1'), [], 'a locked question takes no answers even if a phone sends one');
  assert.deepEqual(host.questions('qa1'), []);
  assert.deepEqual(msgs.filter((m) => m.t === 'state').at(-1).prompts.map((p) => p.kind), ['poll', 'rating']);
  host.setPlan('starter'); // a purchase goes through
  await wait();
  assert.deepEqual(host.prompts.map((p) => p.kind), ['poll', 'cloud', 'rating', 'qna']);
  assert.ok(!host.isLocked('wc1'));
  ch.send({ t: 'text', cid: 'u1', id: 'wc1', text: 'now fine' });
  await wait();
  assert.deepEqual(host.words('wc1'), [['now fine', 1]]);
});

test('a room holds as many phones as the plan allows; the next is told it is full; those inside keep working', async () => {
  const deck = slideWith([{ id: 'poll1', type: 'poll', props: { question: 'Q', options: [{ text: 'A' }, { text: 'B' }] } }]);
  const { host, ch, msgs } = runHost(deck, 'free');
  after(() => host.stop());
  await wait(10);
  assert.equal(host.maxPhones, 25);
  for (let i = 0; i < 25; i++) ch.send({ t: 'vote', cid: `p${i}`, id: 'poll1', picks: [0] });
  await wait(20);
  assert.equal(host.audienceSize, 25);
  ch.send({ t: 'vote', cid: 'late', id: 'poll1', picks: [1] });
  ch.send({ t: 'hello', cid: 'late' });
  ch.send({ t: 'vote', cid: 'late', id: 'poll1', picks: [1] });
  await wait(20);
  assert.deepEqual(host.counts('poll1', 2), [25, 0], 'the 26th phone was not counted');
  const told = msgs.filter((m) => m.t === 'full');
  assert.equal(told.length, 1, 'told once, not on every message');
  assert.deepEqual([told[0].cid, told[0].limit], ['late', 25]);
  ch.send({ t: 'vote', cid: 'p3', id: 'poll1', picks: [1] }); // someone already inside changes their answer
  await wait(20);
  assert.deepEqual(host.counts('poll1', 2), [24, 1]);
  host.setPlan('pro');
  assert.equal(host.maxPhones, 500);
  ch.send({ t: 'vote', cid: 'late', id: 'poll1', picks: [1] });
  await wait(20);
  assert.deepEqual(host.counts('poll1', 2), [24, 2], 'after an upgrade the waiting phone gets in');
});

test('a host created without a plan is the smallest one, not unlimited', () => {
  const host = new LiveHost({ transport: hub().transport(), room: newRoom() });
  assert.equal(host.plan, 'free');
  assert.equal(host.maxPhones, 25);
});
