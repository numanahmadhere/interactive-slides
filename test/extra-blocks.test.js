import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { LiveHost } from '../src/live/host.js';
import { newRoom, parsePin, cleanPrompt, cleanAudienceState } from '../src/live/protocol.js';
import { normalizeDeck } from '../src/core/schema.js';
import { parseTable } from '../src/core/blocks/table.js';
import { collectPrompts } from '../src/live/prompts.js';
import { canUseKind } from '../src/billing/plans.js';

function hub() {
  const channels = new Map();
  return { transport: () => ({ open(name, { onMessage, onStatus }) { const me = { onMessage, send(m) { for (const p of channels.get(name) ?? []) if (p !== me) p.onMessage(JSON.parse(JSON.stringify(m))); }, close() { channels.get(name)?.delete(me); } }; if (!channels.has(name)) channels.set(name, new Set()); channels.get(name).add(me); queueMicrotask(() => onStatus('connected')); return me; }, close() {} }) };
}
const wait = (ms = 330) => new Promise((r) => setTimeout(r, ms));
const slide = (blocks) => normalizeDeck({ slides: [{ id: 's', layout: 'content', blocks: blocks.map((b) => ({ slot: 'body', ...b })) }] }).deck;

test('tables read rows from pipes or pasted spreadsheet tabs, and pad ragged rows', () => {
  assert.deepEqual(parseTable('A | B | C\n1 | 2'), [['A', 'B', 'C'], ['1', '2', '']]);
  assert.deepEqual(parseTable('x\ty\n1\t2\n\n'), [['x', 'y'], ['1', '2']]);
  assert.deepEqual(parseTable(''), []);
  assert.equal(parseTable(Array.from({ length: 80 }, () => 'a|b').join('\n')).length, 30);
});

test('new blocks survive the deck gate with their props intact', () => {
  const deck = slide([
    { id: 't', type: 'table', props: { data: 'a | b', header: false } },
    { id: 'm', type: 'matrix', props: { xLabel: 'X', tl: 'Top' } },
    { id: 'r', type: 'reactions', props: { question: 'Ok?', options: [{ text: 'Yes' }, { text: 'No' }] } },
    { id: 'p', type: 'pin', props: { question: 'Where?' } },
  ]);
  const types = deck.slides[0].blocks.map((b) => b.type);
  assert.deepEqual(types, ['table', 'matrix', 'reactions', 'pin']);
  assert.equal(deck.slides[0].blocks[0].props.header, false);
});

test('reactions become a free poll for phones; pins need a paid plan', () => {
  const deck = slide([{ id: 'r', type: 'reactions', props: { options: [{ text: 'Agree' }, { text: 'Hand up' }] } }, { id: 'p', type: 'pin', props: { question: 'Where?' } }]);
  const prompts = collectPrompts(deck.slides[0]);
  assert.deepEqual(prompts.map((p) => p.kind), ['poll', 'pin']);
  assert.deepEqual(prompts[0].options, ['Agree', 'Hand up']);
  assert.ok(canUseKind('free', 'poll') && !canUseKind('free', 'pin') && canUseKind('starter', 'pin'));
});

test('a pin message is only accepted for a pin prompt, with coordinates in range', () => {
  const prompts = [{ id: 'p', kind: 'pin' }, { id: 'q', kind: 'poll', options: ['a', 'b'] }];
  assert.deepEqual(parsePin({ t: 'pin', cid: 'u1', id: 'p', x: 10, y: 990 }, prompts), { cid: 'u1', id: 'p', x: 10, y: 990 });
  for (const bad of [{ id: 'q', x: 1, y: 1 }, { id: 'p', x: -1, y: 5 }, { id: 'p', x: 1001, y: 5 }, { id: 'p', x: 1.5, y: 5 }, { id: 'p', x: '5', y: 5 }, { id: 'nope', x: 1, y: 1 }]) {
    assert.equal(parsePin({ t: 'pin', cid: 'u1', ...bad }, prompts), null, JSON.stringify(bad));
  }
});

test('only a small JPEG data URL is accepted as the pin picture', () => {
  const ok = 'data:image/jpeg;base64,/9j/4AAQ';
  assert.equal(cleanPrompt({ id: 'p', kind: 'pin', question: '?', image: ok, ratio: 2 }).image, ok);
  for (const bad of ['https://evil.example/x.jpg', 'data:image/svg+xml;base64,PHN2Zz4=', 'javascript:alert(1)', `data:image/jpeg;base64,${'A'.repeat(50000)}`]) {
    assert.equal(cleanPrompt({ id: 'p', kind: 'pin', question: '?', image: bad }).image, '', bad.slice(0, 30));
  }
  assert.deepEqual(cleanAudienceState({ t: 'state', prompts: [{ id: 'p', kind: 'pin' }], data: { p: [[1, 2], [5000, 1], 'x', [3, 4]] } }).data.p, [[1, 2], [3, 4]]);
});

test('phones place one pin each; moving it replaces it; the picture reaches phones', async () => {
  const deck = slide([{ id: 'p', type: 'pin', props: { question: 'Where?' } }]);
  const h = hub();
  const room = newRoom();
  const host = new LiveHost({ transport: h.transport(), room, plan: 'starter' });
  host.start();
  after(() => host.stop());
  host.attach({ deck, state: { slide: 0, step: 0 }, nav: { stepCounts: [0] }, subscribe: () => () => {}, next() {}, prev() {}, first() {}, last() {} });
  const msgs = [];
  const ch = h.transport().open(`is-a-${room.code}`, { onMessage: (m) => msgs.push(m), onStatus() {} });
  await wait(10);
  host.setImage('p', 'data:image/jpeg;base64,/9j/4AAQ', 1.78);
  ch.send({ t: 'pin', cid: 'u1', id: 'p', x: 100, y: 200 });
  ch.send({ t: 'pin', cid: 'u2', id: 'p', x: 500, y: 500 });
  ch.send({ t: 'pin', cid: 'u1', id: 'p', x: 900, y: 100 });
  await wait();
  assert.deepEqual(host.pins('p').sort((a, b) => a[0] - b[0]), [[500, 500], [900, 100]]);
  const state = msgs.filter((m) => m.t === 'state').at(-1);
  assert.equal(state.prompts[0].image, 'data:image/jpeg;base64,/9j/4AAQ');
  assert.equal(state.prompts[0].ratio, 1.78);
  assert.equal(state.data.p.length, 2);
  assert.ok(host.hasAnswers);
  assert.match(host.exportResults(), /Pin on image,Where\?,50% across, 50% down|"50% across, 50% down"/);
  assert.equal(host.report().questions[0].pins.length, 2);
  host.resetVotes('p');
  assert.deepEqual(host.pins('p'), []);
});

test('on the free plan the phone never gets a pin prompt', async () => {
  const deck = slide([{ id: 'p', type: 'pin', props: { question: 'Where?' } }]);
  const h = hub();
  const room = newRoom();
  const host = new LiveHost({ transport: h.transport(), room, plan: 'free' });
  host.start();
  after(() => host.stop());
  host.attach({ deck, state: { slide: 0, step: 0 }, nav: { stepCounts: [0] }, subscribe: () => () => {}, next() {}, prev() {}, first() {}, last() {} });
  const msgs = [];
  const ch = h.transport().open(`is-a-${room.code}`, { onMessage: (m) => msgs.push(m), onStatus() {} });
  await wait(10);
  ch.send({ t: 'pin', cid: 'u1', id: 'p', x: 1, y: 1 });
  await wait();
  assert.deepEqual(host.pins('p'), []);
  assert.deepEqual(msgs.filter((m) => m.t === 'state').at(-1).prompts, []);
});
