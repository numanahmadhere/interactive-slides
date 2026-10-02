import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeInline, safeLinkUrl, safeImageUrl, safeEmbedUrl } from '../src/core/sanitize.js';

test('keeps whitelisted inline formatting', () => {
  assert.equal(sanitizeInline('a <b>bold</b> and <em>it</em>'), 'a <b>bold</b> and <em>it</em>');
  assert.equal(sanitizeInline('line<br/>break'), 'line<br>break');
});

test('removes script and style including their content', () => {
  assert.equal(sanitizeInline('x<script>alert(1)</script>y'), 'xy');
  assert.equal(sanitizeInline('x<style>body{display:none}</style>y'), 'xy');
  assert.equal(sanitizeInline('x<iframe src="https://evil"></iframe>y'), 'xy');
  assert.equal(sanitizeInline('x<script>never closed'), 'x');
});

test('drops event handlers and unknown attributes', () => {
  assert.equal(sanitizeInline('<b onclick="alert(1)" style="x:y">t</b>'), '<b>t</b>');
  assert.equal(sanitizeInline('<img src=x onerror=alert(1)>t'), 't');
});

test('unwraps unknown tags but keeps their text', () => {
  assert.equal(sanitizeInline('<div><p>hello</p></div>'), 'hello');
});

test('links: safe schemes kept with hardened attributes', () => {
  assert.equal(
    sanitizeInline('<a href="https://example.com/a?b=1&c=2">go</a>'),
    '<a href="https://example.com/a?b=1&amp;c=2" target="_blank" rel="noopener noreferrer">go</a>',
  );
  assert.match(sanitizeInline('<a href="mailto:a@b.co">m</a>'), /href="mailto:a@b\.co"/);
});

test('links: dangerous schemes are removed, including obfuscated ones', () => {
  for (const href of [
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    '  javascript:alert(1)',
    'java\tscript:alert(1)',
    'java&#x09;script:alert(1)',
    '&#106;avascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
  ]) {
    assert.equal(sanitizeInline(`<a href="${href}">t</a>`), 't', href);
  }
});

test('closes tags left open and ignores stray closers', () => {
  assert.equal(sanitizeInline('<b>never closed'), '<b>never closed</b>');
  assert.equal(sanitizeInline('text</b> more'), 'text more');
  assert.equal(sanitizeInline('<b><i>x</b>y'), '<b><i>x</i></b>y');
});

test('escapes stray angle brackets and ampersands', () => {
  assert.equal(sanitizeInline('a < b and c > d'), 'a &lt; b and c &gt; d');
  assert.equal(sanitizeInline('AT&T'), 'AT&amp;T');
  assert.equal(sanitizeInline('Fish &amp; chips'), 'Fish &amp; chips');
  assert.equal(sanitizeInline('<b'), '&lt;b');
});

test('strips comments and tolerates non-strings', () => {
  assert.equal(sanitizeInline('a<!-- hidden -->b'), 'ab');
  assert.equal(sanitizeInline(undefined), '');
  assert.equal(sanitizeInline(42), '42');
});

test('attribute values containing ">" do not end the tag early', () => {
  assert.equal(sanitizeInline('<a title="a>b" href="https://x.co">t</a>'),
    '<a href="https://x.co" target="_blank" rel="noopener noreferrer">t</a>');
});

test('safeLinkUrl / safeImageUrl / safeEmbedUrl', () => {
  assert.equal(safeLinkUrl('#section'), '#section');
  assert.equal(safeLinkUrl('/relative/path'), '/relative/path');
  assert.equal(safeLinkUrl('javascript:1'), null);

  assert.equal(safeImageUrl('https://x.co/a.png'), 'https://x.co/a.png');
  assert.equal(safeImageUrl('data:image/png;base64,AAAA'), 'data:image/png;base64,AAAA');
  assert.equal(safeImageUrl('data:image/svg+xml;utf8,%3Csvg%3E'), 'data:image/svg+xml;utf8,%3Csvg%3E');
  assert.equal(safeImageUrl('data:text/html,<script>'), null);
  assert.equal(safeImageUrl('javascript:alert(1)'), null);
  assert.equal(safeImageUrl(''), null);

  assert.equal(safeEmbedUrl('https://youtu.be/abc'), 'https://youtu.be/abc');
  assert.equal(safeEmbedUrl('http://insecure.example'), null);
  assert.equal(safeEmbedUrl('javascript:1'), null);
});
