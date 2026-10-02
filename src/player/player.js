// The presenter. Renders one slide at a time into a fixed-size stage that is
// scaled to fit its container, and drives it from keyboard, pointer, touch,
// on-screen buttons and the URL hash. Navigation rules live in Navigator;
// this file is the DOM around it.

import { h, svgIcon } from '../core/dom.js';
import { renderSlide } from '../core/render.js';
import { applyTheme } from '../core/theme.js';
import { ASPECTS, slideStepValues, slideTitle } from '../core/schema.js';
import { Navigator, parseHash, formatHash } from './navigator.js';

const TRANSITION_MS = 380;
const UI_IDLE_MS = 2500;
const INTERACTIVE = 'a, button, input, textarea, select, summary, iframe, [contenteditable], [data-interactive]';
const TEXT_ENTRY = 'input, textarea, select, [contenteditable]';

const DEFAULTS = {
  mode: 'present',
  syncHash: true,
  keys: 'document', // 'document' listens page-wide, 'root' only while the player has focus
  clickAdvance: true,
  ui: true,
  resolveAsset: undefined,
  startAt: undefined,
  onNavigate: undefined,
};

function keyframes(kind, dir) {
  if (kind === 'slide') {
    const d = 140 * dir;
    return {
      inn: [{ opacity: 0, transform: `translateX(${d}px)` }, { opacity: 1, transform: 'none' }],
      out: [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateX(${-d}px)` }],
    };
  }
  if (kind === 'zoom') {
    const s = dir > 0 ? 0.92 : 1.08;
    return {
      inn: [{ opacity: 0, transform: `scale(${s})` }, { opacity: 1, transform: 'none' }],
      out: [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `scale(${2 - s})` }],
    };
  }
  return {
    inn: [{ opacity: 0 }, { opacity: 1 }],
    out: [{ opacity: 1 }, { opacity: 0 }],
  };
}

export class Player {
  constructor(container, deck, options = {}) {
    this.container = container;
    this.opts = { ...DEFAULTS, ...options };
    this.destroyed = false;
    this.nav = null;
    this.current = null;
    this.outgoing = null;
    this.anims = [];
    this.pointer = null;
    this.uiTimer = 0;
    this.lastSlideIndex = -1;

    this.#build();
    this.setDeck(deck);
    this.#bind();
  }

  get state() {
    return this.nav.state;
  }

  next() { this.#go(this.nav.next()); }
  prev() { this.#go(this.nav.prev()); }
  first() { this.#go(this.nav.first()); }
  last() { this.#go(this.nav.last()); }
  goTo(slide, step = 0) { this.#go(this.nav.goTo(slide, step)); }

  // Swap in an edited deck (the editor calls this on every change) and stay put.
  setDeck(deck) {
    this.deck = deck;
    const { width, height } = ASPECTS[deck.aspect];
    this.stage.style.width = `${width}px`;
    this.stage.style.height = `${height}px`;
    this.root.setAttribute('aria-label', deck.meta.title);
    applyTheme(this.root, deck.theme);

    this.stepValues = deck.slides.map(slideStepValues);
    const counts = this.stepValues.map((v) => v.length);
    if (this.nav) {
      this.nav.setStepCounts(counts);
    } else {
      const start = this.opts.startAt ?? (this.opts.syncHash ? parseHash(location.hash) : null) ?? { slide: 0, step: 0 };
      this.nav = new Navigator(counts, start);
    }
    this.#renderCurrent();
    this.#fit();
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.#finishTransition();
    clearTimeout(this.uiTimer);
    this.resizeObserver.disconnect();
    for (const [target, type, fn, opts] of this.listeners) target.removeEventListener(type, fn, opts);
    this.root.remove();
  }

  // ---- construction ------------------------------------------------------

  #build() {
    this.stage = h('div', { class: 'sp-stage' });
    this.live = h('div', { class: 'sp-sr-only', 'aria-live': 'polite', 'aria-atomic': 'true' });
    this.root = h('div', {
      class: 'sp-player',
      tabindex: '0',
      role: 'region',
      'aria-roledescription': 'presentation',
    }, this.stage, this.live);

    if (this.opts.ui) {
      this.progressBar = h('div', { class: 'sp-progress__bar' });
      this.counter = h('div', { class: 'sp-counter', 'aria-hidden': 'true' });
      this.prevBtn = h('button', { class: 'sp-nav', type: 'button', 'aria-label': 'Previous' }, svgIcon('M15 18l-6-6 6-6'));
      this.nextBtn = h('button', { class: 'sp-nav', type: 'button', 'aria-label': 'Next' }, svgIcon('M9 18l6-6-6-6'));
      this.root.append(
        h('div', { class: 'sp-progress', 'aria-hidden': 'true' }, this.progressBar),
        this.counter,
        h('div', { class: 'sp-nav-group' }, this.prevBtn, this.nextBtn),
      );
    }
    this.container.append(this.root);
  }

  #bind() {
    this.listeners = [];
    const on = (target, type, fn, opts) => {
      target.addEventListener(type, fn, opts);
      this.listeners.push([target, type, fn, opts]);
    };

    on(this.opts.keys === 'root' ? this.root : document, 'keydown', (e) => this.#onKey(e));
    on(this.root, 'pointerdown', (e) => this.#onPointerDown(e));
    on(this.root, 'pointerup', (e) => this.#onPointerUp(e));
    on(this.root, 'pointercancel', () => { this.pointer = null; });
    on(this.root, 'pointermove', (e) => { if (e.pointerType === 'mouse') this.#showUi(); });
    if (this.opts.syncHash) on(window, 'hashchange', () => this.#onHashChange());
    if (this.opts.ui) {
      this.prevBtn.addEventListener('click', () => this.prev());
      this.nextBtn.addEventListener('click', () => this.next());
    }

    this.resizeObserver = new ResizeObserver(() => this.#fit());
    this.resizeObserver.observe(this.root);
  }

  // ---- input -------------------------------------------------------------

  #onKey(e) {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target instanceof Element ? e.target : null;
    if (t?.closest(TEXT_ENTRY)) return;
    const onControl = !!t?.closest('button, a, summary');

    let move;
    switch (e.key) {
      case 'ArrowRight': case 'ArrowDown': case 'PageDown':
        move = () => this.nav.next();
        break;
      case 'ArrowLeft': case 'ArrowUp': case 'PageUp':
        move = () => this.nav.prev();
        break;
      case ' ':
        if (onControl) return;
        move = e.shiftKey ? () => this.nav.prev() : () => this.nav.next();
        break;
      case 'Enter':
        if (onControl) return;
        move = () => this.nav.next();
        break;
      case 'Home': move = () => this.nav.first(); break;
      case 'End': move = () => this.nav.last(); break;
      default: return;
    }
    e.preventDefault();
    this.#go(move());
    this.#showUi();
  }

  #onPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const interactive = !!(e.target instanceof Element && e.target.closest(INTERACTIVE));
    if (!interactive) this.root.focus({ preventScroll: true });
    this.pointer = { x: e.clientX, y: e.clientY, type: e.pointerType, interactive };
  }

  #onPointerUp(e) {
    const p = this.pointer;
    this.pointer = null;
    if (!p || p.interactive) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;

    if (p.type !== 'mouse' && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      this.#go(dx < 0 ? this.nav.next() : this.nav.prev());
      return;
    }
    if (Math.hypot(dx, dy) > 10 || !this.opts.clickAdvance) return;
    if (String(window.getSelection?.() ?? '').length) return; // finishing a text selection, not a click

    const rect = this.root.getBoundingClientRect();
    const inLeftEdge = e.clientX - rect.left < rect.width * 0.25;
    this.#go(inLeftEdge ? this.nav.prev() : this.nav.next());
  }

  #onHashChange() {
    const target = parseHash(location.hash);
    if (!target) return;
    this.#go(this.nav.goTo(target.slide, target.step));
  }

  #showUi() {
    if (!this.opts.ui) return;
    this.root.classList.add('ui-active');
    clearTimeout(this.uiTimer);
    this.uiTimer = setTimeout(() => this.root.classList.remove('ui-active'), UI_IDLE_MS);
  }

  // ---- rendering ---------------------------------------------------------

  #slideEl(index) {
    return renderSlide(this.deck, this.deck.slides[index], {
      mode: this.opts.mode,
      resolveAsset: this.opts.resolveAsset,
      index,
    });
  }

  // Reveal state is applied before a slide is attached so that returning to a
  // slide shows it fully revealed instead of animating each item in again.
  #applyReveals(el, slideIndex, step) {
    const limit = step === 0 ? 0 : this.stepValues[slideIndex][step - 1];
    for (const node of el.querySelectorAll('[data-step]')) {
      node.classList.toggle('is-revealed', Number(node.dataset.step) <= limit);
    }
  }

  #renderCurrent() {
    this.#finishTransition();
    const { slide, step } = this.nav.state;
    const el = this.#slideEl(slide);
    this.#applyReveals(el, slide, step);
    this.stage.replaceChildren(el);
    this.current = el;
    this.#sync();
  }

  #go(move) {
    if (!move || this.destroyed) return;
    const { from, to } = move;
    if (from.slide === to.slide) {
      this.#applyReveals(this.current, to.slide, to.step);
    } else {
      this.#transition(from, to);
    }
    this.#sync();
  }

  #transition(from, to) {
    this.#finishTransition();
    const dir = to.slide > from.slide ? 1 : -1;
    const outgoing = this.current;
    const incoming = this.#slideEl(to.slide);
    this.#applyReveals(incoming, to.slide, to.step);
    this.stage.append(incoming);
    this.current = incoming;

    // Forward uses the arriving slide's transition; backward replays the one
    // that brought us here.
    const owner = this.deck.slides[dir > 0 ? to.slide : from.slide];
    const kind = owner.transition ?? this.deck.transition;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (kind === 'none' || reduced) {
      outgoing.remove();
      return;
    }

    const { inn, out } = keyframes(kind, dir);
    const timing = { duration: TRANSITION_MS, easing: 'cubic-bezier(.22,.61,.36,1)', fill: 'both' };
    const inAnim = incoming.animate(inn, timing);
    const outAnim = outgoing.animate(out, timing);
    this.outgoing = outgoing;
    this.anims = [inAnim, outAnim];
    outAnim.finished.then(() => {
      if (this.outgoing === outgoing) this.#finishTransition();
    }).catch(() => {});
  }

  #finishTransition() {
    const { anims, outgoing } = this;
    this.anims = [];
    this.outgoing = null;
    for (const a of anims) {
      try { a.cancel(); } catch { /* already finished */ }
    }
    outgoing?.remove();
  }

  #fit() {
    if (!this.deck) return;
    const { width, height } = ASPECTS[this.deck.aspect];
    const rect = this.root.getBoundingClientRect();
    const scale = Math.min(rect.width / width, rect.height / height) || 1;
    this.stage.style.transform = `translate(-50%, -50%) scale(${scale})`;
  }

  #sync() {
    const { slide, step } = this.nav.state;
    const total = this.nav.slideCount;
    this.root.dataset.tone = this.current.dataset.tone ?? 'default';

    if (this.opts.ui) {
      this.progressBar.style.width = `${((slide + 1) / total) * 100}%`;
      this.counter.textContent = `${slide + 1} / ${total}`;
      this.prevBtn.disabled = slide === 0 && step === 0;
      this.nextBtn.disabled = slide === total - 1 && step === this.nav.stepCounts[slide];
    }
    if (slide !== this.lastSlideIndex) {
      this.live.textContent = `Slide ${slide + 1} of ${total}: ${slideTitle(this.deck.slides[slide], slide)}`;
      this.lastSlideIndex = slide;
    }
    if (this.opts.syncHash) {
      const hash = formatHash(this.nav.state);
      if (location.hash !== hash) history.replaceState(null, '', hash);
    }
    this.opts.onNavigate?.({ slide, step, total });
  }
}
