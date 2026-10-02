import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findMatches, replaceAll, makeMatcher } from '../src/editor/search.js';
import { normalizeDeck } from '../src/core/schema.js';
import { interactiveDeck } from '../src/samples/interactive-deck.js';

const deckOf = (slides, extra = {}) => normalizeDeck({ slides, ...extra }).deck;
const heading = (text) => ({ type: 'heading', slot: 'title', props: { text, level: 2 } });
const para = (text, extra = {}) => ({ type: 'text', slot: 'body', props: { text, ...extra } });

test('matcher: empty, escaping, case and whole word', () => {
  assert.equal(makeMatcher({ query: '' }), null);
  assert.ok(makeMatcher({ query: 'a.b' }).test('a.b'));
  assert.ok(!makeMatcher({ query: 'a.b' }).test('axb'), 'regex characters are literal');
  assert.ok(makeMatcher({ query: 'cat' }).test('CAT'));
  assert.ok(!makeMatcher({ query: 'cat', caseSensitive: true }).test('CAT'));
  const word = makeMatcher({ query: 'cat', wholeWord: true });
  assert.ok(word.test('a cat sat'));
  word.lastIndex = 0;
  assert.ok(!word.test('concatenate'));
});

test('find reports counts and snippets per slide', () => {
  const deck = deckOf([
    { layout: 'content', blocks: [heading('Acme overview'), para('Acme makes anvils. Acme ships fast.')] },
    { layout: 'content', blocks: [heading('Other'), para('Nothing here')] },
    { layout: 'content', blocks: [heading('Contact'), para('Email acme today')] },
  ]);
  const r = findMatches(deck, { query: 'acme' });
  assert.equal(r.total, 4);
  assert.deepEqual(r.slides.map((s) => [s.index, s.count]), [[0, 3], [2, 1]]);
  assert.equal(r.slides[0].snippets.length, 2, 'snippets are capped');
  assert.equal(r.slides[0].snippets[0].match, 'Acme');
});

test('rich text: only visible text is matched, tags and entities are left alone', () => {
  const deck = deckOf([{ layout: 'content', blocks: [para('R&amp;D is <b>bold R&amp;D</b> and <a href="https://rd.example/b">link</a>')] }]);
  assert.equal(findMatches(deck, { query: 'R&D' }).total, 2);
  assert.equal(findMatches(deck, { query: 'href' }).total, 0, 'attribute text is not searchable');
  assert.equal(findMatches(deck, { query: 'b' , wholeWord: true }).total, 0, 'the <b> tag is not text');
  const { deck: out, count } = replaceAll(deck, { query: 'R&D' }, 'Research & Development');
  assert.equal(count, 2);
  assert.equal(out.slides[0].blocks[0].props.text, 'Research &amp; Development is <b>bold Research &amp; Development</b> and <a href="https://rd.example/b">link</a>');
});

test('replace keeps untouched slides and blocks by reference', () => {
  const deck = deckOf([
    { id: 'a', layout: 'content', blocks: [heading('Keep'), para('alter me')] },
    { id: 'b', layout: 'content', blocks: [heading('Keep too'), para('as is')] },
  ]);
  const { deck: out, count } = replaceAll(deck, { query: 'alter' }, 'adjust');
  assert.equal(count, 1);
  assert.notEqual(out.slides[0], deck.slides[0]);
  assert.equal(out.slides[1], deck.slides[1]);
  assert.equal(out.slides[0].blocks[0], deck.slides[0].blocks[0], 'the heading block is shared');
  assert.equal(out.slides[0].blocks[1].props.text, 'adjust me');
});

test('a replacement is literal: $ patterns and angle brackets do not misbehave', () => {
  const deck = deckOf([{ layout: 'content', blocks: [para('price: X')] }]);
  assert.equal(replaceAll(deck, { query: 'X' }, '$& $1 $$').deck.slides[0].blocks[0].props.text, 'price: $& $1 $$');
  const rich = deckOf([{ layout: 'content', blocks: [para('<b>X</b>')] }]);
  assert.equal(replaceAll(rich, { query: 'X' }, '<script>').deck.slides[0].blocks[0].props.text, '<b>&lt;script&gt;</b>');
});

test('settings, references and code are never searched or changed', () => {
  const deck = deckOf([{ layout: 'content', blocks: [
    { type: 'image', slot: 'body', props: { src: 'https://logo.example/logo.png', alt: 'A logo' } },
    { type: 'button', slot: 'body', props: { label: 'logo', action: 'link', url: 'https://logo.example' } },
    { type: 'code-sandbox', slot: 'body', props: { title: '', html: '<p>logo</p>', css: '', js: "var logo = 1;" } },
  ] }]);
  const r = findMatches(deck, { query: 'logo' });
  assert.equal(r.total, 2, 'the alt text and the button label only');
  const { deck: out } = replaceAll(deck, { query: 'logo' }, 'mark');
  const [image, button, lab] = out.slides[0].blocks;
  assert.equal(image.props.src, 'https://logo.example/logo.png');
  assert.equal(image.props.alt, 'A mark');
  assert.equal(button.props.url, 'https://logo.example');
  assert.equal(button.props.label, 'mark');
  assert.equal(lab.props.js, 'var logo = 1;');
});

test('nested blocks, list items and quiz choices are reached', () => {
  const { deck } = normalizeDeck(structuredClone(interactiveDeck));
  assert.ok(findMatches(deck, { query: 'Corporate AI Training' }).total >= 1, 'a tab title');
  assert.ok(findMatches(deck, { query: 'Marketing' }).total >= 1, 'a list inside a tab');
  assert.ok(findMatches(deck, { query: 'Diagnose' }).total >= 3, 'quiz choices, ordering items, diagram nodes');
  const { deck: out, count } = replaceAll(deck, { query: 'Diagnose' }, 'Analyse');
  assert.ok(count >= 3);
  assert.equal(findMatches(out, { query: 'Diagnose' }).total, 0);
});

test('speaker notes are only searched when asked', () => {
  const deck = deckOf([{ layout: 'content', notes: 'remember the secret', blocks: [para('visible')] }]);
  assert.equal(findMatches(deck, { query: 'secret' }).total, 0);
  assert.equal(findMatches(deck, { query: 'secret', includeNotes: true }).total, 1);
  assert.equal(replaceAll(deck, { query: 'secret' }, 'x').count, 0);
  assert.equal(replaceAll(deck, { query: 'secret', includeNotes: true }, 'x').deck.slides[0].notes, 'remember the x');
});

test('no query or no match changes nothing', () => {
  const deck = deckOf([{ layout: 'content', blocks: [para('hello')] }]);
  assert.equal(replaceAll(deck, { query: '' }, 'x').deck, deck);
  assert.equal(replaceAll(deck, { query: 'zzz' }, 'x').deck, deck);
  assert.deepEqual(findMatches(deck, { query: '' }), { total: 0, slides: [] });
});
