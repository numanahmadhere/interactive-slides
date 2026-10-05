import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDeck, createSlide } from '../src/core/schema.js';
import { listBlocks, createBlock, walkDeck, sectionKey } from '../src/core/blocks/index.js';
import { isCorrect } from '../src/core/blocks/quiz.js';
import { parseBlanks, matchesAnswer } from '../src/core/blocks/fill-blank.js';
import { buildSrcdoc } from '../src/core/blocks/code-sandbox.js';
import { formatValue } from '../src/core/blocks/calculator.js';
import { shuffled } from '../src/core/blocks/shared.js';
import { getBlock } from '../src/core/blocks/index.js';
import { Session } from '../src/core/session.js';
import { interactiveDeck } from '../src/samples/interactive-deck.js';

test('every block type can be created and survives normalisation unchanged', () => {
  for (const def of listBlocks()) {
    const block = createBlock(def.type);
    const slide = { id: 's1', layout: 'blank', blocks: [{ ...block, slot: 'main' }] };
    const { deck, warnings } = normalizeDeck({ slides: [slide] });
    assert.deepEqual(warnings, [], def.type);
    const again = normalizeDeck(structuredClone(deck)).deck;
    assert.deepEqual(again, deck, def.type);
  }
});

test('the interactive demo deck is valid as written', () => {
  const { warnings } = normalizeDeck(structuredClone(interactiveDeck));
  assert.deepEqual(warnings, []);
});

test('container blocks declare their sections consistently', () => {
  for (const def of listBlocks().filter((d) => d.container)) {
    const props = def.defaults();
    const sections = props[def.container.key];
    assert.ok(Array.isArray(sections), def.type);
    assert.ok(sections.length >= def.container.min && sections.length <= def.container.max, def.type);
    assert.equal(sectionKey({ type: def.type, props }), def.container.key);
  }
});

test('walkDeck reaches blocks nested inside tabs and columns', () => {
  const { deck } = normalizeDeck(structuredClone(interactiveDeck));
  const ids = [];
  walkDeck(deck, (b) => ids.push(b.id));
  assert.ok(ids.includes('i_b7'), 'list inside the third tab');
  assert.ok(ids.includes('i_m4'), 'button inside a column');
});

test('quiz scoring: single choice', () => {
  const choices = [{ correct: false }, { correct: true }, { correct: false }];
  assert.equal(isCorrect(choices, 'single', [1]), true);
  assert.equal(isCorrect(choices, 'single', [0]), false);
  assert.equal(isCorrect(choices, 'single', []), false);
  assert.equal(isCorrect(choices, 'single', [1, 2]), false);
});

test('quiz scoring: multiple choice needs exactly the right set', () => {
  const choices = [{ correct: true }, { correct: false }, { correct: true }];
  assert.equal(isCorrect(choices, 'multiple', [2, 0]), true);
  assert.equal(isCorrect(choices, 'multiple', [0]), false);
  assert.equal(isCorrect(choices, 'multiple', [0, 1, 2]), false);
  assert.equal(isCorrect([{ correct: false }, { correct: false }], 'multiple', [0]), false);
});

test('quiz normalisation keeps at least two choices and caps at eight', () => {
  const norm = (choices) => normalizeDeck({ slides: [{ layout: 'blank', blocks: [{ type: 'quiz', slot: 'main', props: { choices } }] }] })
    .deck.slides[0].blocks[0].props.choices;
  assert.equal(norm([{ text: 'only' }]).length, 2);
  assert.equal(norm(Array.from({ length: 20 }, (_, i) => ({ text: String(i) }))).length, 8);
  assert.equal(norm('nonsense').length, 2);
});

test('hotspot positions are clamped to the image', () => {
  const { deck } = normalizeDeck({ slides: [{ layout: 'blank', blocks: [{ type: 'hotspots', slot: 'main', props: { spots: [{ x: -20, y: 150, title: 'a' }, { x: 'abc', y: 33.333 }] } }] }] });
  const [a, b] = deck.slides[0].blocks[0].props.spots;
  assert.deepEqual([a.x, a.y], [0, 100]);
  assert.deepEqual([b.x, b.y], [50, 33.3]);
});

test('tabs and accordion keep their minimum sections and strip nothing else', () => {
  const norm = (type, props) => normalizeDeck({ slides: [{ layout: 'blank', blocks: [{ type, slot: 'main', props }] }] }).deck.slides[0].blocks[0].props;
  assert.equal(norm('tabs', { tabs: [{ title: 'Only' }] }).tabs.length, 2);
  assert.equal(norm('tabs', { tabs: Array.from({ length: 12 }, () => ({ title: 'x' })) }).tabs.length, 6);
  assert.equal(norm('accordion', { items: [] }).items.length, 1);
});

test('button actions and targets are validated', () => {
  const norm = (props) => normalizeDeck({ slides: [{ layout: 'blank', blocks: [{ type: 'button', slot: 'main', props }] }] }).deck.slides[0].blocks[0].props;
  assert.equal(norm({ action: 'launch-missiles' }).action, 'next');
  assert.equal(norm({ action: 'slide', slide: 's_x' }).slide, 's_x');
});

test('session keeps state per block and clears selectively', () => {
  const s = new Session();
  s.get('a', () => ({ n: 1 })).n++;
  assert.equal(s.get('a').n, 2);
  assert.equal(s.peek('missing'), undefined);
  s.get('b');
  s.clear((id) => id === 'a');
  assert.equal(s.peek('a'), undefined);
  assert.ok(s.peek('b'));
});

test('createSlide starter content still works for every layout', () => {
  for (const layout of ['title', 'content', 'two-column', 'image-text', 'full-bleed', 'blank', 'section']) {
    assert.ok(createSlide(layout).id);
  }
});

test('parseBlanks splits text and answers, with alternatives', () => {
  assert.deepEqual(parseBlanks('A [b] c [d|e, f] g'), [
    { text: 'A ' }, { answers: ['b'] }, { text: ' c ' }, { answers: ['d', 'e, f'] }, { text: ' g' },
  ]);
  assert.deepEqual(parseBlanks('no blanks'), [{ text: 'no blanks' }]);
  assert.deepEqual(parseBlanks('[]'), [{ text: '[]' }], 'empty brackets are text');
});

test('matchesAnswer ignores case and spacing', () => {
  assert.equal(matchesAnswer(['Paris', 'paree'], '  PARIS '), true);
  assert.equal(matchesAnswer(['new  york'], 'New York'), true);
  assert.equal(matchesAnswer(['1920'], '1,920'), false);
  assert.equal(matchesAnswer(['a'], ''), false);
});

test('which blocks count toward the score', () => {
  const scored = listBlocks().filter((d) => d.scored).map((d) => d.type).sort();
  assert.deepEqual(scored, ['fill-blank', 'matching', 'ordering', 'quiz']);
});

test('shuffled is a permutation and never the identity', () => {
  for (let n = 2; n <= 8; n++) {
    for (let r = 0; r < 25; r++) {
      const s = shuffled(n);
      assert.deepEqual([...s].sort((a, b) => a - b), Array.from({ length: n }, (_, i) => i));
      assert.ok(s.some((v, i) => v !== i));
    }
  }
  assert.deepEqual(shuffled(1), [0]);
});

test('code sandbox document is locked down and cannot be closed early', () => {
  const doc = buildSrcdoc({ html: '<b>x</b>', css: 'a{}</style><p>escaped?</p>', js: 'var s = "</script><img src=x>";' });
  assert.match(doc, /Content-Security-Policy/);
  assert.match(doc, /default-src 'none'/);
  assert.equal((doc.match(/<\/style>/g) ?? []).length, 1, 'only the builder closes the style element');
  assert.equal((doc.match(/<\/script>/g) ?? []).length, 2, 'only the builder closes its two script elements');
  assert.ok(doc.includes('<\\/style><p>escaped?'), 'user </style is neutralised');
  assert.ok(doc.includes('<\\/script><img src=x>'), 'user </script is neutralised');
});

test('calculator: formatting and normalisation', () => {
  assert.equal(formatValue(1234.5, { decimals: 1 }), '1,234.5');
  assert.equal(formatValue(0.256, { format: 'percent', decimals: 1 }), '25.6%');
  assert.equal(formatValue(12, { prefix: '$', suffix: ' k' }), '$12 k');
  assert.equal(formatValue(NaN), '\u2013');
  assert.equal(formatValue(Infinity), '\u2013');

  const { deck } = normalizeDeck({ slides: [{ layout: 'blank', blocks: [{ type: 'calculator', slot: 'main', props: {
    inputs: [{ label: 'Total People' }, { label: 'Total People' }, { key: '9bad', label: 'x', value: 500, min: 0, max: 10 }],
  } }] }] });
  const { inputs } = deck.slides[0].blocks[0].props;
  assert.equal(new Set(inputs.map((i) => i.key)).size, 3, 'keys are made unique');
  assert.ok(inputs.every((i) => /^[a-z_][a-z0-9_]*$/.test(i.key)));
  assert.equal(inputs[2].value, 10, 'value is clamped to the range');
});

test('calculator check() flags unknown names and bad formulas', () => {
  const def = getBlock('calculator');
  const base = def.defaults();
  assert.equal(def.check(base), null);
  assert.match(def.check({ ...base, outputs: [{ ...base.outputs[0], formula: 'people * nope' }] }), /nope/);
  assert.match(def.check({ ...base, outputs: [{ ...base.outputs[0], formula: '1 +' }] }), /ends unexpectedly|Unexpected|Expected/);
});

test('chart check() asks for data; ordering and matching validate their text', () => {
  assert.match(getBlock('chart').check({ data: 'nothing here' }), /No numbers/);
  assert.equal(getBlock('chart').check(getBlock('chart').defaults()), null);
  assert.match(getBlock('ordering').check({ items: ['a', ' '] }), /Fill in/);
  assert.match(getBlock('matching').check({ pairs: [{ left: 'a', right: '' }, { left: 'b', right: 'c' }] }), /both sides/);
  assert.match(getBlock('fill-blank').check({ text: 'no brackets' }), /square brackets/);
});

test('ordering items normalise to plain strings within bounds', () => {
  const norm = (items) => normalizeDeck({ slides: [{ layout: 'blank', blocks: [{ type: 'ordering', slot: 'main', props: { items } }] }] }).deck.slides[0].blocks[0].props.items;
  assert.equal(norm(['a']).length, 2);
  assert.equal(norm(Array.from({ length: 20 }, (_, i) => String(i))).length, 8);
  assert.deepEqual(norm(['x', 5, null, 'y']), ['x', '', '', 'y']);
});

test('a poll shows its results as bars, columns or a donut, and bad values fall back to bars', () => {
  assert.equal(createBlock('poll').props.chart, 'bars');
  const slide = createSlide('free');
  for (const [chart, want] of [['donut', 'donut'], ['columns', 'columns'], ['pie3d', 'bars'], [undefined, 'bars']]) {
    const block = createBlock('poll');
    block.props.chart = chart;
    const deck = { meta: { title: 'T' }, slides: [{ ...slide, blocks: [block] }] };
    assert.equal(normalizeDeck(deck).deck.slides[0].blocks[0].props.chart, want);
  }
});
