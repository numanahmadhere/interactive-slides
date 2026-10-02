import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveEmbed } from '../src/core/blocks/embed.js';

const id = 'aqz-KE-bpKQ';

test('youtube urls resolve to the privacy-friendly embed endpoint', () => {
  const want = { provider: 'youtube', src: `https://www.youtube-nocookie.com/embed/${id}` };
  assert.deepEqual(resolveEmbed(`https://www.youtube.com/watch?v=${id}`), want);
  assert.deepEqual(resolveEmbed(`https://youtu.be/${id}`), want);
  assert.deepEqual(resolveEmbed(`https://www.youtube.com/embed/${id}`), want);
  assert.deepEqual(resolveEmbed(`https://www.youtube.com/shorts/${id}`), want);
  assert.equal(resolveEmbed('https://www.youtube.com/watch?v=short'), null);
});

test('vimeo and loom', () => {
  assert.deepEqual(resolveEmbed('https://vimeo.com/123456789'), { provider: 'vimeo', src: 'https://player.vimeo.com/video/123456789' });
  const loom = 'a'.repeat(32);
  assert.deepEqual(resolveEmbed(`https://www.loom.com/share/${loom}`), { provider: 'loom', src: `https://www.loom.com/embed/${loom}` });
});

test('other https pages are framed as-is; everything else is refused', () => {
  assert.deepEqual(resolveEmbed('https://example.com/demo'), { provider: 'web', src: 'https://example.com/demo' });
  assert.equal(resolveEmbed('http://example.com'), null);
  assert.equal(resolveEmbed('javascript:alert(1)'), null);
  assert.equal(resolveEmbed(''), null);
  assert.equal(resolveEmbed('not a url'), null);
});
