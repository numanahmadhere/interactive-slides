import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Poll, cleanOptions, cleanQuestion, pickWeighted, crowdWeights, STEPS, MAX_OPTIONS, CROWD_SIZE } from '../site/tutorial.js';

// A seeded random source so the "crowd" is the same in every run.
const seeded = (seed) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };

test('options are trimmed, de-duplicated, capped, and never fewer than two', () => {
  assert.deepEqual(cleanOptions(['  A  ', 'a', '', 'B', null, 'C', 'D', 'E']), ['A', 'B', 'C', 'D']);
  assert.equal(cleanOptions(['a', 'b', 'c', 'd', 'e', 'f']).length, MAX_OPTIONS);
  assert.deepEqual(cleanOptions([]), ['Option A', 'Option B']);
  assert.deepEqual(cleanOptions(['Only']), ['Only', 'Option A']);
  assert.deepEqual(cleanOptions('not an array'), ['Option A', 'Option B']);
  assert.equal(cleanOptions(['x'.repeat(200), 'y'])[0].length, 60);
  assert.equal(cleanQuestion('   '), 'Which topic should we cover first?');
  assert.equal(cleanQuestion('a\n  b'), 'a b');
  assert.equal(cleanQuestion('q'.repeat(500)).length, 120);
});

test('your vote counts once and can be changed', () => {
  const p = new Poll('Q', ['A', 'B', 'C']);
  assert.equal(p.total, 0);
  assert.equal(p.percent(0), 0);
  assert.equal(p.leader, null);
  p.setYou(1);
  assert.deepEqual(p.counts, [0, 1, 0]);
  p.setYou(2);
  assert.deepEqual(p.counts, [0, 0, 1], 'changing your answer moves the vote');
  p.setYou(9);
  p.setYou(-1);
  p.setYou('x');
  assert.equal(p.you, 2, 'impossible answers are ignored');
  assert.equal(p.total, 1);
});

test('the crowd adds up and percentages stay sensible', () => {
  const p = new Poll('Q', ['A', 'B', 'C']);
  const weights = crowdWeights(3);
  assert.ok(weights[0] > weights[1] && weights[1] > weights[2], 'the room leans to the first options');
  const rand = seeded(7);
  for (let i = 0; i < CROWD_SIZE; i++) p.addCrowd(pickWeighted(weights, rand));
  p.setYou(2);
  assert.equal(p.total, CROWD_SIZE + 1);
  const pct = p.options.map((_, i) => p.percent(i));
  assert.ok(Math.abs(pct.reduce((a, b) => a + b, 0) - 100) <= 2, `percentages sum to about 100: ${pct}`);
  assert.equal(p.leader, p.counts.indexOf(Math.max(...p.counts)));
  p.addCrowd(99);
  p.addCrowd(-3);
  assert.equal(p.total, CROWD_SIZE + 1, 'out-of-range votes are ignored');
});

test('weighted picking covers the whole range and respects the weights', () => {
  assert.equal(pickWeighted([1, 0, 0], () => 0.99), 0);
  assert.equal(pickWeighted([0, 0, 1], () => 0), 2);
  assert.equal(pickWeighted([1, 1], () => 0.5), 1);
  const rand = seeded(3);
  const hits = [0, 0];
  for (let i = 0; i < 2000; i++) hits[pickWeighted([3, 1], rand)]++;
  assert.ok(hits[0] > hits[1] * 2, `3:1 weights give roughly 3:1 picks (${hits})`);
});

test('editing the wording keeps votes where the options still exist', () => {
  const p = new Poll('Q', ['A', 'B', 'C']);
  p.addCrowd(0); p.addCrowd(2); p.setYou(2);
  p.edit('New question?', ['A', 'B']);
  assert.equal(p.question, 'New question?');
  assert.deepEqual(p.options, ['A', 'B']);
  assert.equal(p.you, null, 'your vote was on an option that no longer exists');
  assert.deepEqual(p.crowd, [1, 0]);
  p.edit('', ['', '']);
  assert.equal(p.question, 'Which topic should we cover first?');
  assert.deepEqual(p.options, ['Option A', 'Option B']);
  p.reset();
  assert.equal(p.total, 0);
});

test('the four steps are in order and have text', () => {
  assert.deepEqual(STEPS.map((s) => s.id), [1, 2, 3, 4]);
  for (const s of STEPS) assert.ok(s.title && s.hint && s.task && s.next);
});
