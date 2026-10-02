import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDeck, createSlide } from '../src/core/schema.js';
import { createBlock } from '../src/core/blocks/index.js';
import { sampleDeck } from '../src/samples/sample-deck.js';
import * as ops from '../src/editor/ops.js';

const sample = () => normalizeDeck(structuredClone(sampleDeck)).deck;
const idsOf = (deck) => {
  const ids = [];
  const walk = (blocks) => blocks.forEach((b) => {
    ids.push(b.id);
    if (b.type === 'columns') b.props.cols.forEach((c) => walk(c.blocks));
  });
  deck.slides.forEach((s) => { ids.push(s.id); walk(s.blocks); });
  return ids;
};

test('findBlock locates top-level and nested blocks', () => {
  const deck = sample();
  assert.equal(ops.findBlock(deck, 'b_r2').block.type, 'list');
  const nested = ops.findBlock(deck, 'b_n5');
  assert.equal(nested.parent.col, 1);
  assert.equal(nested.parent.block.id, 'b_n2');
  assert.equal(ops.findBlock(deck, 'nope'), null);
});

test('edits share every untouched slide by reference', () => {
  const deck = sample();
  const next = ops.patchBlockProps(deck, 'b_r1', { text: 'Changed' });
  assert.notEqual(next, deck);
  const changed = next.slides.filter((s, i) => s !== deck.slides[i]);
  assert.equal(changed.length, 1);
  assert.equal(ops.findBlock(next, 'b_r1').block.props.text, 'Changed');
  assert.equal(ops.findBlock(deck, 'b_r1').block.props.text, 'One renderer, three modes');
});

test('a no-op returns the same deck object', () => {
  const deck = sample();
  assert.equal(ops.patchBlockProps(deck, 'b_r1', { text: 'One renderer, three modes' }), deck);
  assert.equal(ops.setBlockReveal(deck, 'b_r1', 0), deck);
  assert.equal(ops.setTheme(deck, 'densight-dark'), deck);
  assert.equal(ops.moveSlide(deck, 2, 2), deck);
  assert.equal(ops.patchBlockProps(deck, 'missing', { text: 'x' }), deck);
});

test('nested blocks can be edited and the path above is rebuilt', () => {
  const deck = sample();
  const next = ops.patchBlockProps(deck, 'b_n6', { text: 'New' });
  assert.equal(ops.findBlock(next, 'b_n6').block.props.text, 'New');
  assert.notEqual(ops.findBlock(next, 'b_n2').block, ops.findBlock(deck, 'b_n2').block);
  assert.equal(ops.findBlock(next, 'b_n3').block, ops.findBlock(deck, 'b_n3').block);
});

test('slides: insert, delete (never the last), move', () => {
  let deck = sample();
  const count = deck.slides.length;
  const slide = createSlide('blank');
  deck = ops.insertSlide(deck, 1, slide);
  assert.equal(deck.slides[1].id, slide.id);
  assert.equal(deck.slides.length, count + 1);

  deck = ops.moveSlide(deck, 1, 4);
  assert.equal(deck.slides[4].id, slide.id);
  deck = ops.deleteSlide(deck, slide.id);
  assert.equal(deck.slides.length, count);

  let one = { ...deck, slides: [deck.slides[0]] };
  assert.equal(ops.deleteSlide(one, one.slides[0].id), one);
});

test('duplicating a slide gives every slide and block a fresh id', () => {
  const deck = sample();
  const original = deck.slides[8]; // columns slide
  const next = ops.insertSlide(deck, 9, ops.cloneSlide(original));
  const ids = idsOf(next);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(
    next.slides[9].blocks.map((b) => b.type),
    original.blocks.map((b) => b.type),
  );
});

test('insertBlock appends to a slot, after a block, and into a column', () => {
  let deck = sample();
  const slideId = 's_two';

  deck = ops.insertBlock(deck, slideId, { slot: 'left' }, { ...createBlock('divider'), id: 'new1' });
  const slide = ops.findSlide(deck, slideId).slide;
  assert.deepEqual(slide.blocks.map((b) => b.id), ['b_c1', 'b_c2', 'new1', 'b_c3']);
  assert.equal(slide.blocks[2].slot, 'left');

  deck = ops.insertBlock(deck, slideId, { afterBlockId: 'b_c3' }, { ...createBlock('text'), id: 'new2' });
  assert.equal(ops.findBlock(deck, 'new2').block.slot, 'right');

  deck = ops.insertBlock(deck, 's_cols', { columnOf: 'b_n2', col: 2 }, { ...createBlock('text'), id: 'new3', slot: 'body' });
  const hit = ops.findBlock(deck, 'new3');
  assert.equal(hit.parent.col, 2);
  assert.equal('slot' in hit.block, false);
});

test('removeBlock works at both depths', () => {
  let deck = ops.removeBlock(sample(), 'b_r2');
  assert.equal(ops.findBlock(deck, 'b_r2'), null);
  deck = ops.removeBlock(deck, 'b_n4');
  assert.equal(ops.findBlock(deck, 'b_n4'), null);
  assert.ok(ops.findBlock(deck, 'b_n3'));
});

test('moveBlock swaps within a slot only', () => {
  let deck = sample();
  deck = ops.insertBlock(deck, 's_two', { slot: 'left' }, { ...createBlock('divider'), id: 'extra' });
  // order is title, left text, extra (left), right list. Move "extra" up past b_c2.
  deck = ops.moveBlock(deck, 'extra', -1);
  const ids = ops.findSlide(deck, 's_two').slide.blocks.map((b) => b.id);
  assert.deepEqual(ids, ['b_c1', 'extra', 'b_c2', 'b_c3']);
  assert.equal(ops.moveBlock(deck, 'extra', -1), deck); // already first in its slot
  assert.equal(ops.moveBlock(deck, 'b_c3', 1), deck);   // alone in its slot
});

test('moveBlock inside a column', () => {
  const deck = ops.moveBlock(sample(), 'b_n4', -1);
  const col = ops.findBlock(deck, 'b_n2').block.props.cols[0].blocks.map((b) => b.id);
  assert.deepEqual(col, ['b_n4', 'b_n3']);
});

test('moveBlockToSlot', () => {
  const deck = ops.moveBlockToSlot(sample(), 'b_c2', 'right');
  assert.equal(ops.findBlock(deck, 'b_c2').block.slot, 'right');
  const order = ops.findSlide(deck, 's_two').slide.blocks.filter((b) => b.slot === 'right').map((b) => b.id);
  assert.deepEqual(order, ['b_c3', 'b_c2']);
  assert.equal(ops.moveBlockToSlot(deck, 'b_c2', 'nonsense'), deck);
});

test('duplicateBlock inserts a copy with fresh ids right after the original', () => {
  const deck = ops.duplicateBlock(sample(), 'b_n2'); // the columns block and its children
  const ids = idsOf(deck);
  assert.equal(new Set(ids).size, ids.length);
  const blocks = ops.findSlide(deck, 's_cols').slide.blocks;
  assert.equal(blocks.length, 3);
  assert.equal(blocks[2].type, 'columns');
});

test('setBlockReveal sets and clears', () => {
  let deck = ops.setBlockReveal(sample(), 'b_c2', 3);
  assert.equal(ops.findBlock(deck, 'b_c2').block.reveal, 3);
  deck = ops.setBlockReveal(deck, 'b_c2', 0);
  assert.equal('reveal' in ops.findBlock(deck, 'b_c2').block, false);
  assert.equal(ops.findBlock(ops.setBlockReveal(deck, 'b_c2', 500), 'b_c2').block.reveal, 99);
});

test('setSlideLayout keeps blocks in matching slots and rescues the rest', () => {
  const deck = ops.setSlideLayout(sample(), 's_two', 'content'); // left/right do not exist in content
  const slide = ops.findSlide(deck, 's_two').slide;
  assert.equal(slide.layout, 'content');
  assert.deepEqual(slide.blocks.map((b) => b.slot), ['title', 'body', 'body']);
  assert.equal(ops.setSlideLayout(deck, 's_two', 'no-such-layout'), deck);
});

test('patchSlide sets notes and clears the transition override', () => {
  let deck = ops.patchSlide(sample(), 's_bleed', { notes: 'hello' });
  assert.equal(ops.findSlide(deck, 's_bleed').slide.notes, 'hello');
  assert.equal(ops.findSlide(deck, 's_bleed').slide.transition, 'zoom');
  deck = ops.patchSlide(deck, 's_bleed', { transition: null });
  assert.equal('transition' in ops.findSlide(deck, 's_bleed').slide, false);
});

test('columns: add up to four, remove down to two', () => {
  let deck = sample();
  deck = ops.addColumn(deck, 'b_n2');
  assert.equal(ops.findBlock(deck, 'b_n2').block.props.cols.length, 4);
  assert.equal(ops.addColumn(deck, 'b_n2'), deck);
  deck = ops.removeColumn(deck, 'b_n2', 3);
  deck = ops.removeColumn(deck, 'b_n2', 2);
  assert.equal(ops.findBlock(deck, 'b_n2').block.props.cols.length, 2);
  assert.equal(ops.removeColumn(deck, 'b_n2', 0), deck);
});
