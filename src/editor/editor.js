// The editor controller: owns the store, the selection and the views, exposes
// every user action (add slide, delete block, undo, import, ...) and routes
// keyboard shortcuts. Views call back into it; none of them talk to each other.

import { h, svgIcon } from '../core/dom.js';
import { createSlide, normalizeDeck } from '../core/schema.js';
import { createBlock, listBlocks, getBlock } from '../core/blocks/index.js';
import { getLayout, listLayouts } from '../core/layouts.js';
import { blankDeck, sampleDeckCopy, demoDeckCopy } from '../library/starters.js';
import { Session } from '../core/session.js';
import { slugify, escapeHtml } from '../core/util.js';
import * as ops from './ops.js';
import * as clip from './clipboard.js';
import * as xf from './transform.js';
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
import { openCloudDialog } from './cloud-dialog.js';
import { getCloud } from '../cloud/instance.js';
import { CloudSync } from '../cloud/sync.js';
import { LiveHost } from '../live/host.js';
import { createTransport } from '../live/transport.js';
import { newRoom, cleanSavedSession } from '../live/protocol.js';
import { Exporter } from './exporter.js';
import { openInsertPanel, openPalette, openLayoutPicker, QUICK_TYPES } from './insert.js';
import { slideToPng } from '../export/png.js';
import { setThemePref, themePref } from '../styles/theme.js';
import { logoPair } from '../shell/chrome.js';
import { SUPPORT_EMAIL, supportHref } from '../shell/contact.js';
import { deckPath, DASHBOARD_PATH } from '../shell/paths.js';
import { setFlash } from '../shell/flash.js';

const LIVE_SESSION_KEY = 'interactive-slides:live-session';
const SAVE_DELAY_MS = 600;
const SAVE_LABELS = { saved: 'Saved', saving: 'Saving...', error: 'Not saved' };

const isTyping = (el) => !!el?.closest?.('input, textarea, select, [contenteditable="true"], [contenteditable="plaintext-only"]');

export class Editor {
  constructor(mount, deckId) {
    this.mount = mount;
    this.deckId = deckId;
    this.meta = null; // this deck's library summary: title, thumbnail, cloud link
    this.persist = new Persistence();
    this.assets = new AssetStore(this.persist);
    this.selection = { slideId: null, blockId: null, slotId: null, blockIds: [] };
    this.presenter = null;
    this.live = null; // { host, room, config, base } while a live session is open
    this.sync = null; // saves the deck to the cloud by itself when signed in
    this.session = new Session(); // view state in the editor: open tabs, flipped cards
    this.exporter = new Exporter(this);
    this.saveTimer = 0;
    this.saveState = 'saved';
    this.warnedImages = false;
    this.thumbTimer = 0;
    this.thumbSlide = null;
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
      const saved = await this.persist.loadDeck(this.deckId);
      if (saved) {
        const result = normalizeDeck(saved);
        deck = result.deck;
        if (result.warnings.length) console.warn('Saved deck was repaired:', result.warnings);
      }
    } catch (err) {
      console.error('Could not load the saved deck', err);
    }
    if (!deck) {
      const missing = new Error('That deck is not on this device.');
      missing.code = 'not_found';
      throw missing;
    }
    this.meta = await this.persist.getMeta(this.deckId);
    try {
      const mine = this.assets.referenced(deck);
      await this.assets.init(mine);
      const keep = await this.persist.allAssetIds();
      for (const id of mine) keep.add(id);
      await this.assets.gc(keep);
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
    this.sync = new CloudSync({
      getCloud,
      getDeck: () => this.deck,
      inline: (d) => this.assets.inline(d),
      getLink: () => (this.meta?.cloudId ? { id: this.meta.cloudId, updatedAt: this.meta.cloudUpdatedAt } : null),
      setLink: async (link) => {
        this.meta = await this.persist.patchMeta(this.deckId, { cloudId: link?.id ?? null, cloudUpdatedAt: link?.updatedAt ?? null });
      },
      getThumb: () => this.meta?.thumb ?? '',
      onState: (state, error) => this.#paintCloud(state, error),
    });
    this.sync.markClean(this.deck); // what was just loaded is not an edit
    this.#paintCloud(this.sync.state, '');
    this.#resumeLive();

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
    this.cloudBtn = button({ label: 'Cloud', variant: 'ghost', title: 'Online saving', onClick: () => openCloudDialog(this) });
    this.cloudBtn.hidden = true;
    this.fileBtn = button({ label: 'File', onClick: (e, el) => this.openFileMenu(el) });
    this.presentBtn = button({ icon: 'play', label: 'Present', variant: 'primary', title: 'Present from this slide (Ctrl+Enter)', onClick: () => this.present() });
    this.presentMenuBtn = button({ icon: 'chevron', label: 'More ways to present', iconOnly: true, variant: 'primary', onClick: (e, el) => this.openPresentMenu(el) });
    const presentGroup = h('div', { class: 'ed-split' }, this.presentBtn, this.presentMenuBtn);

    const top = h('header', { class: 'ed-top' },
      h('a', { class: 'ed-logo', href: DASHBOARD_PATH, title: 'Back to My decks', 'aria-label': 'Back to My decks' }, ...logoPair(30)),
      h('a', { class: 'ed-crumb', href: DASHBOARD_PATH, text: 'My decks' }),
      this.titleInput,
      h('div', { class: 'ed-top__group' }, this.undoBtn, this.redoBtn),
      h('div', { class: 'ed-top__spacer' }),
      this.statusEl, this.cloudBtn, this.fileBtn, presentGroup);

    const side = h('aside', { class: 'ed-side', 'aria-label': 'Slides panel' });
    const canvasHost = h('div', { class: 'ed-canvas' });
    this.quickbar = this.#buildQuickbar();
    const main = h('main', { class: 'ed-main' }, this.quickbar, canvasHost);
    const insp = h('aside', { class: 'ed-insp', 'aria-label': 'Inspector panel' });

    this.el = h('div', { class: 'ed' }, top, side, main, insp);
    this.mount.replaceChildren(this.el);

    this.sidebar = new SlideList(side, this);
    this.canvas = new CanvasView(canvasHost, this);
    this.inspector = new Inspector(insp, this);
  }

  #buildQuickbar() {
    const labels = { text: 'Text', image: 'Image', shape: 'Shape', quiz: 'Quiz', poll: 'Poll' };
    const bar = h('div', { class: 'ed-quick', role: 'toolbar', 'aria-label': 'Add to slide' });
    bar.append(button({ icon: 'plus', label: 'Insert', variant: 'primary', title: 'Search every block type', onClick: (e, el) => this.openInsert(el) }));
    for (const type of QUICK_TYPES) {
      bar.append(button({ label: labels[type], variant: 'ghost', title: `Add ${labels[type].toLowerCase()} (or press / and type)`, onClick: () => this.addBlockQuick(type) }));
    }
    return bar;
  }

  // ---- state -------------------------------------------------------------

  commit(next, opts) {
    return this.store.commit(next, opts);
  }

  // Every selected block id (one, or several for a multi-selection).
  get selectedIds() {
    const { blockId, blockIds } = this.selection;
    return blockIds.length ? blockIds : blockId ? [blockId] : [];
  }

  // select({}) means the slide itself; select({ blockId }) or ({ slotId }) narrows it.
  select(next = {}) {
    const deck = this.deck;
    const slideId = deck.slides.some((s) => s.id === next.slideId) ? next.slideId : this.selection.slideId;
    const slide = deck.slides.find((s) => s.id === slideId);
    let blockId = next.blockId ?? null;
    let slotId = next.slotId ?? null;
    let blockIds = [];
    if (next.blockIds?.length > 1) {
      const onSlide = new Set(slide.blocks.map((b) => b.id));
      blockIds = [...new Set(next.blockIds)].filter((id) => onSlide.has(id));
      if (blockIds.length === 1) [blockId] = blockIds, blockIds = [];
      else blockId = null;
    } else if (next.blockIds?.length === 1) {
      blockId = next.blockIds[0];
    }
    if (blockId) {
      const hit = ops.findBlock(deck, blockId);
      if (!hit || hit.slide.id !== slideId) blockId = null;
    }
    if (slotId && !getLayout(slide.layout).slots.some((s) => s.id === slotId)) slotId = null;

    const prev = this.selection;
    const sameIds = prev.blockIds.length === blockIds.length && prev.blockIds.every((id, i) => id === blockIds[i]);
    if (prev.slideId === slideId && prev.blockId === blockId && prev.slotId === slotId && sameIds) return;
    if (this.canvas.isEditing && (slideId !== prev.slideId || blockId !== this.canvas.editing.blockId)) this.canvas.finishEdit();
    this.store.endCoalesce();
    this.selection = { slideId, blockId, slotId, blockIds };
    this.#syncAll({ selectionChanged: true });
  }

  selectMany(ids) {
    this.select({ blockIds: ids });
  }

  toggleSelected(id) {
    const ids = this.selectedIds;
    this.selectMany(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  }

  selectAllBlocks() {
    this.selectMany(this.slide.blocks.filter((b) => !b.hidden).map((b) => b.id));
  }

  #repairSelection(prevDeck) {
    const deck = this.deck;
    let { slideId, blockId, slotId, blockIds } = this.selection;
    if (!deck.slides.some((s) => s.id === slideId)) {
      const prevIndex = prevDeck.slides.findIndex((s) => s.id === slideId);
      slideId = deck.slides[Math.min(Math.max(prevIndex, 0), deck.slides.length - 1)].id;
      blockId = null;
      slotId = null;
      blockIds = [];
    }
    if (blockId) {
      const hit = ops.findBlock(deck, blockId);
      if (!hit || hit.slide.id !== slideId) blockId = null;
    }
    if (blockIds.length) {
      const onSlide = new Set(deck.slides.find((s) => s.id === slideId).blocks.map((b) => b.id));
      blockIds = blockIds.filter((id) => onSlide.has(id));
      if (blockIds.length === 1) [blockId] = blockIds, blockIds = [];
      else if (!blockIds.length) blockId = null;
    }
    if (slotId) {
      const layout = getLayout(deck.slides.find((s) => s.id === slideId).layout);
      if (!layout.slots.some((s) => s.id === slotId)) slotId = null;
    }
    this.selection = { slideId, blockId, slotId, blockIds };
  }

  #onChange({ prev, source }) {
    this.#repairSelection(prev);
    const quiet = source === 'inspector' || source === 'canvas-edit' || source === 'title';
    this.#syncAll({ source, rebuildInspector: !quiet });
    this.#scheduleSave();
    this.sync?.changed();
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

  // The small online-saving button in the top bar.
  #paintCloud(state, error) {
    const labels = { signedout: 'Sign in to save online', idle: 'Online saving on', saving: 'Saving online...', saved: 'Saved online', error: 'Not saved online', conflict: 'Changed elsewhere' };
    this.cloudBtn.hidden = state === 'off';
    const span = this.cloudBtn.querySelector('span') ?? this.cloudBtn;
    span.textContent = labels[state] ?? 'Cloud';
    this.cloudBtn.dataset.state = state;
    this.cloudBtn.title = state === 'error' ? `${error} It will try again.` : 'Online saving';
  }

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

  async unlinkCloud() {
    this.meta = await this.persist.patchMeta(this.deckId, { cloudId: null, cloudUpdatedAt: null });
  }

  get cloudId() {
    return this.meta?.cloudId ?? null;
  }

  // The dashboard card picture: the first slide, drawn small once you stop editing.
  #scheduleThumb() {
    clearTimeout(this.thumbTimer);
    const first = this.deck.slides[0];
    if (first === this.thumbSlide && this.meta?.thumb) return;
    this.thumbTimer = setTimeout(async () => {
      try {
        const deck = this.deck;
        const mini = await this.assets.inline({ ...deck, slides: [deck.slides[0]] });
        const blob = await slideToPng(mini, 0, { scale: 0.2 });
        const thumb = await new Promise((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result);
          r.onerror = () => reject(r.error);
          r.readAsDataURL(blob);
        });
        this.thumbSlide = deck.slides[0];
        this.meta = await this.persist.patchMeta(this.deckId, { thumb, thumbSlideId: deck.slides[0].id });
        this.sync?.pushThumb();
      } catch (err) {
        console.warn('Could not draw the thumbnail', err);
      }
    }, 4000);
  }

  async flushSave() {
    clearTimeout(this.saveTimer);
    const deck = this.deck;
    try {
      this.meta = await this.persist.saveDeck(this.deckId, deck);
      if (deck === this.deck) this.#setSaveState('saved');
      this.#scheduleThumb();
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

  addSlide(layoutId = 'free', index = this.slideIndex + 1) {
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
    openLayoutPicker(this, anchor, (id) => this.addSlide(id));
  }

  // ---- block actions -----------------------------------------------------

  // target: { slot } | { afterBlockId } | { containerOf, index }
  addBlock(type, target, { at } = {}) {
    let block = createBlock(type);
    if (at && this.isFree && target.slot) block = { ...block, frame: this.#frameAround(type, at) };
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

  // ---- free-form arrangement --------------------------------------------

  get isFree() {
    return !!getLayout(this.slide?.layout)?.free;
  }

  // The selected top-level blocks of a free-form slide.
  #picked() {
    if (!this.isFree) return [];
    const ids = new Set(this.selectedIds);
    return this.slide.blocks.filter((b) => ids.has(b.id) && b.frame);
  }

  #framesOf(blocks, boxes) {
    const frames = {};
    blocks.forEach((b, i) => {
      const n = boxes[i];
      frames[b.id] = { x: Math.round(n.x), y: Math.round(n.y), w: Math.round(n.w), ...(b.frame.h ? { h: Math.round(n.h) } : {}) };
    });
    return frames;
  }

  nudge(dx, dy) {
    const picked = this.#picked().filter((b) => !b.locked);
    if (!picked.length) return false;
    const frames = {};
    for (const b of picked) frames[b.id] = { x: b.frame.x + dx, y: b.frame.y + dy };
    this.commit(ops.setFrames(this.deck, frames), { coalesce: 'nudge' });
    return true;
  }

  // mode: left | center | right | top | middle | bottom. One block aligns to the slide.
  alignSelection(mode) {
    const picked = this.#picked().filter((b) => !b.locked);
    if (!picked.length) return;
    const boxes = picked.map((b) => this.canvas.free.boxOf(b));
    const within = picked.length === 1 ? { x: 0, y: 0, ...this.canvas.free.slideSize } : xf.boundsOf(boxes);
    if (picked.length === 1) within.w = ops.SLIDE_W, within.h = this.canvas.free.slideSize.h;
    this.commit(ops.setFrames(this.deck, this.#framesOf(picked, xf.alignBoxes(boxes, mode, within))));
  }

  distributeSelection(axis) {
    const picked = this.#picked().filter((b) => !b.locked);
    if (picked.length < 3) return;
    const boxes = picked.map((b) => this.canvas.free.boxOf(b));
    this.commit(ops.setFrames(this.deck, this.#framesOf(picked, xf.distributeBoxes(boxes, axis))));
  }

  // Make the selection the same width and/or height as the block selected first.
  matchSelection(dim) {
    const picked = this.#picked().filter((b) => !b.locked);
    if (picked.length < 2) return;
    const boxes = picked.map((b) => this.canvas.free.boxOf(b));
    this.commit(ops.setFrames(this.deck, this.#framesOf(picked, xf.matchSize(boxes, dim, boxes[0]))));
  }

  // Type exact numbers into the Placement fields.
  setFrameField(id, patch) {
    this.commit(ops.setFrames(this.deck, { [id]: patch }), { coalesce: `frame:${id}`, source: 'inspector' });
  }

  arrangeSelection(where) {
    this.commit(ops.arrangeBlocks(this.deck, this.slide.id, this.selectedIds, where));
  }

  setLocked(flag, ids = this.selectedIds) {
    this.commit(ops.setBlockFlags(this.deck, ids, { locked: flag }));
  }

  setHidden(flag, ids = this.selectedIds) {
    this.commit(ops.setBlockFlags(this.deck, ids, { hidden: flag }));
  }

  // Free the blocks of a fixed-layout slide so they can be moved anywhere. Their
  // current positions are read off the screen so nothing jumps.
  convertSlideToFree() {
    const slide = this.slide;
    if (this.isFree) return;
    const stage = this.canvas.stage.getBoundingClientRect();
    const scale = this.canvas.scale || 1;
    const frames = {};
    for (const b of slide.blocks) {
      const el = this.canvas.blockEl(b.id);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      frames[b.id] = {
        x: Math.round((r.left - stage.left) / scale),
        y: Math.round((r.top - stage.top) / scale),
        w: Math.round(r.width / scale),
        h: Math.round(r.height / scale),
      };
      // Text keeps an automatic height; boxes that were stretched by their slot keep that height.
      if (!['image', 'embed', 'shape', 'icon', 'diagram', 'chart', 'hotspots', 'compare'].includes(b.type)) delete frames[b.id].h;
    }
    this.commit(ops.convertToFree(this.deck, slide.id, frames));
  }

  // Double-click on empty canvas: a text block right there, ready to type in.
  addTextAt(point) {
    const block = createBlock('text', { props: { text: 'Text' } });
    const frame = { x: Math.max(0, Math.round(point.x - 200)), y: Math.max(0, Math.round(point.y - 30)), w: 560 };
    if (!this.commit(ops.insertBlock(this.deck, this.slide.id, { slot: 'free' }, { ...block, frame }))) return;
    this.select({ blockId: block.id });
    this.canvas.startEdit(block.id, { selectAll: true });
  }

  // ---- clipboard -----------------------------------------------------------

  #blocksForClip() {
    const ids = new Set(this.selectedIds);
    return this.slide.blocks.filter((b) => ids.has(b.id));
  }

  copyEvent(e, { cut = false } = {}) {
    const blocks = this.#blocksForClip();
    if (!blocks.length) return false;
    e.preventDefault();
    clip.writeBlocks(e, blocks);
    this.pasteCount = 0;
    if (cut) this.commit(ops.removeBlocks(this.deck, blocks.map((b) => b.id)));
    else toast(blocks.length === 1 ? 'Copied.' : `Copied ${blocks.length} blocks.`, { timeout: 1500 });
    return true;
  }

  duplicateSelection() {
    const blocks = this.#blocksForClip();
    if (!blocks.length) return;
    const copies = blocks.map(ops.cloneBlock);
    const before = new Set(this.slide.blocks.map((b) => b.id));
    this.commit(ops.insertBlocks(this.deck, this.slide.id, copies, { offset: ops.DUP_OFFSET }));
    const added = this.slide.blocks.filter((b) => !before.has(b.id)).map((b) => b.id);
    this.selectMany(added);
  }

  pasteBlocks(blocks) {
    this.pasteCount = (this.pasteCount ?? 0) + 1;
    const before = new Set(this.slide.blocks.map((b) => b.id));
    this.commit(ops.insertBlocks(this.deck, this.slide.id, blocks, { offset: this.isFree ? ops.DUP_OFFSET * this.pasteCount : 0 }));
    this.selectMany(this.slide.blocks.filter((b) => !before.has(b.id)).map((b) => b.id));
  }

  // Text, a link or an image address pasted from elsewhere becomes the right block.
  pasteSmart(item) {
    if (item.imageUrl) {
      const block = createBlock('image', { props: { src: item.imageUrl, fit: 'contain' } });
      this.commit(ops.insertBlock(this.deck, this.slide.id, { slot: ops.defaultSlot(getLayout(this.slide.layout)) }, block));
      this.select({ blockId: block.id });
      return;
    }
    const html = item.link
      ? `<a href="${escapeHtml(item.link)}">${escapeHtml(item.link)}</a>`
      : clip.textHtml(item.text);
    const block = createBlock('text', { props: { text: html } });
    this.commit(ops.insertBlock(this.deck, this.slide.id, { slot: ops.defaultSlot(getLayout(this.slide.layout)) }, block));
    this.select({ blockId: block.id });
  }

  // A default-sized frame for a new block, centred on a point and kept on the slide.
  #frameAround(type, at) {
    const base = ops.defaultFrame(type, this.slide);
    const height = base.h ?? 120;
    return {
      ...base,
      x: Math.round(Math.min(Math.max(0, at.x - base.w / 2), ops.SLIDE_W - Math.min(base.w, ops.SLIDE_W))),
      y: Math.round(Math.min(Math.max(0, at.y - height / 2), ops.SLIDE_H - Math.min(height, ops.SLIDE_H))),
    };
  }

  // A frame that matches the picture's own shape, at most 1100 x 700, centred on `at`.
  async #imageFrame(src, at) {
    const size = await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth || 4, h: img.naturalHeight || 3 });
      img.onerror = () => resolve({ w: 4, h: 3 });
      img.src = this.assets.resolve(src);
    });
    const k = Math.min(1100 / size.w, 700 / size.h, 1);
    const w = Math.max(48, Math.round(size.w * k));
    const hgt = Math.max(48, Math.round(size.h * k));
    const cx = at?.x ?? ops.SLIDE_W / 2;
    const cy = at?.y ?? ops.SLIDE_H / 2;
    return {
      x: Math.round(Math.min(Math.max(0, cx - w / 2), ops.SLIDE_W - w)),
      y: Math.round(Math.min(Math.max(0, cy - hgt / 2), ops.SLIDE_H - hgt)),
      w, h: hgt,
    };
  }

  // Where a block added from the toolbar, the Insert panel or "/" goes: after the
  // selected block, else into the selected (or main) slot.
  insertTarget() {
    const { blockId, slotId } = this.selection;
    const layout = getLayout(this.slide.layout);
    if (!layout.free && blockId) return { afterBlockId: blockId };
    return { slot: layout.slots.some((s) => s.id === slotId) ? slotId : ops.defaultSlot(layout) };
  }

  addBlockQuick(type, at) {
    this.addBlock(type, this.insertTarget(), { at });
  }

  openInsert(anchor) {
    openInsertPanel(this, anchor);
  }

  openPalette() {
    const r = this.canvas.host.getBoundingClientRect();
    openPalette(this, { x: r.left + r.width / 2 - 180, y: r.top + 24 });
  }

  deleteBlock(id) {
    this.commit(ops.removeBlock(this.deck, id));
  }

  deleteSelection() {
    const ids = this.selectedIds.filter((id) => !ops.findBlock(this.deck, id)?.block.locked);
    if (ids.length) this.commit(ops.removeBlocks(this.deck, ids));
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

  async addImageFiles(files, { blockId, key, slot, at } = {}) {
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
          let block = createBlock('image', { props: { src, fit: 'contain' } });
          if (this.isFree) block = { ...block, frame: await this.#imageFrame(src, at) };
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
        { label: 'My decks', value: 'decks' },
        { label: 'New deck', value: 'new' },
        { label: 'Open sample deck', value: 'sample' },
        { label: 'Open interactive demo', value: 'interactive' },
        { label: 'Import deck...', value: 'import', hint: 'JSON' },
        { label: 'Cloud: save, open, share...', value: 'cloud', hint: 'Account' },
        { label: 'Find and replace...', value: 'find', hint: 'Ctrl+H' },
        { label: 'Export...', value: 'export', hint: 'HTML, PDF, PNG, PPTX' },
        { label: 'Contact support', value: 'support', hint: SUPPORT_EMAIL },
        { label: `Appearance: ${{ system: 'follows device', light: 'light', dark: 'dark' }[themePref()]}`, value: 'theme', hint: 'Change' },
      ],
      onPick: (value) => {
        if (value === 'decks') location.assign(DASHBOARD_PATH);
        else if (value === 'new') this.openAsNew(blankDeck());
        else if (value === 'sample') this.openAsNew(sampleDeckCopy());
        else if (value === 'interactive') this.openAsNew(demoDeckCopy());
        else if (value === 'import') this.#pickImportFile();
        else if (value === 'find') openFindDialog(this);
        else if (value === 'cloud') openCloudDialog(this);
        else if (value === 'support') location.href = supportHref(`Help with "${this.deck.meta.title}"`);
        else if (value === 'theme') { const next = { system: 'light', light: 'dark', dark: 'system' }[themePref()]; setThemePref(next); toast(`Appearance: ${{ system: 'follows your device', light: 'light', dark: 'dark' }[next]}.`); }
        else openExportDialog(this);
      },
    });
  }

  // A new deck never overwrites the one you are editing: it becomes another deck in
  // your library and opens in its place.
  async openAsNew(deck, { cloudId = null, cloudUpdatedAt = null, flash = '' } = {}) {
    this.canvas.finishEdit();
    await this.flushSave();
    const id = await this.persist.createDeck(deck, { cloudId, cloudUpdatedAt });
    if (flash) setFlash(flash);
    location.assign(deckPath(id));
  }

  #pickImportFile() {
    const input = h('input', { type: 'file', accept: '.json,application/json' });
    input.addEventListener('change', () => {
      if (input.files?.[0]) this.importFile(input.files[0]);
    });
    input.click();
  }

  // Deck JSON from anywhere (a file, the cloud) goes through the same gate.
  async importDeck(raw, { cloudId = null, cloudUpdatedAt = null, flash = '' } = {}) {
    const { deck, warnings } = normalizeDeck(raw);
    const adopted = await this.assets.adoptDataUrls(deck);
    if (warnings.length) console.warn('Imported deck was repaired:', warnings);
    await this.openAsNew(adopted, { cloudId, cloudUpdatedAt, flash });
    return warnings;
  }

  async importFile(file) {
    try {
      await this.importDeck(JSON.parse(await file.text()), { flash: 'Deck imported as a new deck.' });
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

  // room is given when resuming a session after a reload; otherwise a new one is made.
  startLive({ config, base, room = newRoom() }) {
    this.stopLive();
    const host = new LiveHost({ transport: createTransport(config), room, title: this.deck.meta.title });
    host.start();
    this.live = { host, room, config, base };
    // Kept for this tab only, so an accidental reload picks the same session up again
    // (same code, same links) instead of stranding everyone on their phones.
    try { sessionStorage.setItem(LIVE_SESSION_KEY, JSON.stringify({ room, config, base })); } catch { /* no resume without it */ }
  }

  stopLive() {
    try { sessionStorage.removeItem(LIVE_SESSION_KEY); } catch { /* nothing to remove */ }
    if (!this.live) return;
    this.live.host.stop();
    this.live = null;
  }

  #resumeLive() {
    try {
      const saved = cleanSavedSession(JSON.parse(sessionStorage.getItem(LIVE_SESSION_KEY) ?? 'null'));
      if (!saved) return;
      this.startLive(saved);
      toast(`Live session ${saved.room.code} resumed. Phones will reconnect and send their answers again.`, { timeout: 7000 });
    } catch { /* a bad saved session is ignored */ }
  }

  // ---- keyboard and clipboard --------------------------------------------

  #bindGlobal() {
    document.addEventListener('keydown', (e) => this.#onKey(e));
    document.addEventListener('paste', (e) => this.#onPaste(e));
    document.addEventListener('copy', (e) => !this.presenter && !isTyping(e.target) && this.copyEvent(e));
    document.addEventListener('cut', (e) => !this.presenter && !isTyping(e.target) && this.copyEvent(e, { cut: true }));
    document.addEventListener('keyup', (e) => e.key.startsWith('Arrow') && this.store.endCoalesce());
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
        if (this.selectedIds.length) this.duplicateSelection();
        else this.duplicateSlide(this.selection.slideId);
      } else if (key === 'a' && this.isFree && (e.target === document.body || e.target.closest?.('.ed-main'))) {
        e.preventDefault();
        this.selectAllBlocks();
      } else if (key === 'g' && this.isFree) {
        e.preventDefault();
        if (e.shiftKey) this.ungroupSelection?.();
        else this.groupSelection?.();
      } else if ((e.key === ']' || e.key === '[') && this.isFree) {
        e.preventDefault();
        this.arrangeSelection(e.key === ']' ? (e.shiftKey ? 'front' : 'forward') : (e.shiftKey ? 'back' : 'backward'));
      }
      return;
    }

    const onCanvas = e.target === document.body || !!e.target.closest?.('.ed-main');
    if (e.key === '/' && onCanvas && !mod && !document.querySelector('.ed-dialog-backdrop')) {
      e.preventDefault();
      this.openPalette();
      return;
    }
    const { blockId, slotId } = this.selection;
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (arrows && onCanvas && this.isFree && this.selectedIds.length) {
      e.preventDefault();
      const step = xf.nudgeStep(e.shiftKey);
      this.nudge(arrows[0] * step, arrows[1] * step);
      return;
    }
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
        if (onCanvas && this.selectedIds.length) {
          e.preventDefault();
          this.deleteSelection();
        }
        break;
      case 'Escape':
        if (this.selectedIds.length || slotId) this.select({});
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
    const item = clip.readPaste(e);
    if (!item) return;
    e.preventDefault();
    if (item.blocks) this.pasteBlocks(item.blocks);
    else if (item.files) this.addImageFiles(item.files, { blockId: this.selection.blockId });
    else this.pasteSmart(item);
  }
}
