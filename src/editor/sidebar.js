// Slide list: live thumbnails rendered by the same renderer as everything else,
// selection, keyboard navigation and pointer-based drag-to-reorder. Thumbnails
// are only re-rendered for slides whose object identity changed.

import { h } from '../core/dom.js';
import { renderSlide } from '../core/render.js';
import { applyTheme } from '../core/theme.js';
import { ASPECTS, slideTitle } from '../core/schema.js';
import { button } from './ui.js';
import { icon } from './icons.js';

const DRAG_THRESHOLD = 6;
const EDGE = 40;

export class SlideList {
  constructor(host, editor) {
    this.host = host;
    this.editor = editor;
    this.items = new Map(); // slideId -> record
    this.drag = null;
    this.lastSelected = null;

    this.count = h('span', { class: 'ed-side__count' });
    this.addBtn = button({ icon: 'plus', label: 'Add slide', variant: 'ghost', iconOnly: true, onClick: (e, el) => editor.openLayoutMenu(el) });
    this.itemsEl = h('div', { class: 'ed-slides__items' });
    this.dropLine = h('div', { class: 'ed-drop-line', hidden: true });
    this.list = h('div', {
      class: 'ed-slides',
      role: 'listbox',
      tabindex: '0',
      'aria-label': 'Slides',
    }, this.itemsEl, this.dropLine);

    host.append(
      h('div', { class: 'ed-side__head' },
        h('span', { class: 'ed-side__title', text: 'Slides' }, this.count),
        this.addBtn),
      this.list,
    );

    this.list.addEventListener('pointerdown', (e) => this.#onPointerDown(e));
    this.list.addEventListener('pointermove', (e) => this.#onPointerMove(e));
    this.list.addEventListener('pointerup', (e) => this.#onPointerUp(e));
    this.list.addEventListener('pointercancel', () => this.#cancelDrag());
    this.list.addEventListener('keydown', (e) => this.#onKey(e));
    new ResizeObserver(() => this.sync()).observe(this.list);
  }

  sync() {
    const { deck } = this.editor;
    if (!deck) return;
    const selected = this.editor.selection.slideId;
    const width = this.#previewWidth();
    const { assets } = { assets: this.editor.assets.version };
    const seen = new Set();
    let prev = null;

    deck.slides.forEach((slide, i) => {
      let rec = this.items.get(slide.id);
      if (!rec) {
        rec = this.#createItem(slide.id);
        this.items.set(slide.id, rec);
      }
      seen.add(slide.id);

      const expected = prev ? prev.nextElementSibling : this.itemsEl.firstElementChild;
      if (rec.el !== expected) this.itemsEl.insertBefore(rec.el, expected);
      prev = rec.el;

      rec.num.textContent = String(i + 1);
      rec.el.setAttribute('aria-selected', String(slide.id === selected));
      rec.el.setAttribute('aria-label', `Slide ${i + 1}: ${slideTitle(slide, i)}`);
      if (rec.slide !== slide || rec.theme !== deck.theme || rec.brand !== deck.brand || rec.aspect !== deck.aspect || rec.assets !== assets || rec.width !== width) {
        this.#renderThumb(rec, deck, slide, i, width);
      }
    });
    for (const [id, rec] of this.items) {
      if (seen.has(id)) continue;
      rec.el.remove();
      this.items.delete(id);
    }

    this.count.textContent = String(deck.slides.length);
    if (selected) this.list.setAttribute('aria-activedescendant', `ed-slide-${selected}`);
    if (selected !== this.lastSelected) {
      this.lastSelected = selected;
      this.items.get(selected)?.el.scrollIntoView({ block: 'nearest' });
    }
  }

  #previewWidth() {
    const probe = this.list.querySelector('.ed-thumb__preview');
    return probe?.clientWidth || 180;
  }

  #createItem(id) {
    const num = h('div', { class: 'ed-thumb__num' });
    const stageEl = h('div', { class: 'ed-thumb__stage' });
    const preview = h('div', { class: 'ed-thumb__preview', 'aria-hidden': 'true', inert: true }, stageEl);
    // Mouse shortcuts only: a listbox option may not contain focusable controls, and the
    // keyboard has Ctrl+D (duplicate) and Delete on the list itself.
    const actions = h('div', { class: 'ed-thumb__actions', 'aria-hidden': 'true' },
      button({ icon: 'copy', label: 'Duplicate slide', iconOnly: true, onClick: (e) => { e.stopPropagation(); this.editor.duplicateSlide(id); } }),
      button({ icon: 'trash', label: 'Delete slide', iconOnly: true, variant: 'danger', onClick: (e) => { e.stopPropagation(); this.editor.deleteSlide(id); } }),
    );
    for (const b of actions.querySelectorAll('button')) b.tabIndex = -1; // reachable by mouse only, see above
    // Hover gap between thumbnails: a quick way to add a slide right here.
    const adder = h('button', { type: 'button', class: 'ed-thumb__add', tabindex: '-1', 'aria-hidden': 'true', title: 'Add a slide after this one' });
    adder.append(icon('plus', 14));
    adder.addEventListener('click', (e) => {
      e.stopPropagation();
      const at = this.editor.deck.slides.findIndex((s) => s.id === id) + 1;
      this.editor.select({ slideId: id });
      this.editor.addSlide('free', at);
    });
    const el = h('div', { class: 'ed-thumb', role: 'option', id: `ed-slide-${id}`, 'data-id': id }, num, preview, actions, adder);
    return { id, el, num, preview, stageEl, slide: null, theme: null, brand: null, aspect: null, assets: -1, width: 0 };
  }

  #renderThumb(rec, deck, slide, index, width) {
    const { width: w, height: hgt } = ASPECTS[deck.aspect];
    rec.preview.style.aspectRatio = `${w} / ${hgt}`;
    rec.stageEl.style.width = `${w}px`;
    rec.stageEl.style.height = `${hgt}px`;
    rec.stageEl.style.transform = `scale(${width / w})`;
    applyTheme(rec.stageEl, deck.theme);
    rec.stageEl.replaceChildren(renderSlide(deck, slide, { mode: 'thumb', resolveAsset: this.editor.assets.resolve, index }));
    Object.assign(rec, { slide, theme: deck.theme, brand: deck.brand, aspect: deck.aspect, assets: this.editor.assets.version, width });
  }

  // ---- pointer: select, then drag to reorder -----------------------------

  #onPointerDown(e) {
    if (e.button !== 0 || e.target.closest('.ed-thumb__actions, .ed-thumb__add')) return;
    const item = e.target.closest('.ed-thumb');
    if (!item) return;
    this.list.focus({ preventScroll: true });
    this.editor.select({ slideId: item.dataset.id });
    const from = this.editor.deck.slides.findIndex((s) => s.id === item.dataset.id);
    this.drag = { id: item.dataset.id, from, to: from, startY: e.clientY, active: false, pointerId: e.pointerId, y: e.clientY };
    try {
      this.list.setPointerCapture(e.pointerId);
    } catch { /* pointer already gone; the drag simply will not start */ }
  }

  #onPointerMove(e) {
    const d = this.drag;
    if (!d || e.pointerId !== d.pointerId) return;
    d.y = e.clientY;
    if (!d.active) {
      if (Math.abs(e.clientY - d.startY) < DRAG_THRESHOLD) return;
      d.active = true;
      this.items.get(d.id)?.el.classList.add('is-dragging');
    }
    this.#updateDropTarget();
    this.#autoScroll(e.clientY);
  }

  #updateDropTarget() {
    const d = this.drag;
    const slides = this.editor.deck.slides;
    const listRect = this.list.getBoundingClientRect();
    let insertBefore = slides.length; // index in the current order
    for (let i = 0; i < slides.length; i++) {
      const rect = this.items.get(slides[i].id).el.getBoundingClientRect();
      if (d.y < rect.top + rect.height / 2) {
        insertBefore = i;
        break;
      }
    }
    d.to = insertBefore > d.from ? insertBefore - 1 : insertBefore;
    const refEl = insertBefore < slides.length
      ? this.items.get(slides[insertBefore].id).el
      : this.items.get(slides[slides.length - 1].id).el;
    const rect = refEl.getBoundingClientRect();
    const y = (insertBefore < slides.length ? rect.top : rect.bottom) - listRect.top + this.list.scrollTop;
    this.dropLine.hidden = false;
    this.dropLine.style.top = `${y - 2}px`;
  }

  #autoScroll(y) {
    const rect = this.list.getBoundingClientRect();
    if (y < rect.top + EDGE) this.list.scrollTop -= 12;
    else if (y > rect.bottom - EDGE) this.list.scrollTop += 12;
  }

  #onPointerUp(e) {
    const d = this.drag;
    if (!d || e.pointerId !== d.pointerId) return;
    const wasActive = d.active;
    const { id, from, to } = d;
    this.#cancelDrag();
    if (wasActive && to !== from) {
      this.editor.moveSlide(from, to);
      this.editor.select({ slideId: id });
    }
  }

  #cancelDrag() {
    const d = this.drag;
    this.drag = null;
    this.dropLine.hidden = true;
    if (!d) return;
    this.items.get(d.id)?.el.classList.remove('is-dragging');
    try {
      if (this.list.hasPointerCapture?.(d.pointerId)) this.list.releasePointerCapture(d.pointerId);
    } catch { /* nothing to release */ }
  }

  // ---- keyboard ----------------------------------------------------------

  #onKey(e) {
    const { deck, selection } = this.editor;
    const i = deck.slides.findIndex((s) => s.id === selection.slideId);
    const mod = e.metaKey || e.ctrlKey;
    const go = (n) => this.editor.select({ slideId: deck.slides[Math.min(Math.max(n, 0), deck.slides.length - 1)].id });

    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      const to = i + (e.key === 'ArrowUp' ? -1 : 1);
      this.editor.moveSlide(i, to);
      return;
    }
    switch (e.key) {
      case 'ArrowUp': case 'PageUp': e.preventDefault(); go(i - 1); break;
      case 'ArrowDown': case 'PageDown': e.preventDefault(); go(i + 1); break;
      case 'Home': e.preventDefault(); go(0); break;
      case 'End': e.preventDefault(); go(deck.slides.length - 1); break;
      case 'Delete': case 'Backspace':
        e.preventDefault();
        e.stopPropagation();
        this.editor.deleteSlide(selection.slideId);
        break;
      case 'd': case 'D':
        if (!mod) return;
        e.preventDefault();
        e.stopPropagation();
        this.editor.duplicateSlide(selection.slideId);
        break;
      default:
    }
  }
}
