import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Autoplay } from '../src/player/autoplay.js';
import { formatClock } from '../src/player/clock.js';
import { normalizeDeck } from '../src/core/schema.js';

// A manual clock so scheduling can be driven without waiting.
function fakeTimers() {
  let now = 0;
  let nextId = 1;
  const pending = new Map();
  return {
    setTimeout(fn, ms) { const id = nextId++; pending.set(id, { at: now + ms, fn }); return id; },
    clearTimeout(id) { pending.delete(id); },
    advance(ms) {
      now += ms;
      for (const [id, t] of [...pending]) if (t.at <= now) { pending.delete(id); t.fn(); }
    },
    get pending() { return pending.size; },
  };
}

test('formatClock', () => {
  assert.equal(formatClock(0), '0:00');
  assert.equal(formatClock(65), '1:05');
  assert.equal(formatClock(3599), '59:59');
  assert.equal(formatClock(3661), '1:01:01');
  assert.equal(formatClock(-5), '0:00');
  assert.equal(formatClock(9.9), '0:09');
});

test('autoplay ticks after the delay and only when started', () => {
  const timers = fakeTimers();
  let ticks = 0;
  const a = new Autoplay({ delayFor: () => 5, onTick: () => ticks++, timers });
  timers.advance(10000);
  assert.equal(ticks, 0, 'nothing happens before start');
  a.start();
  timers.advance(4999);
  assert.equal(ticks, 0);
  timers.advance(1);
  assert.equal(ticks, 1);
  timers.advance(60000);
  assert.equal(ticks, 1, 'the owner reschedules with reset(); it does not repeat on its own');
});

test('reset restarts the countdown for the next slide', () => {
  const timers = fakeTimers();
  let ticks = 0;
  const a = new Autoplay({ delayFor: () => 5, onTick: () => ticks++, timers });
  a.start();
  timers.advance(4000);
  a.reset();
  timers.advance(4000);
  assert.equal(ticks, 0, 'the clock started over');
  timers.advance(1000);
  assert.equal(ticks, 1);
});

test('pause, resume and stop', () => {
  const timers = fakeTimers();
  let ticks = 0;
  const a = new Autoplay({ delayFor: () => 3, onTick: () => ticks++, timers });
  a.start();
  a.pause();
  assert.equal(a.paused, true);
  assert.equal(timers.pending, 0);
  timers.advance(10000);
  assert.equal(ticks, 0);
  a.reset();
  assert.equal(timers.pending, 0, 'reset does not wake a paused autoplay');
  a.toggle();
  assert.equal(a.paused, false);
  timers.advance(3000);
  assert.equal(ticks, 1);
  a.stop();
  assert.equal(a.running, false);
  a.reset();
  assert.equal(timers.pending, 0);
});

test('a zero or negative delay schedules nothing', () => {
  const timers = fakeTimers();
  const a = new Autoplay({ delayFor: () => 0, onTick: () => { throw new Error('should not tick'); }, timers });
  a.start();
  assert.equal(timers.pending, 0);
});

test('slide timers and autoplay are normalised', () => {
  const { deck } = normalizeDeck({
    autoplay: { seconds: 99999, loop: false },
    slides: [
      { layout: 'blank', timer: 90, showTimer: true },
      { layout: 'blank', timer: -4, showTimer: true },
      { layout: 'blank', timer: 'abc' },
      { layout: 'blank', timer: 30 },
    ],
  });
  assert.deepEqual(deck.autoplay, { seconds: 3600, loop: false });
  assert.equal(deck.slides[0].timer, 90);
  assert.equal(deck.slides[0].showTimer, true);
  assert.equal('timer' in deck.slides[1], false);
  assert.equal('showTimer' in deck.slides[1], false, 'no timer, so nothing to show');
  assert.equal('timer' in deck.slides[2], false);
  assert.equal('showTimer' in deck.slides[3], false);
  assert.deepEqual(normalizeDeck({}).deck.autoplay, { seconds: 0, loop: true });
});
