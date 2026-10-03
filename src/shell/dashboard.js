// "My decks": every deck on this device, plus the ones saved online under your
// account. Cards are plain links, so open-in-new-tab and the keyboard just work.

import { h } from '../core/dom.js';
import { normalizeDeck } from '../core/schema.js';
import { Persistence } from '../editor/persist.js';
import { AssetStore } from '../editor/assets.js';
import { button, openDialog, openMenu, textInput, toast } from '../editor/ui.js';
import { getCloud } from '../cloud/instance.js';
import { slugify } from '../core/util.js';
import { blankDeck, demoDeckCopy, duplicateDeck, sampleDeckCopy } from '../library/starters.js';
import { appHeader } from './chrome.js';
import { deckPath } from './paths.js';
import { takeFlash } from './flash.js';

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
  const search = textInput({ placeholder: 'Search decks', spellcheck: false, onInput: (v) => { query = v.trim().toLowerCase(); paint(); } });
  search.type = 'search';
  search.setAttribute('aria-label', 'Search decks');
  const sortSel = h('select', { class: 'ed-input sh-sort', 'aria-label': 'Sort decks' },
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
    const input = h('input', { type: 'file', accept: '.json,application/json' });
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const { deck } = normalizeDeck(JSON.parse(await file.text()));
        await newDeck(await assets.adoptDataUrls(deck));
      } catch (err) {
        toast(err instanceof SyntaxError ? 'That file is not valid JSON.' : err.message || 'Could not import that file.', { kind: 'error' });
      }
    });
    input.click();
  }

  // ---- drawing --------------------------------------------------------------------------

  function card(item) {
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

    return h('li', { class: 'sh-card' }, link,
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
    grid.replaceChildren(...shown.map(card));
    status.textContent = cloudError;
    empty.hidden = items.length > 0;
    grid.hidden = items.length === 0;
    noMatch.hidden = !(items.length && !shown.length);
  }

  const startTile = (title, text, onClick, primary = false) => {
    const b = h('button', { type: 'button', class: `sh-start${primary ? ' sh-start--primary' : ''}` }, h('strong', { text: title }), h('span', { text }));
    b.addEventListener('click', onClick);
    return b;
  };

  const empty = h('div', { class: 'sh-empty' },
    h('h2', { text: 'Make your first deck' }),
    h('p', { text: 'Start from a blank deck, open the sample to see what is possible, or import a deck file. Your decks are saved on this device automatically.' }));
  const noMatch = h('p', { class: 'sh-empty', text: 'No decks match your search.' });
  noMatch.hidden = true;

  root.replaceChildren(appHeader({ active: 'decks' }),
    h('main', { class: 'sh-main', id: 'main' },
      h('h1', { class: 'sh-title', text: 'My decks' }),
      h('section', { 'aria-label': 'Start a new deck' },
        h('div', { class: 'sh-starts' },
          startTile('Blank deck', 'Start from an empty title and content slide', () => newDeck(blankDeck()), true),
          startTile('Sample deck', 'See the basics in a short deck', () => newDeck(sampleDeckCopy())),
          startTile('Interactive demo', 'Every block, with quizzes and a live poll', () => newDeck(demoDeckCopy())),
          startTile('Import a deck', 'Open a .json file you exported', importFile))),
      h('div', { class: 'sh-toolbar' }, search, sortSel),
      status, empty, noMatch, grid));

  const flash = takeFlash();
  if (flash) toast(flash.text, { kind: flash.kind });
  await load();
  if (!persist.durable) toast('Browser storage is unavailable here, so decks will not be kept after you close this page.', { kind: 'error', timeout: 9000 });
}
