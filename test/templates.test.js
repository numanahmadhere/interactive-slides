import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TEMPLATES, getTemplate } from '../src/library/templates.js';
import { createDeck, normalizeDeck } from '../src/core/schema.js';
import { walkBlocks } from '../src/core/blocks/index.js';

test('there is a blank canvas and a useful spread of templates', () => {
  assert.ok(getTemplate('blank'));
  assert.ok(TEMPLATES.length >= 10);
  assert.equal(new Set(TEMPLATES.map((t) => t.id)).size, TEMPLATES.length);
});

test('every template is a valid free-form slide that survives normalisation untouched', () => {
  for (const t of TEMPLATES) {
    const deck = createDeck();
    deck.slides = [t.make()];
    const { deck: clean, warnings } = normalizeDeck(deck);
    const out = clean.slides[0];
    assert.equal(out.layout, 'free', t.id);
    assert.deepEqual(warnings, [], `${t.id}: ${warnings.join('; ')}`);
    assert.equal(out.blocks.length, deck.slides[0].blocks.length, t.id);
    for (const b of out.blocks) assert.ok(b.frame && b.frame.w >= 8, `${t.id}: ${b.type} has a frame`);
  }
});

test('templates give every block and slide a fresh id each time', () => {
  const t = getTemplate('two-column');
  const a = t.make();
  const b = t.make();
  assert.notEqual(a.id, b.id);
  const ids = new Set();
  walkBlocks(a.blocks, (x) => ids.add(x.id));
  walkBlocks(b.blocks, (x) => assert.ok(!ids.has(x.id)));
});

test('templates only use theme colours, so every theme can show them', () => {
  for (const t of TEMPLATES) {
    for (const b of t.make().blocks) {
      for (const v of Object.values(b.style ?? {})) assert.ok(!v.startsWith('#'), `${t.id}: ${v}`);
    }
  }
});
