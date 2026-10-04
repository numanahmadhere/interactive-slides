import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAppPath, deckPath } from '../src/shell/paths.js';
import { Persistence, metaOf } from '../src/editor/persist.js';
import { blankDeck, duplicateDeck, demoDeckCopy } from '../src/library/starters.js';
import { buildSite } from '../tools/site.mjs';
import { LiveHost } from '../src/live/host.js';
import { getLayout } from '../src/core/layouts.js';
import { existsSync, readFileSync } from 'node:fs';

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
  assert.ok(home.length < 56 * 1024, `home page is ${home.length} bytes`);
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
  for (const unbuilt of ['AI-powered', 'AI assistant', 'with AI', 'AI features', 'slide library']) assert.ok(!home.includes(unbuilt), `home mentions something not built: ${unbuilt}`);
});

test('brand: the logo, icons and sharing image exist and every page uses them', () => {
  for (const f of ['logo-64.png', 'logo-light-64.png', 'logo-mark.png', 'logo-mark-light.png', 'favicon-16.png', 'favicon-32.png', 'favicon-48.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'og-image.png']) {
    assert.ok(existsSync(new URL(`../site/brand/${f}`, import.meta.url)), `site/brand/${f}`);
  }
  assert.ok(existsSync(new URL('../site/favicon.ico', import.meta.url)));
  const png = (f) => readFileSync(new URL(`../site/brand/${f}`, import.meta.url));
  const size = (b) => [b.readUInt32BE(16), b.readUInt32BE(20)];
  assert.deepEqual(size(png('og-image.png')), [1200, 630], 'social image size');
  assert.deepEqual(size(png('apple-touch-icon.png')), [180, 180]);
  assert.deepEqual(size(png('icon-512.png')), [512, 512]);
  const site = buildSite();
  for (const [file, html] of Object.entries(site)) {
    if (!file.endsWith('.html')) continue;
    assert.ok(html.includes('/favicon.ico') && html.includes('apple-touch-icon') && html.includes('rel="manifest"'), `${file} links its icons`);
    assert.ok(html.includes('/brand/logo-64.png') && html.includes('/brand/logo-light-64.png'), `${file} shows the logo in both variants`);
    assert.ok(html.includes('og:image') && html.includes('/brand/og-image.png'), `${file} has a sharing image`);
  }
  const app = readFileSync(new URL('../src/app.html', import.meta.url), 'utf8');
  assert.ok(app.includes('/favicon.ico') && app.includes('manifest'), 'the app page has icons too');
});

test('support and company: the support address and a link to densightlabs.com appear where people look', () => {
  const site = buildSite();
  const mail = 'mailto:hello@densight.com';
  for (const f of ['index.html', 'learn/index.html', 'privacy/index.html', 'terms/index.html']) {
    assert.ok(site[f].includes(mail), `${f} links the support address`);
    assert.ok(site[f].includes('href="https://densightlabs.com"'), `${f} links densightlabs.com`);
  }
  assert.ok(site['index.html'].includes('"@type":"Organization"') && site['index.html'].includes('https://densightlabs.com'), 'structured data names the company');
  assert.doesNotThrow(() => JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/s.exec(site['index.html'])[1]), 'structured data is valid JSON');
  assert.ok(!/href="https?:\/\/densightlabs\.com"[^>]*rel="[^"]*nofollow/.test(site['index.html']), 'the backlink is a normal followed link');
});

test('the in-app pages offer the same support and company links', () => {
  const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
  assert.match(read('src/shell/contact.js'), /hello@densight\.com/);
  assert.match(read('src/shell/contact.js'), /https:\/\/densightlabs\.com/);
  for (const f of ['src/shell/chrome.js', 'src/shell/account.js', 'src/editor/editor.js']) assert.match(read(f), /supportHref|SUPPORT_EMAIL/, `${f} offers support`);
  assert.match(read('src/shell/chrome.js'), /COMPANY_URL/, 'the footer links the company');
});

test('the public pages use rules and plain text, not pill or chip boxes', () => {
  const home = buildSite()['index.html'];
  for (const banned of ['class="pill', 'class="chip', 'class="tags', 'mini__tag', 'class="eyebrow']) assert.ok(!home.includes(banned), `home still uses ${banned}`);
  const css = readFileSync(new URL('../site/site.css', import.meta.url), 'utf8');
  assert.ok(!/border-radius:\s*(999px|100px)/.test(css), 'no pill-shaped boxes in the site stylesheet');
  assert.ok(!/@keyframes\s+(float|pulse)/.test(css), 'no floating or pulsing decoration');
  const shell = readFileSync(new URL('../src/shell/shell.css', import.meta.url), 'utf8');
  assert.match(shell, /\.sh-badge \{ padding: 0; border: 0;/, 'deck status words are plain text');
});

test('type: both faces are self-hosted and the headlines use the serif', () => {
  const fonts = readFileSync(new URL('../site/fonts.css', import.meta.url), 'utf8');
  for (const f of ['inter-latin-wght-normal.woff2', 'newsreader-latin-wght-normal.woff2', 'newsreader-latin-wght-italic.woff2']) {
    assert.ok(fonts.includes(f), `${f} is declared`);
    assert.ok(existsSync(new URL(`../site/fonts/${f}`, import.meta.url)), `${f} exists`);
  }
  const css = readFileSync(new URL('../site/site.css', import.meta.url), 'utf8');
  assert.match(css, /h1, h2 \{ font-family: var\(--font-display\)/);
  const home = buildSite()['index.html'];
  assert.ok(home.includes('/fonts.css') && home.includes('rel="preload"'), 'the page loads and preloads its fonts');
});

test('the interactive tutorial is on the home page and wired up', () => {
  const home = buildSite()['index.html'];
  for (const id of ['id="tut"', 'id="tut-question"', 'id="tut-bars"', 'id="tut-opts"', 'id="tut-act"', 'id="tut-back"', 'src="/tutorial.js"']) assert.ok(home.includes(id), `missing ${id}`);
  assert.equal((home.match(/data-go="/g) ?? []).length, 4, 'four steps');
  assert.ok(home.includes('<noscript>'), 'a text fallback without JavaScript');
  assert.ok((home.match(/<svg[^>]+role="img"[^>]+aria-label=/g) ?? []).length >= 6, 'block drawings are labelled');
});

// ---- the comparison table must tell the truth about us ---------------------------------

import { GROUPS, VENDORS } from '../tools/compare.mjs';
import { getBlock } from '../src/core/blocks/index.js';
import { canUseKind, canCsv, canLeaderboard, canReports, canSelfPace, canTeam, PLANS, PRICES, TRIAL_DAYS } from '../src/billing/plans.js';
import { isProfane } from '../src/live/profanity.js';
import { parsePptx } from '../src/import/pptx.js';
import { certificateHtml } from '../src/cloud/course.js';
import { normalizeDeck } from '../src/core/schema.js';

const probeHost = (extra = {}) => new LiveHost({ transport: { open() { return { send() {}, close() {} }; }, close() {} }, room: { code: 'ABCDEF', key: 'k'.repeat(22) }, ...extra });

test('the comparison table is complete and every claim about us is backed by the product', () => {
  const rows = GROUPS.flatMap((g) => g.rows);
  const valid = /^(yes|no|paid|part|soon|check|text:.+)$/;
  assert.equal(VENDORS.length, 5, 'us and four others');
  assert.ok(VENDORS[0].us);
  for (const row of rows) {
    assert.equal(row.cells.length, VENDORS.length, row.name);
    for (const c of row.cells) assert.match(c, valid, `${row.name}: ${c}`);
    assert.notEqual(row.cells[0], 'check', `${row.name}: we never "check" ourselves`);
    assert.ok(row.cells[0] !== 'soon' || !row.needs, `${row.name}: marked not yet but claims support`);
  }
  // everything we say we can do must exist in the code
  const proof = {
    wordcloud: () => getBlock('wordcloud'), 'open-answers': () => getBlock('open-answers'), rating: () => getBlock('rating'),
    ranking: () => getBlock('ranking'), qna: () => getBlock('qna'),
    csv: () => typeof LiveHost.prototype.exportResults === 'function',
    pin: () => getBlock('pin') && typeof probeHost().setImage === 'function',
    leaderboard: () => getBlock('leaderboard') && getBlock('quiz').normalize({ ...getBlock('quiz').defaults(), timeLimit: 30 }).timeLimit === 30 && typeof probeHost().leaderboard === 'function',
    moderation: () => isProfane('shit') && typeof probeHost().approve === 'function',
    reports: () => typeof LiveHost.prototype.report === 'function',
    import: () => typeof parsePptx === 'function',
    'self-paced': () => normalizeDeck({ slides: [], course: { on: true } }).deck.course.on === true && typeof certificateHtml === 'function',
    private: () => probeHost({ privacy: true, names: true, plan: 'advanced' }).names === false,
    teams: () => /create table if not exists public\.teams/.test(readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8')) && /deck_comments/.test(readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8')),
    'free-form': () => getBlock('shape') && getLayout('free'),
    offline: () => readFileSync(new URL('../src/sw-template.js', import.meta.url), 'utf8').includes('fetch'),
    'no-storage': () => !/\.insert\(|from\('decks'\)/.test(readFileSync(new URL('../src/live/host.js', import.meta.url), 'utf8')),
  };
  for (const row of rows.filter((r) => r.needs && ['yes', 'paid', 'part'].includes(r.cells[0]))) {
    for (const need of row.needs) assert.ok(proof[need]?.(), `"${row.name}" is claimed but "${need}" is not in the product`);
  }
  // "Paid plan only" about us must really be locked on free and open on a paid plan
  const gate = {
    'kind:cloud': () => !canUseKind('free', 'cloud') && canUseKind('starter', 'cloud'),
    'kind:open': () => !canUseKind('free', 'open') && canUseKind('starter', 'open'),
    'kind:ranking': () => !canUseKind('free', 'ranking') && canUseKind('starter', 'ranking'),
    'kind:qna': () => !canUseKind('free', 'qna') && canUseKind('starter', 'qna'),
    csv: () => !canCsv('free') && canCsv('starter'),
    'kind:pin': () => !canUseKind('free', 'pin') && canUseKind('starter', 'pin'),
    leaderboard: () => !canLeaderboard('free') && canLeaderboard('starter'),
    reports: () => !canReports('free') && canReports('starter'),
    'self-paced': () => !canSelfPace('free') && canSelfPace('starter'),
    teams: () => !canTeam('free') && !canTeam('starter') && canTeam('pro'),
  };
  for (const row of rows.filter((r) => r.cells[0] === 'paid')) {
    assert.ok(row.gated?.length, `${row.name}: says paid but names no lock`);
    for (const g of row.gated) assert.ok(gate[g]?.(), `${row.name}: "${g}" is not actually locked on the free plan`);
  }
  // a "Yes" must not secretly be locked
  for (const row of rows.filter((r) => r.cells[0] === 'yes' && r.gated)) assert.fail(`${row.name}: Yes but has a lock`);
  // the price we print is the price we charge
  const price = rows.find((r) => r.name.startsWith('Cheapest paid plan')).cells[0];
  assert.ok(price.includes(`$${PRICES.starter.month} a month`) && price.includes(`${TRIAL_DAYS}-day trial`), price);
  const free = rows.find((r) => r.name === 'Free plan limits').cells[0];
  assert.ok(free.includes(`${PLANS.free.cloudDecks} decks`) && free.includes(`${PLANS.free.livePhones} phones`), free);
});

test('the table is on the home page, third after the hero and tutorial', () => {
  const home = buildSite()['index.html'];
  const order = [...home.matchAll(/<section[^>]*?(?:id="([a-z]+)"|class="(hero)")/g)].map((m) => m[1] ?? m[2]);
  assert.deepEqual(order.slice(0, 3), ['hero', 'tutorial', 'compare']);
  assert.ok(home.includes('Not yet') && home.includes('Paid plan'), 'it admits what we lack');
  assert.ok(home.includes('<caption'), 'the table has a caption');
});

test('the pricing section prints the real plans, prices and trial, and links each paid plan to its checkout page', () => {
  const home = buildSite()['index.html'];
  const pricing = home.slice(home.indexOf('id="pricing"'), home.indexOf('id="features"'));
  for (const id of ['starter', 'pro', 'advanced']) {
    assert.ok(pricing.includes(`$${PRICES[id].month}</b>`), `${id} monthly price`);
    assert.ok(pricing.includes(`$${PRICES[id].year.toLocaleString('en-US')} a year`), `${id} yearly price`);
    assert.ok(pricing.includes(`href="/app/account?plan=${id}"`), `${id} link`);
    assert.ok(pricing.includes(PLANS[id].name));
  }
  assert.ok(pricing.includes(`${TRIAL_DAYS}-day free trial`));
  assert.ok(pricing.includes(`${PLANS.free.cloudDecks} decks online`) && pricing.includes(`${PLANS.free.livePhones} phones`));
  assert.ok(!/unlimited/i.test(pricing), 'nothing here is unlimited, so the page must not say so');
});

test('the thank-you page exists, is kept out of search, and sends people to their account', () => {
  const site = buildSite();
  const page = site['welcome/index.html'];
  assert.ok(page, '/welcome/ exists');
  assert.ok(page.includes('noindex'));
  assert.ok(page.includes('/app/account?welcome=1'));
  assert.ok(site['robots.txt'].includes('Disallow: /welcome/'));
  assert.ok(!site['sitemap.xml'].includes('welcome'));
});
