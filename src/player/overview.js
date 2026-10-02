// A grid of every slide to jump around a deck. Thumbnails are the same renderer
// as everything else and are drawn only when scrolled into view.

import { h, svgIcon } from '../core/dom.js';
import { renderSlide } from '../core/render.js';
import { applyTheme } from '../core/theme.js';
import { ASPECTS, slideTitle } from '../core/schema.js';

const THUMB_WIDTH = 280;

export class Overview {
  constructor(player) {
    this.player = player;
    this.el = null;
    this.observer = null;
  }

  get isOpen() {
    return this.el !== null;
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  open() {
    if (this.isOpen) return;
    const { deck } = this.player;
    const { width, height } = ASPECTS[deck.aspect];
    const current = this.player.state.slide;

    const grid = h('div', { class: 'sp-ov__grid' });
    const items = deck.slides.map((slide, i) => {
      const stage = h('div', { class: 'sp-ov__stage', style: `width:${width}px;height:${height}px;transform:scale(${THUMB_WIDTH / width})` });
      applyTheme(stage, deck.theme);
      const item = h('button', {
        type: 'button', class: 'sp-ov__item', 'aria-label': `Slide ${i + 1}: ${slideTitle(slide, i)}`, 'aria-current': i === current ? 'true' : undefined,
        'data-index': i,
      },
      h('span', { class: 'sp-ov__thumb', style: `width:${THUMB_WIDTH}px;height:${Math.round((THUMB_WIDTH * height) / width)}px` }, stage),
      h('span', { class: 'sp-ov__label' }, h('span', { class: 'sp-ov__num', text: String(i + 1) }), h('span', { class: 'sp-ov__title', text: slideTitle(slide, i) })));
      item.addEventListener('click', () => {
        this.close();
        this.player.goTo(i, 0);
      });
      grid.append(item);
      return { item, stage, slide, i, drawn: false };
    });

    const closeBtn = h('button', { type: 'button', class: 'sp-ov__close', 'aria-label': 'Close overview' }, svgIcon('M18 6 6 18M6 6l12 12', { size: 22 }));
    closeBtn.addEventListener('click', () => this.close());
    this.el = h('div', { class: 'sp-ov', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Slide overview' },
      h('div', { class: 'sp-ov__bar' }, h('h2', { class: 'sp-ov__heading', text: 'All slides' }), closeBtn), grid);
    this.el.addEventListener('keydown', (e) => this.#onKey(e, items.map((x) => x.item)));
    this.player.root.append(this.el);
    this.restoreFocus = document.activeElement;

    const draw = (entry) => {
      if (entry.drawn) return;
      entry.drawn = true;
      entry.stage.append(renderSlide(deck, entry.slide, { mode: 'thumb', resolveAsset: this.player.opts.resolveAsset, index: entry.i }));
    };
    if (typeof IntersectionObserver === 'function') {
      this.observer = new IntersectionObserver((records) => {
        for (const r of records) if (r.isIntersecting) draw(items.find((x) => x.item === r.target));
      }, { root: grid, rootMargin: '200px' });
      for (const x of items) this.observer.observe(x.item);
    } else {
      items.forEach(draw);
    }
    items[current].item.focus();
    items[current].item.scrollIntoView({ block: 'center' });
  }

  close() {
    if (!this.isOpen) return;
    this.observer?.disconnect();
    this.observer = null;
    this.el.remove();
    this.el = null;
    this.player.root.focus({ preventScroll: true });
  }

  #onKey(e, items) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.close();
      return;
    }
    const at = items.indexOf(document.activeElement);
    if (at < 0) return;
    const firstTop = items[0].offsetTop;
    const columns = Math.max(1, items.filter((i) => i.offsetTop === firstTop).length);
    const moves = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns, ArrowUp: -columns };
    let target = null;
    if (e.key in moves) target = at + moves[e.key];
    else if (e.key === 'Home') target = 0;
    else if (e.key === 'End') target = items.length - 1;
    if (target === null) return;
    e.preventDefault();
    items[Math.min(Math.max(target, 0), items.length - 1)].focus();
  }
}
