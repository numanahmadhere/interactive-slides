import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Navigator, parseHash, formatHash } from '../src/player/navigator.js';

// three slides; slide 1 has two reveal steps
const make = (start) => new Navigator([0, 2, 0], start);

test('next walks through steps, then moves to the next slide', () => {
  const nav = make();
  assert.deepEqual(nav.next().to, { slide: 1, step: 0 });
  assert.deepEqual(nav.next().to, { slide: 1, step: 1 });
  assert.deepEqual(nav.next().to, { slide: 1, step: 2 });
  assert.deepEqual(nav.next().to, { slide: 2, step: 0 });
});

test('next at the end is a no-op', () => {
  const nav = make({ slide: 2, step: 0 });
  assert.equal(nav.next(), null);
  assert.deepEqual(nav.state, { slide: 2, step: 0 });
});

test('prev undoes steps, then lands on the earlier slide fully revealed', () => {
  const nav = make({ slide: 2, step: 0 });
  assert.deepEqual(nav.prev().to, { slide: 1, step: 2 });
  assert.deepEqual(nav.prev().to, { slide: 1, step: 1 });
  assert.deepEqual(nav.prev().to, { slide: 1, step: 0 });
  assert.deepEqual(nav.prev().to, { slide: 0, step: 0 });
  assert.equal(nav.prev(), null);
});

test('moves report where they came from', () => {
  const nav = make();
  assert.deepEqual(nav.next(), { from: { slide: 0, step: 0 }, to: { slide: 1, step: 0 } });
});

test('goTo clamps and supports "end"', () => {
  const nav = make();
  assert.deepEqual(nav.goTo(99, 99).to, { slide: 2, step: 0 });
  assert.deepEqual(nav.goTo(1, 'end').to, { slide: 1, step: 2 });
  assert.deepEqual(nav.goTo(-5).to, { slide: 0, step: 0 });
  assert.equal(nav.goTo(0, 0), null);
});

test('first and last', () => {
  const nav = make({ slide: 1, step: 1 });
  assert.deepEqual(nav.last().to, { slide: 2, step: 0 });
  assert.deepEqual(nav.first().to, { slide: 0, step: 0 });
});

test('start position is clamped', () => {
  assert.deepEqual(make({ slide: 50, step: 50 }).state, { slide: 2, step: 0 });
  assert.deepEqual(make({ slide: 1, step: 50 }).state, { slide: 1, step: 2 });
  assert.deepEqual(make({ slide: NaN, step: NaN }).state, { slide: 0, step: 0 });
});

test('setStepCounts: a deleted current slide falls to the nearest one at step 0', () => {
  const nav = make({ slide: 2, step: 0 });
  nav.setStepCounts([0, 1]);
  assert.deepEqual(nav.state, { slide: 1, step: 0 });
  assert.equal(nav.slideCount, 2);
});

test('setStepCounts: the step is clamped when the current slide loses steps', () => {
  const nav = make({ slide: 1, step: 2 });
  nav.setStepCounts([0, 1, 0]);
  assert.deepEqual(nav.state, { slide: 1, step: 1 });
});

test('hash parsing and formatting', () => {
  assert.deepEqual(parseHash('#3'), { slide: 2, step: 0 });
  assert.deepEqual(parseHash('#3.2'), { slide: 2, step: 2 });
  assert.equal(parseHash('#nope'), null);
  assert.equal(parseHash(''), null);
  assert.equal(formatHash({ slide: 2, step: 0 }), '#3');
  assert.equal(formatHash({ slide: 2, step: 2 }), '#3.2');
});
