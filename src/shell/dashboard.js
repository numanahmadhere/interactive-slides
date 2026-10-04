// "My decks": every deck on this device, plus the ones saved online under your
// account. Cards are plain links, so open-in-new-tab and the keyboard just work.

import { h } from '../core/dom.js';
import { normalizeDeck } from '../core/schema.js';
import { Persistence } from '../editor/persist.js';
import { AssetStore } from '../editor/assets.js';
import { button, openDialog, openMenu, textInput, toast } from '../editor/ui.js';
import { icon } from '../editor/icons.js';
import { getCloud } from '../cloud/instance.js';
import { slugify } from '../core/util.js';
import { slideToPng } from '../export/png.js';
import { blankDeck, demoDeckCopy, duplicateDeck, sampleDeckCopy } from '../library/starters.js';
import { getTemplate } from '../library/templates.js';
import { appFooter, appHeader } from './chrome.js';
import { deckPath } from './paths.js';
import { setFlash, takeFlash } from './flash.js';

const ago = (ms) => {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} d ago`;
  return new Date(ms).toLocaleDateString([], { dateStyle: 'medium' });
};

export async function mountDashboard(root) {
  const persist = new Persistence();
  await persist.init();
  const assets = new AssetStore(persist);
  const cloud = getCloud();
  let query = '';
  let sort = 'recent';
  let items = [];
  let cloudError = '';

  const grid = h('ul', { class: 'sh-grid', 'aria-label': 'Your decks' });
  const status = h('p', { class: 'sh-status', role: 'status', 'aria-live': 'polite' });
  const search = textInput({ placeholder: 'Search your decks', spellcheck: false, onInput: (v) => { query = v.trim().toLowerCase(); paint(); } });
  search.type = 'search';
  search.setAttribute('aria-label', 'Search decks');
  search.classList.add('sh-input');
  const sortSel = h('select', { class: 'sh-input sh-sort', 'aria-label': 'Sort decks' },
    h('option', { value: 'recent', text: 'Recently edited' }), h('option', { value: 'name', text: 'Name' }));
  sortSel.addEventListener('change', () => { sort = sortSel.value; paint(); });

  // ---- data -------------------------------------------------------------------------

  async function load() {
    const local = await persist.listDecks();
    const linked = new Set(local.map((m) => m.cloudId).filter(Boolean));
    items = local.map((m) => ({ kind: 'local', id: m.id, title: m.title, updatedAt: m.updatedAt, thumb: m.thumb, slides: m.slideCount, cloudId: m.cloudId, meta: m }));
    if (cloud?.user) {
      try {
        for (const row of await cloud.list()) {
          const mine = items.find((i) => i.cloudId === row.id);
          if (mine) mine.shared = !!row.share_token;
          else if (!linked.has(row.id)) items.push({ kind: 'cloud', id: row.id, title: row.title, updatedAt: Date.parse(row.updated_at) || 0, thumb: row.thumb ?? '', cloudId: row.id, shared: !!row.share_token, cloudUpdatedAt: row.updated_at });
        }
        cloudError = '';
      } catch (err) {
        cloudError = err.code === 'signed_out' ? '' : `Could not load your online decks: ${err.message}`;
      }
    }
    paint();
  }

  // Decks that have never been opened (duplicates, imports, samples) have no preview yet:
  // draw the first slide small, one at a time, so the grid fills in without a stall.
  let drawing = false;
  async function drawMissingThumbs() {
    if (drawing) return;
    drawing = true;
    try {
      for (const item of items.filter((i) => i.kind === 'local' && !i.thumb).slice(0, 8)) {
        const deck = await persist.loadDeck(item.id);
        if (!deck?.slides?.length) continue;
        const local = new AssetStore(persist);
        await local.init(local.referenced({ ...deck, slides: [deck.slides[0]], brand: deck.brand }));
        const mini = await local.inline({ ...deck, slides: [deck.slides[0]] });
        const blob = await slideToPng(mini, 0, { scale: 0.2 });
        const thumb = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(r.error); r.readAsDataURL(blob); });
        await persist.patchMeta(item.id, { thumb, thumbSlideId: deck.slides[0].id });
        item.thumb = thumb;
        paint();
      }
    } catch (err) {
      console.warn('Could not draw a preview', err);
    } finally {
      drawing = false;
    }
  }

  // ---- actions ------------------------------------------------------------------------

  const go = (path) => location.assign(path);

  async function newDeck(deck, flash) {
    const id = await persist.createDeck(deck);
    go(deckPath(id));
    return flash;
  }

  async function openCloudOnly(item) {
    status.textContent = 'Opening...';
    try {
      const row = await cloud.get(item.cloudId);
      const { deck } = normalizeDeck(row.data);
      const adopted = await assets.adoptDataUrls(deck);
      const id = await persist.createDeck(adopted, { cloudId: row.id, cloudUpdatedAt: row.updated_at });
      go(deckPath(id));
    } catch (err) {
      status.textContent = err.message || 'Could not open that deck.';
    }
  }

  function prompt({ title, label, value, action }) {
    return new Promise((resolve) => {
      let text = value;
      const input = textInput({ value, onInput: (v) => { text = v; } });
      input.setAttribute('aria-label', label);
      const dlg = openDialog({ title, content: h('div', null, input, h('div', { class: 'ed-live__actions' },
        button({ label: 'Cancel', onClick: () => { dlg.close(); resolve(null); } }),
        button({ label: action, variant: 'primary', onClick: () => { dlg.close(); resolve(text.trim()); } }))) });
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { dlg.close(); resolve(text.trim()); } });
      input.select();
    });
  }

  async function rename(item) {
    const title = await prompt({ title: 'Rename deck', label: 'Deck name', value: item.title, action: 'Rename' });
    if (!title || title === item.title) return;
    const deck = await persist.loadDeck(item.id);
    deck.meta = { ...deck.meta, title: title.slice(0, 200), updatedAt: new Date().toISOString() };
    await persist.saveDeck(item.id, deck);
    if (item.cloudId && cloud?.user) {
      try {
        const row = await cloud.rename(item.cloudId, title);
        if (row) await persist.patchMeta(item.id, { cloudUpdatedAt: row.updated_at });
      } catch { /* the online title follows at the next save */ }
    }
    await load();
  }

  async function duplicate(item) {
    const deck = await persist.loadDeck(item.id);
    await persist.createDeck(duplicateDeck(deck));
    toast('Duplicated.');
    await load();
  }

  async function download(item) {
    try {
      const deck = await persist.loadDeck(item.id);
      await assets.init(assets.referenced(deck));
      const data = await assets.inline(deck);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = h('a', { href: URL.createObjectURL(blob), download: `${slugify(item.title)}.deck.json` });
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    } catch (err) {
      toast('Could not download that deck.', { kind: 'error' });
    }
  }

  function remove(item) {
    const online = !!item.cloudId && !!cloud?.user;
    let alsoOnline = item.kind === 'cloud';
    const box = h('input', { type: 'checkbox', id: 'sh-del-online' });
    box.checked = alsoOnline;
    box.addEventListener('change', () => { alsoOnline = box.checked; });
    const dlg = openDialog({
      title: 'Delete this deck?',
      content: h('div', null,
        h('p', { text: `"${item.title}" will be deleted${item.kind === 'cloud' ? ' from your online account' : ' from this device'}. This cannot be undone.` }),
        online && item.kind === 'local' ? h('label', { class: 'sh-check', for: 'sh-del-online' }, box, ' Also delete the online copy') : null,
        h('div', { class: 'ed-live__actions' },
          button({ label: 'Cancel', onClick: () => dlg.close() }),
          button({ label: 'Delete', variant: 'danger', onClick: async () => {
            dlg.close();
            try {
              if (item.kind === 'local') await persist.deleteDeck(item.id);
              if (item.cloudId && cloud?.user && alsoOnline) await cloud.remove(item.cloudId);
              toast('Deleted.');
            } catch (err) {
              toast(err.message || 'Could not delete everything.', { kind: 'error' });
            }
            await load();
          } }))),
    });
  }

  function importFile() {
    const input = h('input', { type: 'file', accept: '.json,application/json,.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation' });
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        let raw;
        if (/\.pptx$/i.test(file.name)) {
          const { pptxToDeck } = await import('../import/pptx.js'); // loaded only when someone imports
          const out = await pptxToDeck(new Uint8Array(await file.arrayBuffer()), file.name);
          raw = out.deck;
          if (out.warnings.length) setFlash(['PowerPoint imported.', ...out.warnings].join(' '));
          else setFlash('PowerPoint imported.');
        } else raw = JSON.parse(await file.text());
        const { deck } = normalizeDeck(raw);
        await newDeck(await assets.adoptDataUrls(deck));
      } catch (err) {
        toast(err instanceof SyntaxError ? 'That file is not valid JSON.' : err.message || 'Could not import that file.', { kind: 'error' });
      }
    });
    input.click();
  }

  // ---- drawing --------------------------------------------------------------------------

  function card(item, index = 0) {
    const open = item.kind === 'local' ? { href: deckPath(item.id) } : { href: '#', onclick: (e) => { e.preventDefault(); openCloudOnly(item); } };
    const thumb = h('div', { class: 'sh-thumb' });
    if (item.thumb && /^data:image\/png;base64,/.test(item.thumb)) thumb.append(h('img', { src: item.thumb, alt: '', loading: 'lazy' }));
    else thumb.append(h('span', { class: 'sh-thumb__initial', 'aria-hidden': 'true', text: (item.title[0] ?? 'D').toUpperCase() }));
    const link = h('a', { class: 'sh-card__open', href: open.href, 'aria-label': `Open ${item.title}` }, thumb);
    if (open.onclick) link.addEventListener('click', open.onclick);

    const menuBtn = button({ icon: 'dots', label: `Actions for ${item.title}`, iconOnly: true, variant: 'ghost', onClick: (e, el) => {
      const items = item.kind === 'local'
        ? [{ label: 'Open', value: 'open' }, { label: 'Rename', value: 'rename' }, { label: 'Duplicate', value: 'dup' }, { label: 'Download (JSON)', value: 'dl' }, { label: 'Delete', value: 'del' }]
        : [{ label: 'Open', value: 'open' }, { label: 'Delete online copy', value: 'del' }];
      openMenu({ anchor: el, label: 'Deck actions', items, onPick: (v) => {
        if (v === 'open') (item.kind === 'local' ? go(deckPath(item.id)) : openCloudOnly(item));
        else if (v === 'rename') rename(item);
        else if (v === 'dup') duplicate(item);
        else if (v === 'dl') download(item);
        else remove(item);
      } });
    } });

    const badges = [];
    if (item.kind === 'cloud') badges.push(h('span', { class: 'sh-badge', text: 'Online only' }));
    else if (item.cloudId) badges.push(h('span', { class: 'sh-badge sh-badge--ok', text: 'Online' }));
    if (item.shared) badges.push(h('span', { class: 'sh-badge sh-badge--share', text: 'Shared' }));

    return h('li', { class: 'sh-card', style: `--i:${Math.min(index, 12)}` }, link,
      h('div', { class: 'sh-card__body' },
        h('div', { class: 'sh-card__text' },
          h('a', { class: 'sh-card__title', href: open.href, text: item.title, onclick: open.onclick }),
          h('div', { class: 'sh-card__meta' }, `${item.slides ? `${item.slides} slide${item.slides === 1 ? '' : 's'}  ·  ` : ''}Edited ${ago(item.updatedAt)}`, ...badges)),
        menuBtn));
  }

  function paint() {
    const shown = items
      .filter((i) => !query || i.title.toLowerCase().includes(query))
      .sort((a, b) => (sort === 'name' ? a.title.localeCompare(b.title) : b.updatedAt - a.updatedAt));
    grid.replaceChildren(...shown.map((item, i) => card(item, i)));
    skeleton.hidden = true;
    status.textContent = cloudError;
    empty.hidden = items.length > 0;
    grid.hidden = items.length === 0;
    noMatch.hidden = !(items.length && !shown.length);
  }

  const startTile = (iconName, title, text, onClick, primary = false) => {
    const b = h('button', { type: 'button', class: `sh-start${primary ? ' sh-start--primary' : ''}` },
      h('span', { class: 'sh-start__icon', 'aria-hidden': 'true' }, icon(iconName, 22)),
      h('span', { class: 'sh-start__text' }, h('strong', { text: title }), h('span', { text })),
      h('span', { class: 'sh-start__go', 'aria-hidden': 'true' }, icon('arrow', 18)));
    b.addEventListener('click', onClick);
    return b;
  };

  const empty = h('div', { class: 'sh-empty' },
    h('div', { class: 'sh-empty__art', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')),
    h('h2', { text: 'Your first deck starts here' }),
    h('p', { text: 'Pick a blank deck, or open the interactive demo to see quizzes, polls and diagrams working. Everything is saved on this device as you go.' }));
  const noMatch = h('p', { class: 'sh-nomatch', text: 'No decks match your search.' });
  noMatch.hidden = true;
  const skeleton = h('div', { class: 'sh-grid sh-skeleton', 'aria-hidden': 'true' },
    ...Array.from({ length: 4 }, () => h('div', { class: 'sh-card sh-card--ghost' }, h('div', { class: 'sh-thumb' }), h('div', { class: 'sh-card__body' }, h('div', { class: 'sh-line' }), h('div', { class: 'sh-line sh-line--short' })))));

  empty.hidden = true;
  grid.hidden = true;
  const newBtn = h('button', { type: 'button', class: 'sh-btn sh-btn--primary' }, icon('plus', 16), h('span', { text: 'New deck' }));
  newBtn.addEventListener('click', () => newDeck(blankDeck()));

  root.replaceChildren(appHeader({ active: 'decks', actions: [newBtn] }),
    h('main', { class: 'sh-main', id: 'main' },
      h('div', { class: 'sh-head' },
        h('div', {}, h('h1', { class: 'sh-title', text: 'My decks' }), h('p', { class: 'sh-sub', text: 'Build, present and share interactive slides.' }))),
      h('section', { 'aria-label': 'Start a new deck', class: 'sh-starts' },
        startTile('blank', 'Blank deck', 'Start from scratch', () => newDeck(blankDeck()), true),
        startTile('demo', 'Interactive demo', 'Quizzes, polls and diagrams', () => newDeck(demoDeckCopy())),
        startTile('sample', 'Sample deck', 'A short deck to learn from', () => newDeck(sampleDeckCopy())),
        startTile('upload', 'Import a deck', 'A PowerPoint (.pptx) or .json file', importFile)),
      h('div', { class: 'sh-toolbar' },
        h('div', { class: 'sh-search' }, icon('search', 16), search), sortSel),
      status, skeleton, empty, noMatch, grid),
    appFooter());

  const flash = takeFlash();
  if (flash) toast(flash.text, { kind: flash.kind });
  // /app/?template=ID (from the public templates page): start a new deck from that ready-made slide.
  const wanted = getTemplate(new URLSearchParams(location.search).get('template') ?? '');
  if (wanted) {
    const deck = blankDeck();
    deck.slides = [wanted.make()];
    deck.meta.title = wanted.name;
    await newDeck(deck);
    return;
  }
  await load();
  drawMissingThumbs();
  if (!persist.durable) toast('Browser storage is unavailable here, so decks will not be kept after you close this page.', { kind: 'error', timeout: 9000 });
}
