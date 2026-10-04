// Local storage for the deck library and uploaded images. IndexedDB first (large
// quota, holds blobs); localStorage if IndexedDB is unavailable (some private
// windows); memory as the last resort. `mode` tells the UI which one is in use so
// it can warn that work will not survive a reload.
//
// A deck is two records: its content ("decks": the deck JSON) and a small summary
// ("meta": title, slide count, thumbnail, which cloud deck it is linked to). The
// dashboard lists summaries without loading any deck.

import { uid } from '../core/util.js';

const DB_NAME = 'interactive-slides';
const DB_VERSION = 3;
const LEGACY_DECK_ID = 'current'; // version 1 kept exactly one deck under this id
const LS_LIBRARY = 'interactive-slides:library';
const LS_LEGACY = 'interactive-slides:deck';

const wrap = (request) =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const done = (tx) =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
  });

function localStorageWorks() {
  try {
    const k = '__is_probe__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

const ASSET_REF = /asset:([a-z0-9]+)/g;
const assetIdsOf = (deck) => [...new Set([...JSON.stringify(deck).matchAll(ASSET_REF)].map((m) => m[1]))];

// The summary kept for the dashboard. `prev` carries what only the library knows
// (thumbnail, cloud link) so saving a deck never forgets it.
export function metaOf(id, deck, prev = {}) {
  const now = Date.now();
  return {
    id,
    title: String(deck?.meta?.title ?? 'Untitled deck').slice(0, 200) || 'Untitled deck',
    slideCount: Array.isArray(deck?.slides) ? deck.slides.length : 0,
    createdAt: prev.createdAt ?? now,
    updatedAt: now,
    assetIds: assetIdsOf(deck),
    thumb: prev.thumb ?? '',
    thumbSlideId: prev.thumbSlideId ?? '',
    cloudId: prev.cloudId ?? null,
    cloudUpdatedAt: prev.cloudUpdatedAt ?? null,
  };
}

export class Persistence {
  constructor() {
    this.db = null;
    this.mode = 'memory'; // 'idb' | 'local' | 'memory'
    this.memory = { metas: {}, decks: {}, reports: {} };
  }

  async init() {
    try {
      if (!globalThis.indexedDB) throw new Error('IndexedDB unavailable');
      this.db = await new Promise((resolve, reject) => {
        const open = indexedDB.open(DB_NAME, DB_VERSION);
        open.onupgradeneeded = (event) => {
          const db = open.result;
          if (event.oldVersion < 1) {
            db.createObjectStore('decks', { keyPath: 'id' });
            db.createObjectStore('assets', { keyPath: 'id' });
          }
          if (event.oldVersion < 3) db.createObjectStore('reports', { keyPath: 'id' }); // saved live-session reports
          if (event.oldVersion < 2) {
            // The single deck of version 1 becomes the first deck in the library.
            const meta = db.createObjectStore('meta', { keyPath: 'id' });
            const decks = open.transaction.objectStore('decks');
            const old = decks.get(LEGACY_DECK_ID);
            old.onsuccess = () => {
              if (!old.result) return;
              const id = uid('d_');
              decks.delete(LEGACY_DECK_ID);
              decks.put({ id, deck: old.result.deck });
              const m = metaOf(id, old.result.deck);
              m.updatedAt = Date.parse(old.result.deck?.meta?.updatedAt) || m.updatedAt; // keep the real edit date
              m.createdAt = Date.parse(old.result.deck?.meta?.createdAt) || m.createdAt;
              meta.put(m);
            };
          }
        };
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
        open.onblocked = () => reject(new Error('Database blocked'));
      });
      this.mode = 'idb';
    } catch {
      this.db = null;
      this.mode = localStorageWorks() ? 'local' : 'memory';
      if (this.mode === 'local') this.#migrateLegacyLocal();
    }
    return this.mode;
  }

  get keepsImages() {
    return this.mode === 'idb';
  }

  get durable() {
    return this.mode !== 'memory';
  }

  // ---- the localStorage / memory library ------------------------------------------

  #migrateLegacyLocal() {
    try {
      const legacy = localStorage.getItem(LS_LEGACY);
      if (!legacy || localStorage.getItem(LS_LIBRARY)) return;
      const deck = JSON.parse(legacy);
      const id = uid('d_');
      const m = metaOf(id, deck);
      m.updatedAt = Date.parse(deck?.meta?.updatedAt) || m.updatedAt;
      this.#writeLibrary({ metas: { [id]: m }, decks: { [id]: deck } });
      localStorage.removeItem(LS_LEGACY);
    } catch { /* an unreadable old deck is left alone */ }
  }

  #readLibrary() {
    if (this.mode === 'memory') return this.memory;
    try {
      return JSON.parse(localStorage.getItem(LS_LIBRARY) ?? 'null') ?? { metas: {}, decks: {} };
    } catch {
      return { metas: {}, decks: {} };
    }
  }

  #writeLibrary(lib) {
    if (this.mode === 'memory') this.memory = lib;
    else localStorage.setItem(LS_LIBRARY, JSON.stringify(lib));
  }

  // ---- the library ------------------------------------------------------------------

  // Summaries of every deck, most recently edited first.
  async listDecks() {
    let metas;
    if (this.mode === 'idb') metas = await wrap(this.db.transaction('meta').objectStore('meta').getAll());
    else metas = Object.values(this.#readLibrary().metas);
    return metas.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async getMeta(id) {
    if (this.mode === 'idb') return (await wrap(this.db.transaction('meta').objectStore('meta').get(id))) ?? null;
    return this.#readLibrary().metas[id] ?? null;
  }

  async loadDeck(id) {
    if (this.mode === 'idb') return (await wrap(this.db.transaction('decks').objectStore('decks').get(id)))?.deck ?? null;
    return this.#readLibrary().decks[id] ?? null;
  }

  // Writes the deck and refreshes its summary. `patch` sets library-only fields
  // (thumb, cloudId...). Throws if the write fails so the caller can surface it.
  async saveDeck(id, deck, patch = {}) {
    const prev = await this.getMeta(id);
    const meta = { ...metaOf(id, deck, prev ?? {}), ...patch, id };
    if (this.mode === 'idb') {
      const tx = this.db.transaction(['decks', 'meta'], 'readwrite');
      tx.objectStore('decks').put({ id, deck });
      tx.objectStore('meta').put(meta);
      await done(tx);
    } else {
      const lib = this.#readLibrary();
      lib.decks[id] = deck;
      lib.metas[id] = meta;
      this.#writeLibrary(lib);
    }
    return meta;
  }

  async createDeck(deck, patch = {}) {
    const id = uid('d_');
    await this.saveDeck(id, deck, patch);
    return id;
  }

  // Changes library-only fields (thumbnail, cloud link) without touching the deck
  // or its "edited" time.
  async patchMeta(id, patch) {
    const prev = await this.getMeta(id);
    if (!prev) return null;
    const meta = { ...prev, ...patch, id };
    if (this.mode === 'idb') {
      const tx = this.db.transaction('meta', 'readwrite');
      tx.objectStore('meta').put(meta);
      await done(tx);
    } else {
      const lib = this.#readLibrary();
      lib.metas[id] = meta;
      this.#writeLibrary(lib);
    }
    return meta;
  }

  async deleteDeck(id) {
    if (this.mode === 'idb') {
      const tx = this.db.transaction(['decks', 'meta'], 'readwrite');
      tx.objectStore('decks').delete(id);
      tx.objectStore('meta').delete(id);
      await done(tx);
    } else {
      const lib = this.#readLibrary();
      delete lib.decks[id];
      delete lib.metas[id];
      this.#writeLibrary(lib);
    }
  }

  // Every image id any deck in the library uses.
  async allAssetIds() {
    const ids = new Set();
    for (const meta of await this.listDecks()) for (const a of meta.assetIds ?? []) ids.add(a);
    return ids;
  }

  // ---- session reports -------------------------------------------------------------------
  // Kept on this device only. A report is plain data (see src/live/report.js), saved once per session id.

  async saveReport(report) {
    const record = { ...report, savedAt: Date.now() };
    if (this.mode === 'idb') {
      const tx = this.db.transaction('reports', 'readwrite');
      tx.objectStore('reports').put(record);
      await done(tx);
    } else {
      const lib = this.#readLibrary();
      lib.reports = { ...(lib.reports ?? {}), [record.id]: record };
      this.#writeLibrary(lib);
    }
    return record;
  }

  // Newest first.
  async listReports() {
    const all = this.mode === 'idb' ? await wrap(this.db.transaction('reports').objectStore('reports').getAll()) : Object.values(this.#readLibrary().reports ?? {});
    return all.sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));
  }

  async getReport(id) {
    if (this.mode === 'idb') return (await wrap(this.db.transaction('reports').objectStore('reports').get(id))) ?? null;
    return this.#readLibrary().reports?.[id] ?? null;
  }

  async deleteReport(id) {
    if (this.mode === 'idb') {
      const tx = this.db.transaction('reports', 'readwrite');
      tx.objectStore('reports').delete(id);
      await done(tx);
    } else {
      const lib = this.#readLibrary();
      if (lib.reports) delete lib.reports[id];
      this.#writeLibrary(lib);
    }
  }

  // ---- images -------------------------------------------------------------------------

  // Only the images the open deck uses are loaded into memory.
  async loadAssets(ids) {
    if (this.mode !== 'idb') return [];
    const store = this.db.transaction('assets').objectStore('assets');
    const found = await Promise.all([...ids].map((id) => wrap(store.get(id))));
    return found.filter(Boolean);
  }

  // Deletes stored images that no deck in the library uses. Images added within the
  // grace period are kept: another tab may have just added one that is not saved
  // into its deck yet.
  async gcAssets(keep, graceMs = 3_600_000) {
    if (this.mode !== 'idb') return;
    const tx = this.db.transaction('assets', 'readwrite');
    const cutoff = Date.now() - graceMs;
    await new Promise((resolve, reject) => {
      const cursor = tx.objectStore('assets').openCursor();
      cursor.onsuccess = () => {
        const c = cursor.result;
        if (!c) return resolve();
        if (!keep.has(c.value.id) && (c.value.addedAt ?? 0) < cutoff) c.delete();
        c.continue();
      };
      cursor.onerror = () => reject(cursor.error);
    });
    await done(tx);
  }

  async saveAsset(record) {
    if (this.mode !== 'idb') return;
    const tx = this.db.transaction('assets', 'readwrite');
    tx.objectStore('assets').put(record);
    await done(tx);
  }

  async deleteAsset(id) {
    if (this.mode !== 'idb') return;
    const tx = this.db.transaction('assets', 'readwrite');
    tx.objectStore('assets').delete(id);
    await done(tx);
  }
}
