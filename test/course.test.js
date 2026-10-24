import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isComplete, certificateHtml, completionsCsv, loadProgress, saveProgress } from '../src/cloud/course.js';
import { normalizeDeck } from '../src/core/schema.js';
import { setCourse } from '../src/editor/ops.js';
import { canSelfPace } from '../src/billing/plans.js';

const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };

test('a course is complete only when every slide has been seen', () => {
  assert.ok(!isComplete([0, 1], 3));
  assert.ok(isComplete([2, 0, 1, 1], 3));
  assert.ok(!isComplete([5, 6, 7], 3), 'numbers outside the deck do not count');
  assert.ok(!isComplete([], 0));
});

test('progress is kept per link and survives bad stored data', () => {
  const s = memory();
  saveProgress('A'.repeat(22), { seen: [0, 1], name: 'Sam', done: false }, s);
  assert.deepEqual(loadProgress('A'.repeat(22), s), { seen: [0, 1], name: 'Sam', done: false });
  assert.deepEqual(loadProgress('B'.repeat(22), s), { seen: [], name: '', done: false });
  s.setItem(`is-course-${'C'.repeat(12)}`, '{not json');
  assert.deepEqual(loadProgress('C'.repeat(22), s), { seen: [], name: '', done: false });
});

test('the certificate escapes whatever the visitor typed', () => {
  const html = certificateHtml({ name: '<img src=x onerror=alert(1)>', course: 'Safety "101"', date: new Date('2026-03-04T10:00:00Z') });
  assert.ok(!html.includes('<img'));
  assert.match(html, /&lt;img src=x/);
  assert.match(html, /4 March 2026/);
  assert.match(html, /Safety &quot;101&quot;/);
});

test('the completions file defuses spreadsheet formulas', () => {
  const csv = completionsCsv([{ name: '=HYPERLINK("x")', completed_at: '2026-03-04T10:00:00Z' }, { name: 'Ana, B', completed_at: '2026-03-05T10:00:00Z' }]);
  assert.match(csv, /"'=HYPERLINK\(""x""\)"|'=HYPERLINK/);
  assert.match(csv, /"Ana, B"/);
});

test('the course switch lives on the deck, and survives the gate', () => {
  const { deck } = normalizeDeck({ slides: [], course: { on: true, certificate: false } });
  assert.deepEqual(deck.course, { on: true, certificate: false });
  assert.deepEqual(normalizeDeck({ slides: [], course: 'junk' }).deck.course, { on: false, certificate: true });
  assert.equal(setCourse(deck, { on: false }).course.on, false);
  assert.equal(setCourse(deck, { on: true }), deck);
  assert.ok(canSelfPace('free'));
});
