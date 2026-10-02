import { test } from 'node:test';
import assert from 'node:assert/strict';
import { embedCode } from '../src/export/embed.js';

test('embed code for a hosted deck', () => {
  const code = embedCode({ url: ' https://example.com/decks/my deck.html ', title: 'My "deck"', aspect: '16:9' });
  assert.match(code, /^<iframe /);
  assert.match(code, /src="https:\/\/example\.com\/decks\/my%20deck\.html"/);
  assert.match(code, /title="My &quot;deck&quot;"/);
  assert.match(code, /aspect-ratio:16 \/ 9/);
  assert.match(code, /allowfullscreen/);
});

test('4:3 decks get a 4:3 frame', () => {
  assert.match(embedCode({ url: 'https://a.co/x', aspect: '4:3' }), /aspect-ratio:4 \/ 3/);
});

test('only http and https addresses are accepted', () => {
  for (const bad of ['', 'not a url', 'javascript:alert(1)', 'data:text/html,hi', 'file:///etc/passwd', 'ftp://x.co']) {
    assert.equal(embedCode({ url: bad }), null, bad);
  }
  assert.ok(embedCode({ url: 'http://localhost:8080/deck.html' }));
});

test('attributes cannot be broken out of', () => {
  const code = embedCode({ url: 'https://a.co/x?a=1&b="><script>', title: '"><img src=x>' });
  assert.ok(!code.includes('"><script>'));
  assert.ok(!code.includes('"><img'));
});
