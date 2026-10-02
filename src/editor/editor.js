// The editor controller: owns the store, the selection and the views, exposes
// every user action (add slide, delete block, undo, import, ...) and routes
// keyboard shortcuts. Views call back into it; none of them talk to each other.

import { h, svgIcon } from '../core/dom.js';
import { createDeck, createSlide, normalizeDeck } from '../core/schema.js';
import { createBlock, listBlocks, getBlock } from '../core/blocks/index.js';
import { getLayout, listLayouts } from '../core/layouts.js';
import { sampleDeck } from '../samples/sample-deck.js';
import { interactiveDeck } from '../samples/interactive-deck.js';
import { Session } from '../core/session.js';
import { slugify } from '../core/util.js';
import * as ops from './ops.js';
import { Store } from './store.js';
import { Persistence } from './persist.js';
import { AssetStore } from './assets.js';
import { CanvasView } from './canvas.js';
import { SlideList } from './sidebar.js';
import { Inspector } from './inspector.js';
import { openPresenter } from './presenter.js';
import { button, openMenu, toast } from './ui.js';
import { openExportDialog } from './export-dialog.js';
import { openFindDialog } from './find-dialog.js';
import { openLiveDialog } from './live-dialog.js';
import { LiveHost } from '../live/host.js';
import { createTransport } from '../live/transport.js';
import { newRoom } from '../live/protocol.js';
import { Exporter } from './exporter.js';

const SAVE_DELAY_MS = 600;
const SAVE_LABELS = { saved: 'Saved', saving: 'Saving...', error: 'Not saved' };

function starterDeck() {
  const deck = createDeck({ title: 'Untitled deck' });
  deck.slides = [createSlide('title'), createSlide('content')];
  return deck;
}

const isTyping = (el) => !!el?.closest?.('input, textarea, select, [contenteditable="true"], [contenteditable="plaintext-only"]');

export class Editor {
  constructor(mount) {
    this.mount = mount;
    this.persist = new Persistence();
    this.assets = new AssetStore(this.persist);
    this.selection = { slideId: null, blockId: null, slotId: null };
    this.presenter = null;
    this.live = null; // { host, room, config, base } while a live session is open
    this.session = new Session(); // view state in the editor: open tabs, flipped cards
    this.exporter = new Exporter(this);
    this.saveTimer = 0;
    this.saveState = 'saved';
    this.warnedImages = false;
  }

  get deck() {
    return this.store.deck;
  }

  get slideIndex() {
    const i = this.deck.slides.findIndex((s) => s.id === this.selection.slideId);
    return i < 0 ? 0 : i;
  }

  get slide() {
    return this.deck.slides[this.slideIndex];
  }

  toast(message, opts) {
    toast(message, opts);
  }

  async start() {
    await this.persist.init();
    let deck = null;
    try {
      const saved = await this.persist.loadDeck();
      if (saved) {
        const result = normalizeDeck(saved);
        deck = result.deck;
        if (result.warnings.length) console.warn('Saved deck was repaired:', result.warnings);
      }
    } catch (err) {
      console.error('Could not load the saved deck', err);
    }
    deck ??= starterDeck();
    try {
      await this.assets.init();
      await this.assets.gc(deck);
    } catch (err) {
      console.error('Could not load stored images', err);
    }

    this.store = new Store(deck);
    this.selection.slideId = deck.slides[0].id;
    this.#build();
    this.store.subscribe((change) => this.#onChange(change));
    this.#bindGlobal();
    this.#syncAll({ selectionChanged: true });
    this.#setSaveState('saved');

    if (!this.persist.durable) {
      toast('Browser storage is unavailable, so this deck will not survive a reload. Export it to keep it.', { kind: 'error', timeout: 9000 });
    }
  }

  // ---- layout ------------------------------------------------------------

  #build() {
    this.titleInput = h('input', { class: 'ed-title', type: 'text', 'aria-label': 'Deck title', placeholder: 'Untitled deck', spellcheck: 'false' });
    this.titleInput.addEventListener('input', () =>
      this.commit(ops.setTitle(this.deck, this.titleInput.value), { source: 'title', coalesce: 'title' }));
    this.titleInput.addEventListener('blur', () => {
      this.store.endCoalesce();
      if (!this.titleInput.value.trim()) this.commit(ops.setTitle(this.deck, 'Untitled deck'), { source: 'ui' });
    });
    this.titleInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.titleInput.blur();
    });

    this.undoBtn = button({ icon: 'undo', label: 'Undo (Ctrl+Z)', iconOnly: true, variant: 'ghost', onClick: () => this.undo() });
    this.redoBtn = button({ icon: 'redo', label: 'Redo (Ctrl+Shift+Z)', iconOnly: true, variant: 'ghost', onClick: () => this.redo() });
    this.statusEl = h('div', { class: 'ed-status', role: 'status', 'aria-live': 'polite' });
    this.fileBtn = button({ label: 'File', onClick: (e, el) => this.openFileMenu(el) });
    this.presentBtn = button({ icon: 'play', label: 'Present', variant: 'primary', title: 'Present from this slide (Ctrl+Enter)', onClick: () => this.present() });
    this.presentMenuBtn = button({ icon: 'chevron', label: 'More ways to present', iconOnly: true, variant: 'primary', onClick: (e, el) => this.openPresentMenu(el) });
    const presentGroup = h('div', { class: 'ed-split' }, this.presentBtn, this.presentMenuBtn);

    const top = h('header', { class: 'ed-top' },
      h('div', { class: 'ed-logo', 'aria-hidden': 'true' }, svgIcon('M4 5h16v10H4zM8 19h8M12 15v4', { size: 16 })),
      this.titleInput,
      h('div', { class: 'ed-top__group' }, this.undoBtn, this.redoBtn),
      h('div', { class: 'ed-top__spacer' }),
      this.statusEl, this.fileBtn, presentGroup);

    const side = h('aside', { class: 'ed-side', 'aria-label': 'Slides panel' });
    const canvasHost = h('div', { class: 'ed-canvas' });
    const main = h('main', { class: 'ed-main' }, canvasHost);
    const insp = h('aside', { class: 'ed-insp', 'aria-label': 'Inspector panel' });

    this.el = h('div', { class: 'ed' }, top, side, main, insp);
    this.mount.replaceChildren(this.el);

    this.sidebar = new SlideList(side, this);
    this.canvas = new CanvasView(canvasHost, this);
    this.inspector = new Inspector(insp, this);
  }

  // ---- state -------------------------------------------------------------

  commit(next, opts) {
    return this.store.commit(next, opts);
  }

  // select({}) means the slide itself; select({ blockId }) or ({ slotId }) narrows it.
  select(next = {}) {
    const deck = this.deck;
    const slideId = deck.slides.some((s) => s.id === next.slideId) ? next.slideId : this.selection.slideId;
    const slide = deck.slides.find((s) => s.id === slideId);
    let blockId = next.blockId ?? null;
    let slotId = next.slotId ?? null;
    if (blockId) {
      const hit = ops.findBlock(deck, blockId);
      if (!hit || hit.slide.id !== slideId) blockId = null;
    }
    if (slotId && !getLayout(slide.layout).slots.some((s) => s.id === slotId)) slotId = null;

    const prev = this.selection;
    if (prev.slideId === slideId && prev.blockId === blockId && prev.slotId === slotId) return;
    if (this.canvas.isEditing && (slideId !== prev.slideId || blockId !== this.canvas.editing.blockId)) this.canvas.finishEdit();
    this.store.endCoalesce();
    this.selection = { slideId, blockId, slotId };
    this.#syncAll({ selectionChanged: true });
  }

  #repairSelection(prevDeck) {
    const deck = this.deck;
    let { slideId, blockId, slotId } = this.selection;
    if (!deck.slides.some((s) => s.id === slideId)) {
      const prevIndex = prevDeck.slides.findIndex((s) => s.id === slideId);
      slideId = deck.slides[Math.min(Math.max(prevIndex, 0), deck.slides.length - 1)].id;
      blockId = null;
      slotId = null;
    }
    if (blockId) {
      const hit = ops.findBlock(deck, blockId);
      if (!hit || hit.slide.id !== slideId) blockId = null;
    }
    if (slotId) {
      const layout = getLayout(deck.slides.find((s) => s.id === slideId).layout);
      if (!layout.slots.some((s) => s.id === slotId)) slotId = null;
    }
    this.selection = { slideId, blockId, slotId };
  }

  #onChange({ prev, source }) {
    this.#repairSelection(prev);
    const quiet = source === 'inspector' || source === 'canvas-edit' || source === 'title';
    this.#syncAll({ source, rebuildInspector: !quiet });
    this.#scheduleSave();
  }

  // Re-draw every view from the current state (after an edit that may not have
  // changed the deck itself).
  refresh() {
    this.#syncAll({});
  }

  #syncAll({ source, selectionChanged = false, rebuildInspector = true } = {}) {
    this.canvas.sync({ source });
    this.sidebar.sync();
    this.inspector.sync({ rebuild: rebuildInspector, selectionChanged });
    this.undoBtn.disabled = !this.store.canUndo;
    this.redoBtn.disabled = !this.store.canRedo;
    if (document.activeElement !== this.titleInput) this.titleInput.value = this.deck.meta.title;
  }

  // ---- autosave ----------------------------------------------------------

  #setSaveState(state) {
    this.saveState = state;
    this.statusEl.textContent = SAVE_LABELS[state];
    this.statusEl.dataset.state = state;
  }

  #scheduleSave() {
    this.#setSaveState('saving');
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flushSave(), SAVE_DELAY_MS);
  }

  async flushSave() {
    clearTimeout(this.saveTimer);
    const deck = this.deck;
    try {
      await this.persist.saveDeck(deck);
      if (deck === this.deck) this.#setSaveState('saved');
    } catch (err) {
      console.error('Autosave failed', err);
      this.#setSaveState('error');
      toast('Could not save. Export the deck to keep a copy.', { kind: 'error' });
    }
  }

  // ---- slide actions -----------------------------------------------------

  undo() {
    if (this.canvas.isEditing) this.canvas.finishEdit();
    this.store.undo();
  }

  redo() {
    if (this.canvas.isEditing) this.canvas.finishEdit();
    this.store.redo();
  }

  addSlide(layoutId, index = this.slideIndex + 1) {
    const slide = createSlide(layoutId);
    this.commit(ops.insertSlide(this.deck, index, slide));
    this.select({ slideId: slide.id });
  }

  duplicateSlide(id) {
    const hit = ops.findSlide(this.deck, id);
    if (!hit) return;
    const copy = ops.cloneSlide(hit.slide);
    this.commit(ops.insertSlide(this.deck, hit.index + 1, copy));
    this.select({ slideId: copy.id });
  }

  deleteSlide(id) {
    if (this.deck.slides.length <= 1) {
      toast('A deck needs at least one slide.');
      return;
    }
    this.commit(ops.deleteSlide(this.deck, id));
  }

  moveSlide(from, to) {
    this.commit(ops.moveSlide(this.deck, from, to));
  }

  openLayoutMenu(anchor) {
    openMenu({
      anchor,
      label: 'New slide layout',
      items: listLayouts().map((l) => ({ label: l.name, value: l.id })),
      onPick: (id) => this.addSlide(id),
    });
  }

  // ---- block actions -----------------------------------------------------

  // target: { slot } | { afterBlockId } | { containerOf, index }
  addBlock(type, target) {
    const block = createBlock(type);
    if (!this.commit(ops.insertBlock(this.deck, this.selection.slideId, target, block))) return;
    if (target.containerOf) {
      // Show the section the block went into, or it would look like nothing happened.
      const view = this.session.get(target.containerOf);
      view.active = target.index;
      view.open = [...new Set([...(view.open ?? []), target.index])];
    }
    this.select({ blockId: block.id });
    if (type === 'image') this.pickImage(block.id);
    else if (getBlock(type)?.edit?.length) this.canvas.startEdit(block.id, { selectAll: true });
  }

  deleteBlock(id) {
    this.commit(ops.removeBlock(this.deck, id));
  }

  duplicateBlock(id) {
    const next = ops.duplicateBlock(this.deck, id);
    const hit = ops.findBlock(next, id);
    if (!hit || !this.commit(next)) return;
    this.select({ blockId: hit.siblings[hit.index + 1].id });
  }

  moveBlock(id, dir) {
    this.commit(ops.moveBlock(this.deck, id, dir));
  }

  // Block types that cannot go inside a container: itself, and (for tabs and
  // accordions) the other titled containers, which would nest confusingly.
  excludedInside(container) {
    const spec = container && getBlock(container.type)?.container;
    if (!spec) return [];
    return listBlocks()
      .filter((d) => d.container && (d.type === container.type || (spec.titled && d.container.titled)))
      .map((d) => d.type);
  }

  openBlockMenu(anchor, target, { exclude = [] } = {}) {
    const items = [];
    let group = null;
    for (const def of listBlocks()) {
      if (exclude.includes(def.type)) continue;
      if (def.group !== group) {
        group = def.group;
        items.push({ heading: group });
      }
      items.push({ label: def.label, value: def.type });
    }
    openMenu({ anchor, label: 'Add block', items, onPick: (type) => this.addBlock(type, target) });
  }

  // ---- images ------------------------------------------------------------

  // Pick one image file, store it, and hand its reference to apply() (the deck
  // logo, a slide background).
  chooseImage(apply) {
    const input = h('input', { type: 'file', accept: 'image/*' });
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      if (!this.persist.keepsImages && !this.warnedImages) {
        this.warnedImages = true;
        toast('Images are kept for this session only because browser storage is limited.', { kind: 'error', timeout: 6000 });
      }
      try {
        apply(await this.assets.add(file));
      } catch (err) {
        toast(err.message || 'Could not add that image.', { kind: 'error' });
      }
    });
    input.click();
  }

  // key: which image of the block (before/after blocks hold two).
  pickImage(blockId, key) {
    const input = h('input', { type: 'file', accept: 'image/*', multiple: blockId ? undefined : true });
    input.addEventListener('change', () => {
      if (input.files?.length) this.addImageFiles([...input.files], { blockId, key });
    });
    input.click();
  }

  async addImageFiles(files, { blockId, key, slot } = {}) {
    if (!this.persist.keepsImages && !this.warnedImages) {
      this.warnedImages = true;
      toast('Images are kept for this session only because browser storage is limited.', { kind: 'error', timeout: 6000 });
    }
    let first = true;
    for (const file of files) {
      try {
        const src = await this.assets.add(file);
        const hit = first && blockId ? ops.findBlock(this.deck, blockId) : null;
        const keys = hit ? ops.imageKeys(hit.block) : [];
        if (hit && keys.length) {
          const prop = keys.includes(key) ? key : keys.find((k) => !hit.block.props[k]) ?? keys[0];
          this.commit(ops.patchBlockProps(this.deck, hit.block.id, { [prop]: src }));
          this.select({ blockId: hit.block.id });
        } else {
          const layout = getLayout(this.slide.layout);
          const slotId = layout.slots.some((s) => s.id === slot) ? slot : ops.defaultSlot(layout);
          const block = createBlock('image', { props: { src, fit: 'contain' } });
          this.commit(ops.insertBlock(this.deck, this.slide.id, { slot: slotId }, block));
          this.select({ blockId: block.id });
        }
      } catch (err) {
        toast(err.message || 'Could not add that image.', { kind: 'error' });
      }
      first = false;
    }
  }

  // ---- file menu, import and export --------------------------------------

  openFileMenu(anchor) {
    openMenu({
      anchor,
      label: 'File',
      items: [
        { label: 'New deck', value: 'new' },
        { label: 'Open sample deck', value: 'sample' },
        { label: 'Open interactive demo', value: 'interactive' },
        { label: 'Import deck...', value: 'import', hint: 'JSON' },
        { label: 'Find and replace...', value: 'find', hint: 'Ctrl+H' },
        { label: 'Export...', value: 'export', hint: 'HTML, PDF, PNG, PPTX' },
      ],
      onPick: (value) => {
        if (value === 'new') this.#replaceDeck(starterDeck());
        else if (value === 'sample') this.#replaceDeck(normalizeDeck(structuredClone(sampleDeck)).deck);
        else if (value === 'interactive') this.#replaceDeck(normalizeDeck(structuredClone(interactiveDeck)).deck);
        else if (value === 'import') this.#pickImportFile();
        else if (value === 'find') openFindDialog(this);
        else openExportDialog(this);
      },
    });
  }

  #replaceDeck(deck) {
    this.canvas.finishEdit();
    this.commit(deck);
    this.select({ slideId: deck.slides[0].id });
  }

  #pickImportFile() {
    const input = h('input', { type: 'file', accept: '.json,application/json' });
    input.addEventListener('change', () => {
      if (input.files?.[0]) this.importFile(input.files[0]);
    });
    input.click();
  }

  async importFile(file) {
    try {
      const raw = JSON.parse(await file.text());
      const { deck, warnings } = normalizeDeck(raw);
      const adopted = await this.assets.adoptDataUrls(deck);
      this.#replaceDeck(adopted);
      if (warnings.length) console.warn('Imported deck was repaired:', warnings);
      toast(warnings.length ? `Imported with ${warnings.length} repair${warnings.length === 1 ? '' : 's'}. Details are in the console.` : 'Deck imported.');
    } catch (err) {
      toast(err instanceof SyntaxError ? 'That file is not valid JSON.' : err.message || 'Could not import that file.', { kind: 'error' });
    }
  }

  async exportJson() {
    try {
      const deck = await this.assets.inline(this.deck);
      deck.meta = { ...deck.meta, updatedAt: new Date().toISOString() };
      const blob = new Blob([JSON.stringify(deck, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = h('a', { href: url, download: `${slugify(this.deck.meta.title)}.deck.json` });
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err) {
      toast('Could not export the deck.', { kind: 'error' });
      console.error(err);
    }
  }

  // ---- presenting --------------------------------------------------------

  openPresentMenu(anchor) {
    openMenu({
      anchor,
      label: 'Present',
      items: [
        { label: 'From this slide', value: 'here', hint: 'Ctrl+Enter' },
        { label: 'From the beginning', value: 'start' },
        { label: 'With presenter view', value: 'view', hint: 'Ctrl+Shift+Enter' },
        { label: this.live ? 'Live session...' : 'Go live...', value: 'live', hint: 'Phones, polls' },
      ],
      onPick: (v) => (v === 'live' ? openLiveDialog(this) : this.present({ fromStart: v === 'start', presenterView: v === 'view' })),
    });
  }

  present({ fromStart = false, presenterView = false } = {}) {
    if (this.presenter) return;
    this.canvas.finishEdit();
    this.flushSave();
    this.presenter = openPresenter({
      deck: this.deck,
      startIndex: fromStart ? 0 : this.slideIndex,
      presenterView,
      live: this.live?.host,
      onPopupBlocked: () => toast('The presenter view was blocked. Allow pop-ups for this page, then press P.', { kind: 'error', timeout: 7000 }),
      resolveAsset: this.assets.resolve,
      onClose: (index) => {
        this.presenter = null;
        const slide = this.deck.slides[index];
        if (slide) this.select({ slideId: slide.id });
      },
    });
  }

  // ---- live sessions -----------------------------------------------------

  startLive({ config, base }) {
    this.stopLive();
    const room = newRoom();
    const host = new LiveHost({ transport: createTransport(config), room, title: this.deck.meta.title });
    host.start();
    this.live = { host, room, config, base };
  }

  stopLive() {
    if (!this.live) return;
    this.live.host.stop();
    this.live = null;
  }

  // ---- keyboard and clipboard --------------------------------------------

  #bindGlobal() {
    document.addEventListener('keydown', (e) => this.#onKey(e));
    document.addEventListener('paste', (e) => this.#onPaste(e));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && this.saveState !== 'saved') this.flushSave();
    });
    addEventListener('pagehide', () => {
      if (this.saveState !== 'saved') this.flushSave();
    });
  }

  #onKey(e) {
    if (this.presenter) return;
    const mod = e.metaKey || e.ctrlKey;
    const key = e.key.toLowerCase();
    if (mod && key === 's') {
      e.preventDefault();
      this.flushSave();
      return;
    }
    if (mod && e.key === 'Enter') {
      e.preventDefault();
      this.present({ presenterView: e.shiftKey });
      return;
    }
    if (mod && key === 'h' && !e.altKey && !e.shiftKey) {
      e.preventDefault();
      if (!document.querySelector('.ed-dialog-backdrop')) openFindDialog(this);
      return;
    }
    if (isTyping(e.target)) return; // native editing owns these keys

    if (mod && !e.altKey) {
      if (key === 'z') {
        e.preventDefault();
        if (e.shiftKey) this.redo();
        else this.undo();
      } else if (key === 'y') {
        e.preventDefault();
        this.redo();
      } else if (key === 'd') {
        e.preventDefault();
        if (this.selection.blockId) this.duplicateBlock(this.selection.blockId);
        else this.duplicateSlide(this.selection.slideId);
      }
      return;
    }

    const onCanvas = e.target === document.body || !!e.target.closest?.('.ed-main');
    const { blockId, slotId } = this.selection;
    switch (e.key) {
      case 'Enter':
      case 'F2':
        if (onCanvas && blockId) {
          e.preventDefault();
          this.canvas.startEdit(blockId);
        }
        break;
      case 'Delete':
      case 'Backspace':
        if (onCanvas && blockId) {
          e.preventDefault();
          this.deleteBlock(blockId);
        }
        break;
      case 'Escape':
        if (blockId || slotId) this.select({});
        break;
      case 'PageDown':
      case 'PageUp': {
        if (!onCanvas) break;
        e.preventDefault();
        const slides = this.deck.slides;
        const i = Math.min(Math.max(this.slideIndex + (e.key === 'PageDown' ? 1 : -1), 0), slides.length - 1);
        this.select({ slideId: slides[i].id });
        break;
      }
      default:
    }
  }

  #onPaste(e) {
    if (this.presenter || isTyping(e.target)) return;
    const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    e.preventDefault();
    this.addImageFiles(files, { blockId: this.selection.blockId });
  }
}
