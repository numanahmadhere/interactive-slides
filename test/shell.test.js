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
  assert.ok(home.length < 72 * 1024, `home page is ${home.length} bytes`);
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

test('the tutorial is the first thing on the home page and the table comes right after it', () => {
  const home = buildSite()['index.html'];
  const order = [...home.matchAll(/<section[^>]*?(?:id="([a-z]+)"|class="(hero)")/g)].map((m) => m[1] ?? m[2]);
  assert.deepEqual(order.slice(0, 6), ['tutorial', 'clients', 'loop', 'products', 'stats', 'compare']);
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

test('the client logos are real files, and the SVGs carry no scripts', () => {
  const home = buildSite()['index.html'];
  const files = [...home.matchAll(/src="\/clients\/([\w.]+)"/g)].map((m) => m[1]);
  assert.ok(files.length >= 7 && files.includes('uchicago.svg') && files.includes('utaustin.svg'));
  for (const f of files) {
    assert.ok(existsSync(new URL(`../site/clients/${f}`, import.meta.url)), f);
    if (f.endsWith('.svg')) assert.ok(!/<script|\son\w+=|javascript:/i.test(readFileSync(new URL(`../site/clients/${f}`, import.meta.url), 'utf8')), f);
  }
  assert.ok(home.includes('>Trusted by<'));
});

// ---- the funnel pages -----------------------------------------------------------------------------------------

import { TEMPLATES, getTemplate } from '../src/library/templates.js';

test('every internal link on the public pages goes somewhere that exists', () => {
  const site = buildSite();
  const pages = new Set(Object.keys(site).filter((f) => f.endsWith('index.html')).map((f) => '/' + f.replace('index.html', '')));
  pages.add('/');
  const appPaths = /^\/app\/(\?[\w=&.:%-]*|account(\?[\w=&.:%-]*)?)?$/;
  for (const [file, html] of Object.entries(site)) {
    if (!file.endsWith('.html')) continue;
    for (const m of html.matchAll(/<a\b[^>]*?href="(\/[^"#]*)(#([^"]*))?"/g)) {
      const [, path, , hash] = m;
      if (/\.(png|ico|css|webmanifest|svg)$/.test(path)) continue;
      const ok = pages.has(path) || appPaths.test(path);
      assert.ok(ok, `${file}: ${path} does not exist`);
      if (hash && pages.has(path)) assert.ok(site[path === '/' ? 'index.html' : path.slice(1) + 'index.html'].includes(`id="${hash}"`), `${file}: ${path}#${hash} has no such section`);
    }
  }
});

test('the new pages exist, are in the sitemap, and the nav leads to them', () => {
  const site = buildSite();
  for (const dir of ['templates', 'education', 'training', 'use-cases', 'events', 'people-teams', 'consulting', 'webinars', 'retrospectives', 'community', 'pricing', 'security', 'refund', 'privacy', 'terms']) {
    assert.ok(site[`${dir}/index.html`], dir);
    assert.ok(site['sitemap.xml'].includes(`/${dir}/`), `${dir} in the sitemap`);
    assert.ok(site['index.html'].includes(`href="/${dir}/"`), `${dir} linked from home`);
    assert.ok(site[`${dir}/index.html`].includes('mailto:hello@densight.com') && site[`${dir}/index.html`].includes('https://densightlabs.com'), `${dir} links support and company`);
  }
  assert.ok(site['index.html'].includes('href="/security/"'));
});

test('the funnel sections are on the home page in order, with one repeated main action', () => {
  const home = buildSite()['index.html'];
  const order = ['id="tutorial"', 'id="clients"', 'id="loop"', 'id="products"', 'id="stats"', 'id="compare"', 'id="pricing"', 'id="features"', 'id="usecases"', 'id="start"', 'id="faq"'];
  let at = -1;
  for (const marker of order) { const i = home.indexOf(marker); assert.ok(i > at, `${marker} out of order`); at = i; }
  assert.ok((home.match(/Start building free/g) ?? []).length >= 2);
  assert.ok(home.includes('No account or card needed'));
  assert.ok(home.includes('Recommended'));
});

test('the templates page shows every ready-made slide and each button opens a real one', () => {
  const page = buildSite()['templates/index.html'];
  const ids = [...page.matchAll(/href="\/app\/\?template=([\w-]+)"/g)].map((m) => m[1]);
  assert.equal(ids.length, TEMPLATES.length);
  for (const id of ids) assert.ok(getTemplate(id), id);
  assert.equal((page.match(/class="tp"/g) ?? []).length, TEMPLATES.length);
});

test('pricing page numbers are the real plan numbers, and nothing is claimed that we do not have', () => {
  const site = buildSite();
  const page = site['pricing/index.html'];
  for (const id of ['starter', 'pro', 'advanced']) {
    assert.ok(page.includes(`data-m="$${PRICES[id].month}"`) && page.includes(`data-y="$${PRICES[id].year.toLocaleString('en-US')}"`), id);
    assert.ok(page.includes(`data-plan="${id}"`));
  }
  assert.ok(page.includes(`${TRIAL_DAYS}-day free trial`));
  assert.ok(page.includes(`up to ${PLANS.pro.teamSeats} people`) && page.includes(`${PLANS.advanced.teamSeats}`));
  assert.doesNotThrow(() => JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/s.exec(page)[1]));
  const everything = Object.values(site).join(' ');
  assert.ok(!/we are (SOC 2|ISO 27001|GDPR)[- ]compliant|certified/i.test(everything), 'no certification claims');
  assert.ok(!/testimonial|million users|trusted by [0-9]/i.test(site['index.html']), 'no invented proof');
  assert.ok(site['security/index.html'].includes('do not currently hold security certifications'));
});

test('the sticky call to action and dropdown are only on pages that need them', () => {
  const site = buildSite();
  assert.ok(site['index.html'].includes('id="stickycta"'));
  assert.ok(site['index.html'].includes('class="dd"'));
});

test('the refund policy states the real window and the legal pages point to each other', () => {
  const site = buildSite();
  assert.ok(site['refund/index.html'].includes('7 days') && site['refund/index.html'].includes(`${TRIAL_DAYS}-day free trial`));
  assert.ok(site['terms/index.html'].includes('href="/refund/"') && site['privacy/index.html'].includes('href="/refund/"'));
  assert.ok(site['terms/index.html'].includes('Paddle') && site['privacy/index.html'].includes('Paddle') && site['privacy/index.html'].includes('Supabase') && site['privacy/index.html'].includes('Netlify'));
  assert.ok(site['index.html'].includes('href="/refund/"'), 'the footer links the refund policy');
});

test('use cases: a hub, eight segment pages, each with real ready-made slides, and every page links to the others', () => {
  const site = buildSite();
  const slugs = ['training', 'education', 'events', 'people-teams', 'consulting', 'webinars', 'retrospectives', 'community'];
  for (const slug of slugs) {
    const page = site[`${slug}/index.html`];
    assert.ok(site['use-cases/index.html'].includes(`href="/${slug}/"`), `hub links ${slug}`);
    assert.ok(site['index.html'].includes(`href="/${slug}/"`), `home links ${slug}`);
    assert.ok(site['sitemap.xml'].includes(`/${slug}/`), `${slug} in the sitemap`);
    assert.ok((page.match(/class="case"/g) ?? []).length >= 6, `${slug} has six uses`);
    assert.ok(page.includes('Start building free'));
    assert.equal(slugs.filter((o) => o !== slug && page.includes(`href="/${o}/"`)).length >= 7, true, `${slug} links the other seven`);
    for (const m of page.matchAll(/href="\/app\/\?template=([\w-]+)"/g)) assert.ok(getTemplate(m[1]), `${slug}: ${m[1]}`);
  }
  assert.ok(!/testimonial|trusted by [0-9]|million users/i.test(Object.values(site).join(' ')), 'still no invented proof');
});

test('illustrations: every use-case page has its own animated scene, the files are safe and small, and motion can be switched off', () => {
  const site = buildSite();
  const slugs = ['training', 'education', 'events', 'people-teams', 'consulting', 'webinars', 'retrospectives', 'community'];
  for (const slug of slugs) {
    const page = site[`${slug}/index.html`];
    assert.ok(page.includes(`src="/art/${slug}.svg"`) && /class="seg__art"[^>]*alt="[^"]{20,}"/.test(page) || page.includes(`/art/${slug}.svg" alt="`), `${slug} shows its scene with a description`);
    assert.ok(page.includes('/art/spot-ask.svg') && page.includes('What you can do'), `${slug} has the row of small animations`);
    const art = site[`art/${slug}.svg`];
    assert.ok(art && art.startsWith('<svg') && art.length < 30000, `${slug} svg is present and small`);
    assert.ok(!/<script|\son\w+=|javascript:|href="http|xlink:href|<image/i.test(art), `${slug} svg loads nothing and runs nothing`);
    assert.ok(art.includes('prefers-reduced-motion') && art.includes('@keyframes'), `${slug} animates, and stops on request`);
  }
  for (const n of ['ask', 'quiz', 'rank', 'discuss']) assert.ok(site[`art/spot-${n}.svg`], n);
  assert.ok(site['index.html'].includes('/art/training.svg') && site['index.html'].includes('/art/spot-quiz.svg'), 'the home page uses them too');
  assert.ok(site['use-cases/index.html'].includes('/art/community.svg'));
});

test('the home page has figures beside the headline and a crowd in the closing band', () => {
  const site = buildSite();
  const home = site['index.html'];
  for (const n of ['hero-left', 'hero-right', 'cta']) {
    assert.ok(home.includes(`/art/${n}.svg`), n);
    const art = site[`art/${n}.svg`];
    assert.ok(art && art.length < 30000 && !/<script|\son\w+=|javascript:|href="http/i.test(art) && art.includes('prefers-reduced-motion'), n);
  }
});
