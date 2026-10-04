import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boundsOf, resizeBox, alignBoxes, distributeBoxes, scaleBoxes, matchSize } from '../src/editor/transform.js';
import { snapMove, snapResize } from '../src/editor/snap.js';
import { normalizeFrame } from '../src/core/blocks/registry.js';
import { normalizeDeck, createSlide } from '../src/core/schema.js';

const box = { x: 100, y: 100, w: 200, h: 100 };

test('bounds cover every box', () => {
  assert.deepEqual(boundsOf([box, { x: 0, y: 50, w: 10, h: 10 }]), { x: 0, y: 50, w: 300, h: 150 });
  assert.equal(boundsOf([]), null);
});

test('resizing from the east and south corners grows the box', () => {
  assert.deepEqual(resizeBox(box, 'se', 40, 20), { x: 100, y: 100, w: 240, h: 120 });
});

test('resizing from the west keeps the right edge still', () => {
  const r = resizeBox(box, 'w', -50, 0);
  assert.equal(r.x + r.w, 300);
  assert.equal(r.w, 250);
});

test('aspect ratio is kept on corners', () => {
  const r = resizeBox(box, 'se', 100, 0, { ratio: true });
  assert.equal(r.w / r.h, 2);
  assert.equal(r.w, 300);
});

test('resizing cannot go below the minimum or flip', () => {
  const r = resizeBox(box, 'e', -1000, 0);
  assert.equal(r.w, 24);
  assert.equal(r.x, 100);
  const nw = resizeBox(box, 'nw', 1000, 1000);
  assert.equal(nw.x + nw.w, 300);
  assert.equal(nw.y + nw.h, 200);
});

test('resizing about the centre keeps the centre', () => {
  const r = resizeBox(box, 'e', 50, 0, { center: true });
  assert.equal(r.x + r.w / 2, 200);
  assert.equal(r.w, 300);
});

test('align and distribute', () => {
  const boxes = [{ x: 0, y: 0, w: 100, h: 50 }, { x: 150, y: 20, w: 50, h: 50 }, { x: 500, y: 40, w: 100, h: 50 }];
  assert.deepEqual(alignBoxes(boxes, 'left').map((b) => b.x), [0, 0, 0]);
  assert.deepEqual(alignBoxes(boxes, 'right').map((b) => b.x), [500, 550, 500]);
  assert.deepEqual(alignBoxes(boxes, 'middle').map((b) => b.y), [20, 20, 20]);
  const d = distributeBoxes(boxes, 'x');
  assert.equal(d[0].x, 0);
  assert.equal(d[2].x, 500);
  assert.equal(d[1].x, 275); // equal 175px gaps
  assert.equal(distributeBoxes(boxes.slice(0, 2), 'x').length, 2);
});

test('scaling a group keeps proportions inside the new bounds', () => {
  const boxes = [{ x: 0, y: 0, w: 100, h: 100 }, { x: 100, y: 0, w: 100, h: 100 }];
  const out = scaleBoxes(boxes, boundsOf(boxes), { x: 0, y: 0, w: 400, h: 200 });
  assert.deepEqual(out[1], { x: 200, y: 0, w: 200, h: 200 });
});

test('match size copies the reference', () => {
  assert.deepEqual(matchSize([box], 'w', { w: 7, h: 9 })[0], { ...box, w: 7 });
});

test('moving snaps to a nearby edge and reports a guide', () => {
  const other = { x: 500, y: 300, w: 100, h: 100 };
  const r = snapMove({ x: 396, y: 600, w: 100, h: 50 }, [other], { w: 1920, h: 1080 });
  assert.equal(r.dx, 4); // right edge 496 -> 500
  assert.equal(r.dy, 0);
  assert.ok(r.guides.some((g) => g.axis === 'x' && g.pos === 500));
});

test('moving snaps the centre to the slide centre', () => {
  const r = snapMove({ x: 860, y: 100, w: 200, h: 100 }, [], { w: 1920, h: 1080 });
  assert.equal(r.dx, 0);
  assert.ok(r.guides.some((g) => g.axis === 'x' && g.pos === 960));
});

test('nothing snaps outside the threshold', () => {
  const r = snapMove({ x: 413, y: 613, w: 100, h: 50 }, [{ x: 700, y: 900, w: 10, h: 10 }], { w: 1920, h: 1080 });
  assert.deepEqual([r.dx, r.dy, r.guides.length], [0, 0, 0]);
});

test('resizing snaps only the moving edge', () => {
  const r = snapResize({ x: 100, y: 100, w: 197, h: 100 }, { right: true }, [], { w: 1920, h: 1080 }, 8);
  assert.equal(r.box.x, 100);
  assert.equal(r.box.w, 197); // nothing within 8px of 297
  const s = snapResize({ x: 100, y: 100, w: 197, h: 100 }, { right: true }, [{ x: 300, y: 0, w: 5, h: 5 }], { w: 1920, h: 1080 });
  assert.equal(s.box.w, 200);
});

test('frames are validated and clamped', () => {
  assert.equal(normalizeFrame({ x: 'a', y: 1, w: 2 }), null);
  assert.deepEqual(normalizeFrame({ x: 1.234, y: 2, w: 1 }), { x: 1.23, y: 2, w: 8 });
  assert.equal(normalizeFrame({ x: 0, y: 0, w: 100, h: 99999 }).h, 6000);
  assert.equal(normalizeFrame({ x: 0, y: 0, w: 100, r: -90 }).r, 270);
  assert.equal(normalizeFrame({ x: 0, y: 0, w: 100, r: 360 }).r, undefined);
});

test('free slides keep frames; other layouts drop them; missing frames get a default', () => {
  const free = createSlide('free');
  assert.ok(free.blocks[0].frame);
  const raw = { version: 1, meta: { title: 't' }, slides: [
    { id: 'a', layout: 'free', blocks: [{ type: 'text', props: { text: 'x' } }, { type: 'text', frame: { x: 10, y: 20, w: 300 }, locked: true, props: {} }] },
    { id: 'b', layout: 'content', blocks: [{ type: 'text', slot: 'body', frame: { x: 1, y: 2, w: 3 }, props: {} }] },
  ] };
  const deck = normalizeDeck(raw).deck ?? normalizeDeck(raw);
  const [a, b] = deck.slides;
  assert.ok(a.blocks[0].frame);
  assert.equal(a.blocks[1].locked, true);
  assert.equal(b.blocks[0].frame, undefined);
});
