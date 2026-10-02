// Local storage for the working deck and uploaded images. IndexedDB first
// (large quota, holds blobs); localStorage for the deck alone if IndexedDB is
// unavailable (some private windows); memory as the last resort. `mode` tells
// the UI which one is in use so it can warn that work will not survive a reload.

const DB_NAME = 'interactive-slides';
const DB_VERSION = 1;
const DECK_ID = 'current';
const LS_KEY = 'interactive-slides:deck';

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

export class Persistence {
  constructor() {
    this.db = null;
    this.mode = 'memory'; // 'idb' | 'local' | 'memory'
    this.memoryDeck = null;
  }

  async init() {
    try {
      if (!globalThis.indexedDB) throw new Error('IndexedDB unavailable');
      this.db = await new Promise((resolve, reject) => {
        const open = indexedDB.open(DB_NAME, DB_VERSION);
        open.onupgradeneeded = () => {
          open.result.createObjectStore('decks', { keyPath: 'id' });
          open.result.createObjectStore('assets', { keyPath: 'id' });
        };
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
        open.onblocked = () => reject(new Error('Database blocked'));
      });
      this.mode = 'idb';
    } catch {
      this.db = null;
      this.mode = localStorageWorks() ? 'local' : 'memory';
    }
    return this.mode;
  }

  get keepsImages() {
    return this.mode === 'idb';
  }

  get durable() {
    return this.mode !== 'memory';
  }

  async loadDeck() {
    if (this.mode === 'idb') {
      const rec = await wrap(this.db.transaction('decks').objectStore('decks').get(DECK_ID));
      return rec?.deck ?? null;
    }
    if (this.mode === 'local') {
      try {
        const raw = localStorage.getItem(LS_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    }
    return this.memoryDeck;
  }

  // Throws if the write fails so the caller can surface it.
  async saveDeck(deck) {
    if (this.mode === 'idb') {
      const tx = this.db.transaction('decks', 'readwrite');
      tx.objectStore('decks').put({ id: DECK_ID, deck, savedAt: Date.now() });
      await done(tx);
    } else if (this.mode === 'local') {
      localStorage.setItem(LS_KEY, JSON.stringify(deck));
    } else {
      this.memoryDeck = deck;
    }
  }

  async loadAssets() {
    if (this.mode !== 'idb') return [];
    return wrap(this.db.transaction('assets').objectStore('assets').getAll());
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
