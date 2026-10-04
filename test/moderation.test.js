import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { isProfane } from '../src/live/profanity.js';
import { Boards } from '../src/live/boards.js';
import { LiveHost } from '../src/live/host.js';
import { newRoom } from '../src/live/protocol.js';
import { normalizeDeck } from '../src/core/schema.js';

test('plain swearing and the usual spelling tricks are caught', () => {
  for (const bad of ['fuck', 'Shit', 'what the f u c k', 'sh1t', 'f.u.c.k', 'a$$hole', 'fuuuuck', 'you bitch', 'b!tch', 'FUCKING hell']) assert.ok(isProfane(bad), bad);
});

test('ordinary words are left alone, including ones that merely contain a bad word', () => {
  for (const fine of ['Scunthorpe', 'assess the class', 'cockpit', 'Dickens', 'passion', 'title', 'analysis', 'therapist', 'grape', 'classic', 'Essex', 'document', 'shiitake', 'hello world', 'Sussex', 'brilliant idea', '']) assert.ok(!isProfane(fine), fine);
  assert.ok(!isProfane(null) && !isProfane(undefined) && !isProfane(42));
});

test('filter mode drops swearing and counts nothing against the person', () => {
  const b = new Boards();
  assert.equal(b.addEntry('c', 'u1', 'shit', 2), 'filtered');
  assert.equal(b.addEntry('c', 'u1', 'good', 2), 'added');
  assert.equal(b.addEntry('c', 'u1', 'also good', 2), 'added', 'the filtered word did not use up a place');
  assert.deepEqual(b.words('c').map((w) => w[0]).sort(), ['also good', 'good']);
  assert.equal(b.addResponse('o', 'u1', 'this is shit'), 'filtered');
  assert.equal(b.ask('q', 'u1', 'what the fuck'), 'filtered');
  assert.equal(b.addEntry('c', 'u2', 'shit', 2, { mode: 'off' }), 'added', 'off shows everything');
});

test('approve-first holds everything until the presenter lets it through', () => {
  const b = new Boards();
  assert.equal(b.addEntry('c', 'u1', 'maybe', 2, { mode: 'approve' }), 'pending');
  assert.deepEqual(b.words('c'), [], 'nothing shows yet');
  assert.equal(b.addEntry('c', 'u1', 'maybe', 2, { mode: 'approve' }), 'duplicate', 'a held word cannot be sent twice');
  assert.equal(b.addEntry('c', 'u1', 'second', 2, { mode: 'approve' }), 'pending');
  assert.equal(b.addEntry('c', 'u1', 'third', 2, { mode: 'approve' }), 'limit', 'held entries count towards the limit');
  const [first, second] = b.pending('c');
  assert.ok(b.approve('c', first.pid));
  assert.ok(b.reject('c', second.pid));
  assert.deepEqual(b.words('c'), [['maybe', 1]]);
  assert.deepEqual(b.pending('c'), []);
  assert.ok(!b.approve('c', first.pid), 'a decision is made once');
  assert.ok(!b.reject('c', 'nope'));

  assert.equal(b.addResponse('o', 'u1', 'a thought', 1, { mode: 'approve' }), 'pending');
  assert.deepEqual(b.responses('o'), []);
  b.approve('o', b.pending('o')[0].pid);
  assert.deepEqual(b.responses('o'), ['a thought']);

  assert.equal(b.ask('q', 'u1', 'Why?', 5, { mode: 'approve' }), 'pending');
  assert.deepEqual(b.questions('q'), []);
  b.approve('q', b.pending('q')[0].pid);
  assert.deepEqual(b.questions('q').map((x) => x.text), ['Why?']);
  b.reset('c');
  assert.deepEqual(b.pending('c'), []);
});

function hub() {
  const channels = new Map();
  return { transport: () => ({ open(name, { onMessage, onStatus }) { const me = { onMessage, send(m) { for (const p of channels.get(name) ?? []) if (p !== me) p.onMessage(JSON.parse(JSON.stringify(m))); }, close() { channels.get(name)?.delete(me); } }; if (!channels.has(name)) channels.set(name, new Set()); channels.get(name).add(me); queueMicrotask(() => onStatus('connected')); return me; }, close() {} }) };
}
const wait = (ms = 330) => new Promise((r) => setTimeout(r, ms));

test('a room set to approve-first holds phone answers, tells the phone, and shows them once approved', async () => {
  const { deck } = normalizeDeck({ slides: [{ id: 's', layout: 'content', blocks: [
    { id: 'oa', type: 'open-answers', slot: 'body', props: { question: 'Thoughts?', moderation: 'approve' } },
    { id: 'wc', type: 'wordcloud', slot: 'body', props: { question: 'Word?', moderation: 'filter' } },
  ] }] });
  const h = hub();
  const room = newRoom();
  const host = new LiveHost({ transport: h.transport(), room, plan: 'advanced' });
  host.start();
  after(() => host.stop());
  host.attach({ deck, state: { slide: 0, step: 0 }, nav: { stepCounts: [0] }, subscribe: () => () => {}, next() {}, prev() {}, first() {}, last() {} });
  const msgs = [];
  const ch = h.transport().open(`is-a-${room.code}`, { onMessage: (m) => msgs.push(m), onStatus() {} });
  await wait(10);
  ch.send({ t: 'text', cid: 'u1', id: 'oa', text: 'A fair point' });
  ch.send({ t: 'text', cid: 'u2', id: 'wc', text: 'shit' });
  ch.send({ t: 'text', cid: 'u2', id: 'wc', text: 'lovely' });
  await wait();
  assert.deepEqual(host.responses('oa'), [], 'held, not shown');
  assert.equal(host.pending('oa').length, 1);
  assert.deepEqual(host.words('wc'), [['lovely', 1]]);
  const notes = msgs.filter((m) => m.t === 'note');
  assert.deepEqual(notes.map((n) => [n.cid, n.id, n.what]), [['u1', 'oa', 'pending'], ['u2', 'wc', 'filtered']]);
  host.approve('oa', host.pending('oa')[0].pid);
  await wait();
  assert.deepEqual(host.responses('oa'), ['A fair point']);
  assert.deepEqual(msgs.filter((m) => m.t === 'state').at(-1).data.oa, ['A fair point']);
  assert.ok(msgs.filter((m) => m.t === 'state').at(-1).prompts.find((p) => p.id === 'oa').moderation === 'approve');
  assert.ok(host.submitText('wc', 'shit'), 'the presenter is trusted and is never filtered');
});
