import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AssetStore } from '../src/editor/assets.js';

const store = () => new AssetStore({ loadAssets: async () => [] });

test('referenced() finds asset ids anywhere in a deck, including nested blocks', () => {
  const deck = {
    slides: [
      { blocks: [{ type: 'image', props: { src: 'asset:abc123' } }] },
      { blocks: [{ type: 'columns', props: { cols: [{ blocks: [{ type: 'image', props: { src: 'asset:zz9' } }] }] } }] },
      { blocks: [{ type: 'image', props: { src: 'https://example.com/a.png' } }] },
    ],
  };
  assert.deepEqual([...store().referenced(deck)].sort(), ['abc123', 'zz9']);
});

test('resolve() passes normal URLs through and hides unknown asset ids', () => {
  const s = store();
  assert.equal(s.resolve('https://example.com/a.png'), 'https://example.com/a.png');
  assert.equal(s.resolve('asset:missing'), '');
  assert.equal(s.resolve(undefined), undefined);
});
