// An overview of every slide as a grid: pick several, drag to reorder, delete, open.
// It sits over the canvas and uses the same selection as the slide strip.

import { h } from '../core/dom.js';
import { renderSlide } from '../core/render.js';
import { applyTheme } from '../core/theme.js';
import { ASPECTS, slideTitle } from '../core/schema.js';
import { button } from './ui.js';

const TILE_W = 232;

export class GridView {
  constructor(host, editor) {
    this.editor = editor;
    this.visible = false;
    this.anchor = null;
    this.items = new Map();
    this.list = h('div', { class: 'ed-gridlist', role: 'listbox', 'aria-multiselectable': 'true', 'aria-label': 'All slides', tabindex: '0' });
    this.hint = h('p', { class: 'ed-grid__hint', text: 'Click to select. Shift or Ctrl click picks several. Drag to reorder. Double-click or press Enter to open.' });
    this.el = h('section', { class: 'ed-grid', 'aria-label': 'All slides', hidden: true },
      h('div', { class: 'ed-grid__head' },
        h('h2', { class: 'ed-grid__title', text: 'All slides' }),
        h('div', { class: 'ed-grid__tools' },
          button({ icon: 'copy', label: 'Duplicate selected slides', iconOnly: true, variant: 'ghost', onClick: () => editor.duplicateSelectedSlides() }),
          button({ icon: 'trash', label: 'Delete selected slides', iconOnly: true, variant: 'ghost', onClick: () => editor.deleteSelectedSlides() }),
          button({ label: 'Done', variant: 'primary', onClick: () => this.close() }))),
      this.hint,
      this.list);
    host.append(this.el);
    this.list.addEventListener('keydown', (e) => this.#onKey(e));
    this.list.addEventListener('dragover', (e) => this.#onDragOver(e));
    this.list.addEventListener('drop', (e) => this.#onDrop(e));
    this.list.addEventListener('dragleave', (e) => { if (!this.list.contains(e.relatedTarget)) this.#clearMarks(); });
  }

  toggle() {
    if (this.visible) this.close();
    else this.open();
  }

  open() {
    this.visible = true;
    this.el.hidden = false;
    this.editor.canvas.toolbar.hide();
    this.sync();
    this.list.focus({ preventScroll: true });
    this.onToggle?.(true);
  }

  close() {
    if (!this.visible) return;
    this.visible = false;
    this.el.hidden = true;
    this.onToggle?.(false);
    this.editor.canvas.toolbar.update();
  }

  sync() {
    if (!this.visible) return;
    const { deck } = this.editor;
    const chosen = new Set(this.editor.selectedSlideIds);
    const seen = new Set();
    let prev = null;
    deck.slides.forEach((slide, i) => {
      let rec = this.items.get(slide.id);
      if (!rec) {
        rec = this.#tile(slide.id);
        this.items.set(slide.id, rec);
      }
      seen.add(slide.id);
      const expected = prev ? prev.nextElementSibling : this.list.firstElementChild;
      if (rec.el !== expected) this.list.insertBefore(rec.el, expected);
      prev = rec.el;
      rec.num.textContent = String(i + 1);
      rec.el.setAttribute('aria-selected', String(chosen.has(slide.id)));
      rec.el.setAttribute('aria-label', `Slide ${i + 1}: ${slideTitle(slide, i)}`);
      if (rec.slide !== slide || rec.theme !== deck.theme || rec.assets !== this.editor.assets.version) {
        const { width, height } = ASPECTS[deck.aspect];
        rec.preview.style.aspectRatio = `${width} / ${height}`;
        rec.stage.style.cssText = `width:${width}px;height:${height}px;transform:scale(${TILE_W / width});`;
        applyTheme(rec.stage, deck.theme);
        rec.stage.replaceChildren(renderSlide(deck, slide, { mode: 'thumb', resolveAsset: this.editor.assets.resolve, index: i }));
        Object.assign(rec, { slide, theme: deck.theme, assets: this.editor.assets.version });
      }
    });
    for (const [id, rec] of this.items) {
      if (seen.has(id)) continue;
      rec.el.remove();
      this.items.delete(id);
    }
  }

  #tile(id) {
    const num = h('span', { class: 'ed-gtile__num' });
    const stage = h('div', { class: 'ed-thumb__stage' });
    const preview = h('div', { class: 'ed-gtile__preview', 'aria-hidden': 'true', inert: true }, stage);
    const el = h('div', { class: 'ed-gtile', role: 'option', draggable: 'true', 'data-id': id, id: `ed-gtile-${id}` }, preview, num);
    el.addEventListener('click', (e) => this.#click(e, id));
    el.addEventListener('dblclick', () => this.#open(id));
    el.addEventListener('dragstart', (e) => {
      const chosen = this.editor.selectedSlideIds;
      this.drag = chosen.includes(id) ? chosen : [id];
      if (!chosen.includes(id)) this.editor.selectSlides([id]);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', `${this.drag.length} slide${this.drag.length === 1 ? '' : 's'}`);
      for (const sid of this.drag) this.items.get(sid)?.el.classList.add('is-dragging');
    });
    el.addEventListener('dragend', () => {
      for (const rec of this.items.values()) rec.el.classList.remove('is-dragging');
      this.drag = null;
      this.#clearMarks();
    });
    return { id, el, num, preview, stage, slide: null, theme: null, assets: -1 };
  }

  #click(e, id) {
    const slides = this.editor.deck.slides;
    const chosen = this.editor.selectedSlideIds;
    if (e.shiftKey && this.anchor) {
      const a = slides.findIndex((s) => s.id === this.anchor);
      const b = slides.findIndex((s) => s.id === id);
      this.editor.selectSlides(slides.slice(Math.min(a, b), Math.max(a, b) + 1).map((s) => s.id));
    } else if (e.metaKey || e.ctrlKey) {
      this.anchor = id;
      this.editor.selectSlides(chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id]);
    } else {
      this.anchor = id;
      this.editor.selectSlides([id]);
    }
  }

  #open(id) {
    this.editor.selectSlides([id]);
    this.close();
  }

  #onKey(e) {
    const { deck } = this.editor;
    const i = deck.slides.findIndex((s) => s.id === this.editor.selection.slideId);
    const mod = e.metaKey || e.ctrlKey;
    const go = (n) => {
      const slide = deck.slides[Math.min(Math.max(n, 0), deck.slides.length - 1)];
      if (e.shiftKey) {
        const a = deck.slides.findIndex((s) => s.id === (this.anchor ?? this.editor.selection.slideId));
        const to = deck.slides.indexOf(slide);
        const range = deck.slides.slice(Math.min(a, to), Math.max(a, to) + 1).map((s) => s.id);
        this.editor.selectSlides(to < a ? range.reverse() : range);
      } else {
        this.anchor = slide.id;
        this.editor.selectSlides([slide.id]);
      }
    };
    const columns = Math.max(1, Math.floor(this.list.clientWidth / (TILE_W + 20)));
    switch (e.key) {
      case 'ArrowRight': e.preventDefault(); go(i + 1); break;
      case 'ArrowLeft': e.preventDefault(); go(i - 1); break;
      case 'ArrowDown': e.preventDefault(); go(i + columns); break;
      case 'ArrowUp': e.preventDefault(); go(i - columns); break;
      case 'Enter': e.preventDefault(); this.#open(deck.slides[i].id); break;
      case 'Escape': e.preventDefault(); e.stopPropagation(); this.close(); break;
      case 'Delete': case 'Backspace': e.preventDefault(); e.stopPropagation(); this.editor.deleteSelectedSlides(); break;
      case 'a': case 'A': if (mod) { e.preventDefault(); this.editor.selectSlides(deck.slides.map((s) => s.id)); } break;
      case 'd': case 'D': if (mod) { e.preventDefault(); e.stopPropagation(); this.editor.duplicateSelectedSlides(); } break;
      default:
    }
  }

  // ---- drag to reorder ---------------------------------------------------------

  #clearMarks() {
    for (const rec of this.items.values()) rec.el.classList.remove('drop-before', 'drop-after');
  }

  // The slide being hovered and which side of it the pointer is on.
  #target(e) {
    const tile = e.target.closest('.ed-gtile');
    if (!tile) return null;
    const r = tile.getBoundingClientRect();
    return { id: tile.dataset.id, after: e.clientX > r.left + r.width / 2, tile };
  }

  #onDragOver(e) {
    if (!this.drag) return;
    const t = this.#target(e);
    if (!t) return;
    e.preventDefault();
    this.#clearMarks();
    t.tile.classList.add(t.after ? 'drop-after' : 'drop-before');
  }

  #onDrop(e) {
    if (!this.drag) return;
    const t = this.#target(e);
    if (!t) return;
    e.preventDefault();
    const slides = this.editor.deck.slides;
    const moving = new Set(this.drag);
    const rest = slides.filter((s) => !moving.has(s.id));
    let at = rest.findIndex((s) => s.id === t.id);
    if (at < 0) { // dropped on one of the moving slides: nothing to do
      this.#clearMarks();
      return;
    }
    if (t.after) at += 1;
    this.editor.moveSlides([...this.drag], at);
    this.drag = null;
    this.#clearMarks();
  }
}
