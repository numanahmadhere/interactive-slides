import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/editor/store.js';

const d = (n) => ({ n });

test('commit, undo and redo walk the history', () => {
  const s = new Store(d(0));
  s.commit(d(1));
  s.commit(d(2));
  assert.equal(s.deck.n, 2);
  assert.ok(s.undo());
  assert.equal(s.deck.n, 1);
  assert.ok(s.undo());
  assert.equal(s.deck.n, 0);
  assert.equal(s.undo(), false);
  assert.ok(s.redo());
  assert.equal(s.deck.n, 1);
  assert.ok(s.canRedo);
});

test('a new commit clears the redo stack', () => {
  const s = new Store(d(0));
  s.commit(d(1));
  s.undo();
  s.commit(d(5));
  assert.equal(s.canRedo, false);
});

test('committing the same object is a no-op and emits nothing', () => {
  const deck = d(0);
  const s = new Store(deck);
  let calls = 0;
  s.subscribe(() => calls++);
  assert.equal(s.commit(deck), false);
  assert.equal(calls, 0);
  assert.equal(s.canUndo, false);
});

test('commits sharing a coalesce key become one undo step', () => {
  const s = new Store(d(0));
  s.commit(d(1), { coalesce: 'typing' });
  s.commit(d(2), { coalesce: 'typing' });
  s.commit(d(3), { coalesce: 'typing' });
  s.undo();
  assert.equal(s.deck.n, 0);
  assert.equal(s.canUndo, false);
});

test('a different key, or endCoalesce, starts a new step', () => {
  const s = new Store(d(0));
  s.commit(d(1), { coalesce: 'a' });
  s.commit(d(2), { coalesce: 'b' });
  s.endCoalesce();
  s.commit(d(3), { coalesce: 'b' });
  s.undo();
  assert.equal(s.deck.n, 2);
  s.undo();
  assert.equal(s.deck.n, 1);
  s.undo();
  assert.equal(s.deck.n, 0);
});

test('undo ends coalescing so the next edit is its own step', () => {
  const s = new Store(d(0));
  s.commit(d(1), { coalesce: 'k' });
  s.undo();
  s.commit(d(2), { coalesce: 'k' });
  s.commit(d(3), { coalesce: 'k' });
  s.undo();
  assert.equal(s.deck.n, 0);
});

test('listeners get kind, source, and the previous deck', () => {
  const s = new Store(d(0));
  const seen = [];
  const off = s.subscribe((c) => seen.push([c.kind, c.source, c.prev.n, c.deck.n]));
  s.commit(d(1), { source: 'canvas' });
  s.undo();
  s.redo();
  off();
  s.commit(d(9));
  assert.deepEqual(seen, [['commit', 'canvas', 0, 1], ['undo', 'history', 1, 0], ['redo', 'history', 0, 1]]);
});

test('history is capped', () => {
  const s = new Store(d(0), { limit: 3 });
  for (let i = 1; i <= 10; i++) s.commit(d(i));
  let steps = 0;
  while (s.undo()) steps++;
  assert.equal(steps, 3);
  assert.equal(s.deck.n, 7);
});

test('replace swaps the deck and clears history by default', () => {
  const s = new Store(d(0));
  s.commit(d(1));
  s.replace(d(9));
  assert.equal(s.deck.n, 9);
  assert.equal(s.canUndo, false);
});
