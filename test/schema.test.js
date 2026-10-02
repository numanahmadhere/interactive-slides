import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDeck, createDeck, createSlide, DeckError, slideStepValues, slideTitle } from '../src/core/schema.js';
import { listLayouts } from '../src/core/layouts.js';
import { sampleDeck } from '../src/samples/sample-deck.js';

test('rejects input that is not an object', () => {
  assert.throws(() => normalizeDeck(null), DeckError);
  assert.throws(() => normalizeDeck([]), DeckError);
  assert.throws(() => normalizeDeck('x'), DeckError);
});

test('an empty deck gets a title slide', () => {
  const { deck, warnings } = normalizeDeck({});
  assert.equal(deck.slides.length, 1);
  assert.equal(deck.slides[0].layout, 'title');
  assert.ok(warnings.some((w) => /no slides/.test(w)));
});

test('the sample deck is valid as written', () => {
  const { warnings } = normalizeDeck(structuredClone(sampleDeck));
  assert.deepEqual(warnings, []);
});

test('every layout produces a valid starter slide', () => {
  for (const layout of listLayouts()) {
    const { deck, warnings } = normalizeDeck({ slides: [createSlide(layout.id)] });
    assert.deepEqual(warnings, [], layout.id);
    assert.equal(deck.slides[0].layout, layout.id);
  }
});

test('normalizing twice changes nothing', () => {
  const once = normalizeDeck(structuredClone(sampleDeck)).deck;
  const twice = normalizeDeck(structuredClone(once)).deck;
  assert.deepEqual(twice, once);
});

test('unknown layout falls back to blank', () => {
  const { deck, warnings } = normalizeDeck({ slides: [{ layout: 'wat', blocks: [] }] });
  assert.equal(deck.slides[0].layout, 'blank');
  assert.equal(warnings.length, 1);
});

test('blocks in a slot the layout lacks move to the body slot', () => {
  const { deck, warnings } = normalizeDeck({
    slides: [{ layout: 'content', blocks: [{ type: 'text', slot: 'sidebar', props: { text: 'hi' } }] }],
  });
  assert.equal(deck.slides[0].blocks[0].slot, 'body');
  assert.ok(warnings.some((w) => /sidebar/.test(w)));
});

test('duplicate ids are repaired', () => {
  const { deck } = normalizeDeck({
    slides: [
      { id: 'a', layout: 'blank', blocks: [{ id: 'x', type: 'text', slot: 'main' }, { id: 'x', type: 'text', slot: 'main' }] },
      { id: 'a', layout: 'blank', blocks: [] },
    ],
  });
  const ids = [deck.slides[0].id, deck.slides[1].id, ...deck.slides[0].blocks.map((b) => b.id)];
  assert.equal(new Set(ids).size, 4);
});

test('unknown block types are kept (forward compatibility) with a warning', () => {
  const { deck, warnings } = normalizeDeck({
    slides: [{ layout: 'blank', blocks: [{ type: 'hologram', slot: 'main', props: { depth: 3 } }] }],
  });
  assert.equal(deck.slides[0].blocks[0].type, 'hologram');
  assert.deepEqual(deck.slides[0].blocks[0].props, { depth: 3 });
  assert.ok(warnings.some((w) => /hologram/.test(w)));
});

test('block props are coerced to valid values', () => {
  const { deck } = normalizeDeck({
    slides: [{ layout: 'blank', blocks: [
      { type: 'heading', slot: 'main', props: { text: 5, level: 9, align: 'sideways' } },
      { type: 'list', slot: 'main', props: { items: 'nope', revealItems: 'yes' } },
    ] }],
  });
  const [heading, list] = deck.slides[0].blocks;
  assert.deepEqual(heading.props, { text: '', level: 3, align: 'start' });
  assert.deepEqual(list.props.items, []);
  assert.equal(list.props.revealItems, false);
});

test('theme: unknown id falls back, hostile overrides are dropped', () => {
  const { deck, warnings } = normalizeDeck({
    theme: { id: 'nope', overrides: { accent: '#ff0000', bg: 'red; background:url(//evil)', evil: '#fff', fontSans: 'Georgia, serif' } },
    slides: [],
  });
  assert.equal(deck.theme.id, 'densight-dark');
  assert.deepEqual(deck.theme.overrides, { accent: '#ff0000', fontSans: 'Georgia, serif' });
  assert.ok(warnings.length >= 3);
});

test('limits: nesting and slide count', () => {
  let cols = { type: 'text', props: { text: 'deep' } };
  for (let i = 0; i < 6; i++) cols = { type: 'columns', props: { cols: [{ blocks: [cols] }] } };
  const { deck, warnings } = normalizeDeck({ slides: [{ layout: 'blank', blocks: [{ ...cols, slot: 'main' }] }] });
  assert.ok(warnings.some((w) => /too deep/.test(w)));
  assert.equal(deck.slides.length, 1);

  const many = { slides: Array.from({ length: 600 }, () => ({ layout: 'blank' })) };
  assert.equal(normalizeDeck(many).deck.slides.length, 500);
});

test('slideStepValues collects steps from lists, columns and plain reveals', () => {
  const { deck } = normalizeDeck({
    slides: [{
      layout: 'content',
      blocks: [
        { type: 'list', slot: 'body', props: { items: ['a', 'b', 'c'], revealItems: true } },
        { type: 'text', slot: 'body', props: { text: 'x' }, reveal: 5 },
        { type: 'columns', slot: 'body', props: { cols: [{ blocks: [{ type: 'text', reveal: 2, props: {} }] }, { blocks: [] }] } },
      ],
    }],
  });
  assert.deepEqual(slideStepValues(deck.slides[0]), [1, 2, 3, 5]);
});

test('list with revealItems and a base reveal starts at that step', () => {
  const { deck } = normalizeDeck({
    slides: [{ layout: 'content', blocks: [{ type: 'list', slot: 'body', reveal: 3, props: { items: ['a', 'b'], revealItems: true } }] }],
  });
  assert.deepEqual(slideStepValues(deck.slides[0]), [3, 4]);
});

test('slideTitle uses the first heading, stripped of markup', () => {
  const { deck } = normalizeDeck({
    slides: [
      { layout: 'content', blocks: [{ type: 'heading', slot: 'title', props: { text: 'Q&amp;A <b>time</b>' } }] },
      { layout: 'blank', blocks: [] },
    ],
  });
  assert.equal(slideTitle(deck.slides[0], 0), 'Q&A time');
  assert.equal(slideTitle(deck.slides[1], 1), 'Slide 2');
});

test('createDeck round-trips through normalizeDeck', () => {
  const { deck, warnings } = normalizeDeck(createDeck({ title: 'T' }));
  assert.deepEqual(warnings, []);
  assert.equal(deck.meta.title, 'T');
});
