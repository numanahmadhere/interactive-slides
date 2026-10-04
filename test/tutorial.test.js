import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CloudDemo, PollDemo, QuizDemo, OpenDemo, makeDemo, quizPoints, cleanWord, cleanText, TYPES, SCENES, JOIN_CODE } from '../site/tutorial.js';
import { buildSite } from '../tools/site.mjs';

const seq = (...v) => { let i = 0; return () => v[i++ % v.length]; };

test('the four question types are listed, in order, and each has a scene and a demo', () => {
  assert.deepEqual(TYPES.map((t) => t.id), ['cloud', 'quiz', 'poll', 'open']);
  for (const t of TYPES) {
    assert.ok(t.name && t.blurb && SCENES[t.id].question, t.id);
    assert.ok(makeDemo(t.id));
  }
  assert.throws(() => makeDemo('nope'));
  assert.equal(JOIN_CODE.length, 6);
});

test('word cloud: words are cleaned, counted, capped per person, and sized by popularity', () => {
  assert.equal(cleanWord('  Hello   WORLD '), 'hello world');
  assert.equal(cleanWord('x'.repeat(50)).length, 24);
  assert.equal(cleanWord(null), '');
  const c = new CloudDemo([['big', 9], ['small', 1]]);
  assert.equal(c.add('   '), null);
  assert.equal(c.add('Mine', true), 'mine');
  assert.equal(c.add('mine', true), null, 'the same word twice does not count again');
  c.add('two', true); c.add('three', true);
  assert.equal(c.add('four', true), null, 'three words per person');
  assert.equal(c.total, 9 + 1 + 3);
  const words = c.layout();
  const big = words.find((w) => w.word === 'big');
  const small = words.find((w) => w.word === 'small');
  assert.ok(big.size > small.size && big.size <= 2.9);
  assert.ok(words.find((w) => w.word === 'mine').mine);
  assert.deepEqual(c.layout().map((w) => w.word), words.map((w) => w.word), 'the cloud does not reshuffle');
  c.crowdStep(['a', 'b']);
  c.crowdStep(['a', 'b']);
  assert.equal(c.counts.get('a'), 1);
  assert.equal(c.counts.get('b'), 1);
});

test('poll: one vote each that can be changed, percentages add up, the room leans to the first options', () => {
  const p = new PollDemo(['A', 'B', 'C'], [1, 1, 1]);
  assert.equal(p.vote(1), true);
  assert.equal(p.vote(1), false, 'same option again changes nothing');
  assert.deepEqual(p.counts, [1, 2, 1]);
  assert.equal(p.vote(2), true);
  assert.deepEqual(p.counts, [1, 1, 2], 'moving your vote takes it from the old option');
  assert.equal(p.total, 4);
  assert.equal(p.vote(9), false);
  assert.equal(p.vote(-1), false);
  assert.equal(p.percent(2), 50);
  const q = new PollDemo(['A', 'B'], [0, 0]);
  q.crowdStep(() => 0); q.crowdStep(() => 0.999);
  assert.deepEqual(q.counts, [1, 1]);
  assert.equal(new PollDemo(['A', 'B'], [0, 0]).percent(0), 0);
});

test('quiz: points fall from 1000 to 500 with time, wrong answers score nothing, answers lock', () => {
  assert.equal(quizPoints(true, 0, 15), 1000);
  assert.equal(quizPoints(true, 15, 15), 500);
  assert.equal(quizPoints(true, 99, 15), 500);
  assert.equal(quizPoints(false, 0, 15), 0);
  const q = new QuizDemo({ options: ['a', 'b', 'c'], correct: 1, timeLimit: 10, room: 2 });
  assert.equal(q.answer(1, 5), true);
  assert.equal(q.points, 750);
  assert.equal(q.answer(0, 6), false, 'the first answer stands');
  assert.equal(q.everyone, false);
  q.crowdStep(() => 0.1); // right
  q.crowdStep(() => 0.9); // wrong
  assert.equal(q.voted, 3);
  assert.equal(q.everyone, true);
  q.crowdStep(() => 0.1);
  assert.equal(q.voted, 3, 'nobody votes past the room');
  q.reveal();
  assert.equal(new QuizDemo({ options: ['a', 'b'], correct: 0, timeLimit: 10, room: 1 }).answer(5), false);
  const late = new QuizDemo({ options: ['a', 'b'], correct: 0, timeLimit: 10, room: 1 });
  late.reveal();
  assert.equal(late.answer(0), false, 'no answers after the reveal');
});

test('open ended: newest first, trimmed, capped, three of your own', () => {
  assert.equal(cleanText('  a   b  '), 'a b');
  const o = new OpenDemo(['first']);
  assert.equal(o.add('   '), null);
  assert.equal(o.add('Mine', true), 'Mine');
  assert.equal(o.items[0].mine, true);
  o.add('2', true); o.add('3', true);
  assert.equal(o.add('4', true), null);
  for (let i = 0; i < 20; i++) o.add(`n${i}`);
  assert.ok(o.items.length <= 8);
  const c = new OpenDemo([]);
  c.crowdStep(['x']); c.crowdStep(['x']);
  assert.equal(c.items.length, 1, 'the simulated room runs out of things to say');
});

test('the home page leads with the tutorial, wired to the script, with the real question types', () => {
  const home = buildSite()['index.html'];
  for (const id of ['id="show"', 'id="show-slide"', 'id="show-phone"', 'id="show-announce"', 'src="/tutorial.js"', 'data-type="cloud"', 'data-type="quiz"', 'data-type="poll"', 'data-type="open"']) assert.ok(home.includes(id), `missing ${id}`);
  const src = readFileSync(new URL('../site/tutorial.js', import.meta.url), 'utf8');
  for (const m of src.matchAll(/\$\('([^']+)'\)/g)) if (m[1].startsWith('#') && m[1] !== '#show-input') assert.ok(home.includes(`id="${m[1].replace(/^#/, '')}"`), `the script looks for ${m[1]}`);
  assert.ok(home.indexOf('id="tutorial"') < home.indexOf('id="compare"'));
  assert.ok(home.includes('paid plan'), 'it says which of these need a paid plan');
  assert.ok(home.includes('<noscript>'), 'a text fallback without JavaScript');
  assert.ok((home.match(/<svg[^>]+role="img"[^>]+aria-label=/g) ?? []).length >= 6, 'block drawings are labelled');
});

test('the script renders typed text as text only, never as markup', () => {
  const src = readFileSync(new URL('../site/tutorial.js', import.meta.url), 'utf8');
  assert.ok(!/innerHTML|insertAdjacentHTML|eval\(|document\.write/.test(src));
});
