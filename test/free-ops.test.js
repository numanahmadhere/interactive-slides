import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as ops from '../src/editor/ops.js';
import { createDeck, createSlide } from '../src/core/schema.js';
import { createBlock } from '../src/core/blocks/index.js';
import * as clip from '../src/editor/clipboard.js';

const freeDeck = () => {
  const deck = createDeck();
  deck.slides = [createSlide('free')];
  return deck;
};
const withTwo = () => {
  let deck = freeDeck();
  const a = createBlock('text');
  const b = createBlock('shape');
  deck = ops.insertBlock(deck, deck.slides[0].id, { slot: 'free' }, a);
  deck = ops.insertBlock(deck, deck.slides[0].id, { slot: 'free' }, b);
  return { deck, a, b };
};

test('blocks inserted into a free slide get a frame; fixed slides never keep one', () => {
  const { deck, b } = withTwo();
  const placed = deck.slides[0].blocks.find((x) => x.id === b.id);
  assert.ok(placed.frame.w > 0);
  assert.equal(placed.frame.h, 360); // shapes get a square default
  const fixed = createDeck();
  fixed.slides = [createSlide('content')];
  const next = ops.insertBlock(fixed, fixed.slides[0].id, { slot: 'body' }, { ...createBlock('text'), frame: { x: 1, y: 1, w: 1 } });
  assert.equal(next.slides[0].blocks.at(-1).frame, undefined);
});

test('setFrames moves several blocks in one pass and is a no-op when nothing changes', () => {
  const { deck, a, b } = withTwo();
  const fa = deck.slides[0].blocks.find((x) => x.id === a.id).frame;
  const moved = ops.setFrames(deck, { [a.id]: { x: 10, y: 20 }, [b.id]: { x: 30 } });
  const find = (id) => moved.slides[0].blocks.find((x) => x.id === id);
  const [ma, mb] = [find(a.id), find(b.id)];
  assert.deepEqual([ma.frame.x, ma.frame.y, ma.frame.w], [10, 20, fa.w]);
  assert.equal(mb.frame.x, 30);
  assert.equal(ops.setFrames(moved, { [a.id]: { x: 10, y: 20 } }), moved);
});

test('z-order commands reorder the slide', () => {
  const { deck, a, b } = withTwo();
  const id = deck.slides[0].id;
  const ids = (d) => d.slides[0].blocks.map((x) => x.id);
  assert.deepEqual(ids(ops.arrangeBlocks(deck, id, [b.id], 'back')).slice(0, 2), [b.id, deck.slides[0].blocks[0].id]);
  const first = deck.slides[0].blocks[0].id;
  assert.equal(ops.arrangeBlocks(deck, id, [ids(deck).at(-1)], 'front'), deck);
  assert.equal(ids(ops.arrangeBlocks(deck, id, [first], 'front')).at(-1), first);
  assert.equal(ids(ops.arrangeBlocks(deck, id, [first], 'forward'))[1], first);
  assert.ok(a && b);
});

test('lock and hide flags set and clear', () => {
  const { deck, a } = withTwo();
  const locked = ops.setBlockFlags(deck, [a.id], { locked: true });
  assert.equal(locked.slides[0].blocks.find((x) => x.id === a.id).locked, true);
  const open = ops.setBlockFlags(locked, [a.id], { locked: false });
  assert.equal('locked' in open.slides[0].blocks.find((x) => x.id === a.id), false);
});

test('duplicating offsets the copy', () => {
  const { deck, a } = withTwo();
  const next = ops.duplicateBlock(deck, a.id);
  const [orig, copy] = next.slides[0].blocks.filter((x) => x.type === 'text').slice(-2);
  assert.equal(copy.frame.x, orig.frame.x + ops.DUP_OFFSET);
  assert.notEqual(copy.id, orig.id);
});

test('converting a fixed slide to free keeps every block and uses the given frames', () => {
  let deck = createDeck();
  deck.slides = [createSlide('content')];
  const slide = deck.slides[0];
  const frames = Object.fromEntries(slide.blocks.map((b, i) => [b.id, { x: i * 10, y: 5, w: 400 }]));
  const free = ops.convertToFree(deck, slide.id, frames);
  assert.equal(free.slides[0].layout, 'free');
  assert.deepEqual(free.slides[0].blocks.map((b) => b.frame.x), [0, 10]);
  assert.ok(free.slides[0].blocks.every((b) => b.slot === 'free'));
});

test('leaving free-form drops frames and puts blocks back in a slot', () => {
  const { deck } = withTwo();
  const back = ops.setSlideLayout(deck, deck.slides[0].id, 'content');
  assert.ok(back.slides[0].blocks.every((b) => b.frame === undefined && b.slot === 'body'));
  assert.equal(ops.setSlideLayout(createDeck(), 'x', 'free').slides.length, 1);
});

test('clipboard round trip gives fresh ids and ignores foreign data', () => {
  const { deck } = withTwo();
  const blocks = deck.slides[0].blocks;
  const copy = clip.parse(clip.serialize(blocks));
  assert.equal(copy.length, blocks.length);
  assert.ok(copy.every((c, i) => c.id !== blocks[i].id && c.frame));
  assert.equal(clip.parse('not json'), null);
  assert.equal(clip.parse(JSON.stringify({ kind: 'other' })), null);
  const evil = clip.parse(JSON.stringify({ kind: 'densight-blocks', blocks: [{ type: 'text', frame: { x: 'a' }, props: { text: '<img onerror=x>' } }] }));
  assert.equal(evil.length, 1);
});

test('pasting several blocks inserts them all', () => {
  const { deck } = withTwo();
  const blocks = clip.parse(clip.serialize(deck.slides[0].blocks));
  const next = ops.insertBlocks(deck, deck.slides[0].id, blocks, { offset: 40 });
  assert.equal(next.slides[0].blocks.length, 3 + blocks.length);
  assert.equal(next.slides[0].blocks[3].frame.x, deck.slides[0].blocks[0].frame.x + 40);
});

test('grouping gathers blocks under one frame and ungrouping puts them back', () => {
  const { deck, a, b } = withTwo();
  const sid = deck.slides[0].id;
  const boxes = {};
  for (const x of deck.slides[0].blocks) boxes[x.id] = { ...x.frame, h: x.frame.h ?? 80 };
  const grouped = ops.groupBlocks(deck, sid, [a.id, b.id], boxes);
  const blocks = grouped.slides[0].blocks;
  const g = blocks.find((x) => x.type === 'group');
  assert.ok(g && g.props.items[0].blocks.length === 2);
  assert.ok(!blocks.some((x) => x.id === a.id));
  const child = g.props.items[0].blocks.find((c) => c.id === a.id);
  assert.equal(child.frame.x + g.frame.x, deck.slides[0].blocks.find((x) => x.id === a.id).frame.x);
  const back = ops.ungroupBlock(grouped, sid, g.id);
  const restored = back.slides[0].blocks.find((x) => x.id === a.id);
  assert.equal(restored.frame.x, deck.slides[0].blocks.find((x) => x.id === a.id).frame.x);
  assert.ok(!back.slides[0].blocks.some((x) => x.type === 'group'));
});

test('resizing a group scales its children', () => {
  const { deck, a, b } = withTwo();
  const sid = deck.slides[0].id;
  const boxes = {};
  for (const x of deck.slides[0].blocks) boxes[x.id] = { ...x.frame, h: x.frame.h ?? 80 };
  const grouped = ops.groupBlocks(deck, sid, [a.id, b.id], boxes);
  const g = grouped.slides[0].blocks.find((x) => x.type === 'group');
  const bigger = ops.setFrames(grouped, { [g.id]: { w: g.frame.w * 2, h: g.frame.h * 2 } });
  const g2 = bigger.slides[0].blocks.find((x) => x.type === 'group');
  const c1 = g.props.items[0].blocks.find((c) => c.id === b.id);
  const c2 = g2.props.items[0].blocks.find((c) => c.id === b.id);
  assert.equal(c2.frame.x, c1.frame.x * 2);
  assert.equal(c2.frame.w, c1.frame.w * 2);
});

test('image crop values are clamped', async () => {
  const { normalizeBlock } = await import('../src/core/blocks/index.js');
  const out = normalizeBlock({ type: 'image', props: { src: '', zoom: 99, fx: -5, fy: 500 } }, { warn() {}, seen: new Set() }, 'x');
  assert.deepEqual([out.props.zoom, out.props.fx, out.props.fy], [4, 0, 100]);
});

test('block colour overrides keep only theme tokens and hex colours', async () => {
  const { normalizeBlock } = await import('../src/core/blocks/index.js');
  const ok = normalizeBlock({ type: 'text', style: { color: 'accent', fill: '#ff0000' }, props: {} }, { warn() {}, seen: new Set() }, 'x');
  assert.deepEqual(ok.style, { color: 'accent', fill: '#ff0000' });
  const bad = normalizeBlock({ type: 'text', style: { color: 'url(javascript:x)', fill: 'red;background:url(x)' }, props: {} }, { warn() {}, seen: new Set() }, 'x');
  assert.equal(bad.style, undefined);
});

const deckOfSlides = (n) => {
  const deck = createDeck();
  deck.slides = Array.from({ length: n }, () => createSlide('free'));
  return deck;
};
const order = (d) => d.slides.map((s) => s.id);

test('several slides move together and keep their order', () => {
  const deck = deckOfSlides(5);
  const [a, b, c, d, e] = order(deck);
  assert.deepEqual(order(ops.moveSlides(deck, [b, d], 0)), [b, d, a, c, e]);
  assert.deepEqual(order(ops.moveSlides(deck, [b, d], 3)), [a, c, e, b, d]);
  assert.deepEqual(order(ops.moveSlides(deck, [d, b], 1)), [a, b, d, c, e]);
  assert.equal(ops.moveSlides(deck, [a], 0), deck);
});

test('deleting several slides always leaves one', () => {
  const deck = deckOfSlides(3);
  const ids = order(deck);
  assert.deepEqual(order(ops.deleteSlides(deck, ids.slice(0, 2))), [ids[2]]);
  assert.equal(ops.deleteSlides(deck, ids), deck);
});

test('duplicating several slides puts the copies after the last original', () => {
  const deck = deckOfSlides(4);
  const [a, b, c, d] = order(deck);
  const out = ops.duplicateSlides(deck, [a, c]);
  assert.equal(out.deck.slides.length, 6);
  assert.deepEqual(order(out.deck).slice(0, 3), [a, b, c]);
  assert.equal(out.deck.slides[3].id, out.copies[0].id);
  assert.equal(out.deck.slides[4].id, out.copies[1].id);
  assert.equal(out.deck.slides[5].id, d);
  assert.notEqual(out.copies[0].id, a);
});

import { arrange, ARRANGEMENTS } from '../src/editor/arrange.js';
import { setBlockAnimation } from '../src/editor/ops.js';

test('arrangements hand the heading to the title and the rest to the content', () => {
  const { deck, a, b } = withTwo();
  const blocks = deck.slides[0].blocks;
  const heading = blocks.find((x) => x.type === 'heading');
  const frames = arrange(blocks, 'content', { [a.id]: { h: 90 }, [b.id]: { h: 360 } });
  assert.deepEqual([frames[heading.id].x, frames[heading.id].y], [128, 96]);
  assert.equal(frames[a.id].x, 128);
  assert.ok(frames[a.id].y >= 280, 'content sits below the title');
  assert.ok(frames[b.id].y > frames[a.id].y, 'later blocks stack below earlier ones');
  assert.equal(arrange(blocks, 'nope'), null);
});

test('picture layouts give the first picture the picture area', () => {
  const picture = { ...createBlock('image'), slot: 'free', frame: { x: 5, y: 5, w: 100, h: 100 } };
  const text = { ...createBlock('text'), slot: 'free', frame: { x: 5, y: 200, w: 100 } };
  const frames = arrange([picture, text], 'image-text');
  assert.deepEqual([frames[picture.id].x, frames[picture.id].w, frames[picture.id].h], [0, 960, 1080]);
  assert.ok(frames[text.id].x >= 960);
  const bleed = arrange([picture], 'full-bleed');
  assert.deepEqual([bleed[picture.id].w, bleed[picture.id].h], [1920, 1080]);
});

test('every arrangement places every unlocked block and none are dropped', () => {
  const { deck } = withTwo();
  const blocks = deck.slides[0].blocks;
  for (const preset of ARRANGEMENTS) {
    const frames = arrange(blocks, preset.id);
    for (const b of blocks) assert.ok(frames[b.id], `${preset.id} placed ${b.type}`);
  }
});

test('locked blocks stay where they are', () => {
  const { deck, a } = withTwo();
  const locked = ops.setBlockFlags(deck, [a.id], { locked: true });
  const frames = arrange(locked.slides[0].blocks, 'two-column');
  assert.equal(frames[a.id], undefined);
});

test('animations set, clear and clamp their delay', () => {
  const { deck, a } = withTwo();
  const on = setBlockAnimation(deck, a.id, { anim: 'rise' });
  assert.equal(on.slides[0].blocks.find((x) => x.id === a.id).anim, 'rise');
  const delayed = setBlockAnimation(on, a.id, { animDelay: 123456 });
  assert.equal(delayed.slides[0].blocks.find((x) => x.id === a.id).animDelay, 5000);
  const off = setBlockAnimation(delayed, a.id, { anim: '' });
  const block = off.slides[0].blocks.find((x) => x.id === a.id);
  assert.equal('anim' in block || 'animDelay' in block, false);
});
