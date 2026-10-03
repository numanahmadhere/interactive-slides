import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAppPath, deckPath } from '../src/shell/paths.js';
import { Persistence, metaOf } from '../src/editor/persist.js';
import { blankDeck, duplicateDeck, demoDeckCopy } from '../src/library/starters.js';
import { buildSite } from '../tools/site.mjs';

test('app routes', () => {
  assert.deepEqual(parseAppPath('/app'), { page: 'dashboard' });
  assert.deepEqual(parseAppPath('/app/'), { page: 'dashboard' });
  assert.deepEqual(parseAppPath('/app/account'), { page: 'account' });
  assert.deepEqual(parseAppPath('/app/d/d_abc123'), { page: 'editor', deckId: 'd_abc123' });
  assert.deepEqual(parseAppPath('/app/d/d_abc123/'), { page: 'editor', deckId: 'd_abc123' });
  assert.equal(parseAppPath('/app/d/').page, 'notfound');
  assert.equal(parseAppPath('/app/d/a/b').page, 'notfound');
  assert.equal(parseAppPath('/app/d/%E0%A4%A').page, 'notfound', 'a broken escape is not a crash');
  assert.equal(parseAppPath('/app/nope').page, 'notfound');
  assert.equal(parseAppPath(deckPath('x y/z')).deckId, 'x y/z', 'ids survive the round trip');
});

test('library: several decks, summaries, links, deletion', async () => {
  const p = new Persistence();
  await p.init(); // no browser storage in Node: the in-memory library
  assert.deepEqual(await p.listDecks(), []);
  const a = blankDeck(); a.meta.title = 'Alpha';
  const b = demoDeckCopy(); b.meta.title = 'Beta';
  const idA = await p.createDeck(a);
  await new Promise((r) => setTimeout(r, 5));
  const idB = await p.createDeck(b, { cloudId: 'c1', cloudUpdatedAt: 't1' });
  assert.notEqual(idA, idB);

  const list = await p.listDecks();
  assert.deepEqual(list.map((m) => m.title), ['Beta', 'Alpha'], 'most recently edited first');
  assert.equal(list[0].slideCount, b.slides.length);
  assert.equal(list[0].cloudId, 'c1');
  assert.equal((await p.loadDeck(idA)).meta.title, 'Alpha');
  assert.equal(await p.loadDeck('nope'), null);

  // saving keeps what only the library knows (thumbnail, cloud link)
  await p.patchMeta(idB, { thumb: 'data:image/png;base64,AAAA' });
  a.slides.push(a.slides[0]);
  const after = await p.saveDeck(idB, b);
  assert.equal(after.thumb, 'data:image/png;base64,AAAA');
  assert.equal(after.cloudId, 'c1');

  // patching does not count as editing
  const before = (await p.getMeta(idA)).updatedAt;
  await new Promise((r) => setTimeout(r, 5));
  await p.patchMeta(idA, { thumb: 'x' });
  assert.equal((await p.getMeta(idA)).updatedAt, before);
  assert.equal(await p.patchMeta('missing', { thumb: 'x' }), null);

  await p.deleteDeck(idA);
  assert.deepEqual((await p.listDecks()).map((m) => m.id), [idB]);
  assert.equal(await p.loadDeck(idA), null);
});

test('library: image references are tracked per deck so unused images can be cleaned up', async () => {
  const deck = blankDeck();
  deck.slides[0].blocks.push({ id: 'b1', type: 'image', slot: 'body', props: { src: 'asset:abc123', alt: '' } });
  deck.brand = { logo: 'asset:logo9', position: 'top-left', size: 'md' };
  const meta = metaOf('d1', deck);
  assert.deepEqual([...meta.assetIds].sort(), ['abc123', 'logo9']);
  const p = new Persistence();
  await p.init();
  await p.createDeck(deck);
  assert.deepEqual([...await p.allAssetIds()].sort(), ['abc123', 'logo9']);
});

test('duplicating a deck gives it its own identity', () => {
  const orig = demoDeckCopy();
  orig.meta.createdAt = '2020-01-01T00:00:00.000Z';
  const copy = duplicateDeck(orig);
  assert.equal(copy.meta.title, `Copy of ${orig.meta.title}`);
  assert.notEqual(copy.meta.createdAt, orig.meta.createdAt);
  assert.equal(copy.slides.length, orig.slides.length);
  assert.notEqual(copy, orig);
});

test('the public pages are complete, small and honest', () => {
  const site = buildSite();
  for (const f of ['index.html', 'learn/index.html', 'privacy/index.html', 'terms/index.html', '404.html', 'sitemap.xml', 'robots.txt']) assert.ok(site[f], f);
  const home = site['index.html'];
  assert.ok(home.length < 30 * 1024, `home page is ${home.length} bytes`);
  assert.match(home, /<title>[^<]+<\/title>/);
  assert.match(home, /<meta name="description"/);
  assert.match(home, /<h1>.+?<\/h1>/);
  assert.equal((home.match(/<h1>/g) ?? []).length, 1, 'one h1');
  assert.ok(!/<img[^>]+(?!alt)/.test(home) || !/<img(?![^>]*alt=)/.test(home), 'every image has alt text');
  assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(Object.values(site).join('')), 'no emoji');
  assert.ok(home.includes('(join|remote|view|play)='), 'old links are forwarded to the app');
  assert.ok(home.includes('href="/app/"'));
  assert.ok(site['robots.txt'].includes('Disallow: /app/'));
  assert.ok(site['sitemap.xml'].includes('/privacy/') && !site['sitemap.xml'].includes('/app/'));
  assert.ok(site['404.html'].includes('noindex'));
  // claims on the page must be features that exist
  for (const promised of ['Interactive blocks', 'Live audience', 'Phone remote']) assert.ok(home.includes(promised));
  for (const unbuilt of ['word cloud', 'Word cloud', 'artificial intelligence', ' AI ', 'templates']) assert.ok(!home.includes(unbuilt), `home mentions something not built: ${unbuilt}`);
});
