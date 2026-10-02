import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDeck, createSlide } from '../src/core/schema.js';
import { listBlocks, createBlock, walkDeck, sectionKey } from '../src/core/blocks/index.js';
import { isCorrect } from '../src/core/blocks/quiz.js';
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
