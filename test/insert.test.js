import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../src/core/blocks/index.js';
import { listBlocks } from '../src/core/blocks/index.js';
import { searchBlocks, QUICK_TYPES } from '../src/editor/insert.js';

const labels = (q) => searchBlocks(q).map((d) => d.type);

test('an empty search lists every block', () => {
  assert.equal(searchBlocks('').length, listBlocks().length);
});

test('search matches labels, groups and everyday words', () => {
  assert.ok(labels('vote').includes('poll'));
  assert.ok(labels('photo').includes('image'));
  assert.ok(labels('graph').includes('chart'));
  assert.ok(labels('faq').includes('accordion'));
  assert.deepEqual(labels('zzzz'), []);
});

test('label matches rank before looser ones and every word must match', () => {
  assert.equal(labels('text')[0], 'text');
  assert.ok(!labels('quiz score').includes('poll'));
});

test('the quick-add bar only offers real block types', () => {
  const types = new Set(listBlocks().map((d) => d.type));
  for (const t of QUICK_TYPES) assert.ok(types.has(t), t);
});
