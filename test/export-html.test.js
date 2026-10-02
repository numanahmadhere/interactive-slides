import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStandaloneHtml, embedJson, stripNotes, safeScript } from '../src/export/html.js';
import { normalizeDeck } from '../src/core/schema.js';
import { sampleDeck } from '../src/samples/sample-deck.js';

const runtime = { js: 'console.log("player")', css: 'body{color:red}' };
const deckWith = (patch) => ({ ...normalizeDeck(structuredClone(sampleDeck)).deck, ...patch });

test('embedJson cannot break out of a script element', () => {
  const evil = { a: '</script><script>alert(1)</script>', b: '<!-- x -->', c: 'line\u2028sep\u2029' };
  const out = embedJson(evil);
  assert.ok(!out.includes('<'), 'no raw < anywhere');
  assert.ok(!out.includes('\u2028') && !out.includes('\u2029'));
  assert.deepEqual(JSON.parse(out), evil, 'and it still parses back to the same value');
});

test('the standalone page carries the deck, the runtime, a CSP and a safe title', () => {
  const html = buildStandaloneHtml(deckWith({ meta: { title: 'Q&A <script>x</script>' } }), runtime);
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /<title>Q&amp;A &lt;script&gt;x&lt;\/script&gt;<\/title>/);
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /<style>body\{color:red\}<\/style>/);
  assert.match(html, /<script>console\.log\("player"\)<\/script>/);
  const m = /<script type="application\/json" id="deck-data">(.*?)<\/script>/s.exec(html);
  const parsed = JSON.parse(m[1]);
  assert.equal(parsed.slides.length, 11);
});

test('a runtime containing </script is escaped so it cannot end its own element', () => {
  const html = buildStandaloneHtml(deckWith({}), { js: 'var s="</script><b>";', css: '' });
  assert.equal((html.match(/<\/script>/g) ?? []).length, 2, 'only the two closing tags the page itself writes');
  assert.ok(html.includes('<\\/script><b>'));
});

test('speaker notes are left out unless asked for', () => {
  const deck = deckWith({});
  deck.slides[0].notes = 'secret plan';
  const without = buildStandaloneHtml(deck, runtime);
  const withNotes = buildStandaloneHtml(deck, { ...runtime, includeNotes: true });
  assert.ok(!without.includes('secret plan'));
  assert.ok(withNotes.includes('secret plan'));
  assert.equal(stripNotes(deck).slides.every((s) => s.notes === ''), true);
  assert.equal(deck.slides[0].notes, 'secret plan', 'the original deck is not modified');
});

test('language and direction are carried onto the document', () => {
  const html = buildStandaloneHtml(deckWith({ lang: 'ar', direction: 'rtl' }), runtime);
  assert.match(html, /<html lang="ar" dir="rtl">/);
  assert.match(buildStandaloneHtml(deckWith({}), runtime), /<html lang="en">/);
});

test('safeScript neutralises sequences that confuse the HTML parser, without changing the code', () => {
  const src = 'var a = "<!--"; var b = "<script>x</script>"; var c = /<\\/SCRIPT/.test(s);';
  const out = safeScript(src);
  assert.ok(!out.includes('<!--'));
  assert.ok(!/<\/?script/i.test(out));
  // evaluating both gives identical strings
  const run = (code) => new Function(`${code}; return [a, b];`)();
  assert.deepEqual(run(out.replace(/var c.*$/, '')), run(src.replace(/var c.*$/, '')));
});

test('the page contains no raw "<!--" or "<script" inside the runtime', () => {
  const html = buildStandaloneHtml(deckWith({}), { js: 'var x="<!--"; var y="<script>";', css: '' });
  const scriptBody = /<script>(.*?)<\/script>/s.exec(html)[1];
  assert.ok(!scriptBody.includes('<!--'));
  assert.ok(!/<script/i.test(scriptBody));
});
