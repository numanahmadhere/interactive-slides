// The presenter. Renders one slide at a time into a fixed-size stage that is
// scaled to fit its container, and drives it from keyboard, pointer, touch,
// on-screen buttons and the URL hash. Navigation rules live in Navigator;
// this file is the DOM around it.

import { h, svgIcon } from '../core/dom.js';
import { renderSlide, activateSlide } from '../core/render.js';
import { Session } from '../core/session.js';
import { applyTheme } from '../core/theme.js';
import { ASPECTS, slideStepValues, slideTitle } from '../core/schema.js';
import { Navigator, parseHash, formatHash } from './navigator.js';
import { Tools } from './tools.js';
import { Overview } from './overview.js';
import { Help } from './help.js';
import { Autoplay } from './autoplay.js';
import { formatClock } from './clock.js';

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
  onPresenterView: undefined, // (player) => void; shows the button and the P key
  fullscreenTarget: undefined, // element to fullscreen instead of the player itself
  autoplay: undefined, // undefined follows the deck's setting, false turns it off
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
    this.disposeSlide = null;
    this.subscribers = new Set();
    this.destroyers = new Set();
    this.slideStartedAt = Date.now();
    this.fullscreenToggledAt = 0;
    this.timerInterval = 0;
    this.session = new Session(); // what the audience has done: answers, open tabs, ...
    this.trail = []; // slides left through a jump, for the "go back" button
    this.actions = {
      next: () => this.next(),
      prev: () => this.prev(),
      first: () => this.first(),
      goToSlide: (id) => {
        const i = this.deck.slides.findIndex((s) => s.id === id);
        if (i < 0) return;
        this.trail.push(this.nav.state.slide);
        this.goTo(i, 0);
      },
      back: () => {
        const i = this.trail.pop();
        if (i === undefined) this.prev();
        else this.goTo(i, 'end');
      },
    };

    this.#build();
    this.tools = new Tools(this);
    this.overview = new Overview(this);
    this.help = new Help(this);
    this.autoplay = new Autoplay({
      delayFor: () => this.#autoplayDelay(),
      onTick: () => this.#autoplayTick(),
    });
    this.setDeck(deck);
    this.#bind();
    this.timerInterval = setInterval(() => this.#tickTimer(), 250);
    if (this.opts.autoplay !== false && this.deck.autoplay?.seconds > 0) this.autoplay.start();
    this.#paintAutoplay();
  }

  get state() {
    return this.nav.state;
  }

  next() { this.#go(this.nav.next()); }
  prev() { this.#go(this.nav.prev()); }
  first() { this.#go(this.nav.first()); }
  last() { this.#go(this.nav.last()); }
  goTo(slide, step = 0) { this.#go(this.nav.goTo(slide, step)); }

  // Called with { slide, step, total, startedAt } after every move.
  subscribe(fn) {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }

  onDestroy(fn) {
    this.destroyers.add(fn);
    return () => this.destroyers.delete(fn);
  }

  announce(message) {
    this.live.textContent = '';
    this.live.textContent = message;
  }

  toggleFullscreen() {
    this.fullscreenToggledAt = Date.now();
    const doc = this.root.ownerDocument;
    if (doc.fullscreenElement) doc.exitFullscreen?.().catch(() => {});
    else (this.opts.fullscreenTarget ?? this.root).requestFullscreen?.().catch(() => {});
  }

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
    for (const fn of [...this.destroyers]) fn();
    this.autoplay.stop();
    clearInterval(this.timerInterval);
    this.tools.destroy();
    this.#deactivate();
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
      const tool = (label, path, fn) => {
        const b = h('button', { class: 'sp-nav', type: 'button', 'aria-label': label, title: label }, svgIcon(path, { size: 20 }));
        b.addEventListener('click', fn);
        return b;
      };
      this.root.append(
        h('div', { class: 'sp-progress', 'aria-hidden': 'true' }, this.progressBar),
        this.counter,
        h('div', { class: 'sp-nav-group' },
          this.prevBtn, this.nextBtn,
          tool('All slides (O)', 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z', () => this.overview.open()),
          tool('Fullscreen (F)', 'M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5', () => this.toggleFullscreen()),
          this.opts.onPresenterView ? tool('Presenter view (P)', 'M3 4h18v12H3zM8 20h8M12 16v4', () => this.opts.onPresenterView(this)) : null,
          tool('Keyboard shortcuts (?)', 'M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z', () => this.help.open())),
      );
    }
    this.timerEl = h('div', { class: 'sp-timer', hidden: true, 'aria-hidden': 'true' });
    this.autoplayEl = h('button', { class: 'sp-autoplay', type: 'button', hidden: true, title: 'Pause or resume auto-play (A)' });
    this.autoplayEl.addEventListener('click', () => this.#toggleAutoplay());
    this.root.append(this.timerEl, this.autoplayEl);
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

  // Tool and view shortcuts. Returns true if the key was one of them.
  #onToolKey(e) {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const drawing = this.tools.drawing;
    const handled = () => { e.preventDefault(); return true; };
    switch (k) {
      case 'Escape': return this.tools.dismiss() ? handled() : false;
      case 'f': this.toggleFullscreen(); return handled();
      case 'o': case 'g': this.overview.open(); return handled();
      case 'b': case '.': this.tools.toggleBlank('black'); return handled();
      case 'w': this.tools.toggleBlank('board'); return handled();
      case 'l': this.tools.toggle('laser'); return handled();
      case 'd': this.tools.toggle('draw'); return handled();
      case 's': this.tools.toggle('spotlight'); return handled();
      case 'c': if (!drawing) return false; this.tools.clearStrokes(); return handled();
      case 'u': if (!drawing) return false; this.tools.undoStroke(); return handled();
      case '1': case '2': case '3': case '4': case '5':
        if (!drawing) return false;
        this.tools.setColor(Number(k) - 1);
        return handled();
      case 'p': if (!this.opts.onPresenterView) return false; this.opts.onPresenterView(this); return handled();
      case 'a': if (!this.autoplay.running) return false; this.#toggleAutoplay(); return handled();
      case '?': this.help.open(); return handled();
      default: return false;
    }
  }

  #onKey(e) {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target instanceof Element ? e.target : null;
    if (t?.closest(TEXT_ENTRY)) return;
    if (this.#overlayOpen()) return; // they handle their own keys
    this.autoplay.reset();
    const onControl = !!t?.closest('button, a, summary');

    // A black screen: any key but its own toggle brings the slide back.
    if (this.tools.blank === 'black' && !['b', '.', 'Escape'].includes(e.key.toLowerCase())) {
      this.tools.wake();
      e.preventDefault();
      return;
    }
    if (this.#onToolKey(e)) return;

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

  #overlayOpen() {
    return this.overview.isOpen || this.help.isOpen;
  }

  #onPointerDown(e) {
    this.autoplay.reset(); // someone is interacting, so hold off advancing
    if (this.tools.capturesPointer || this.#overlayOpen()) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const interactive = !!(e.target instanceof Element && e.target.closest(INTERACTIVE));
    if (!interactive) this.root.focus({ preventScroll: true });
    this.pointer = { x: e.clientX, y: e.clientY, type: e.pointerType, interactive };
  }

  #onPointerUp(e) {
    const p = this.pointer;
    this.pointer = null;
    if (!p || p.interactive || this.tools.capturesPointer || this.#overlayOpen()) return;
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
      session: this.session,
      actions: this.actions,
    });
  }

  // Block behaviour (quiz answers, tabs, ...) is attached once the slide is in
  // the page and detached when it leaves.
  #activate(el) {
    this.#deactivate();
    this.disposeSlide = activateSlide(el);
  }

  #deactivate() {
    this.disposeSlide?.();
    this.disposeSlide = null;
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
    this.#activate(el);
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
    this.#deactivate();
    const dir = to.slide > from.slide ? 1 : -1;
    const outgoing = this.current;
    const incoming = this.#slideEl(to.slide);
    this.#applyReveals(incoming, to.slide, to.step);
    this.stage.append(incoming);
    this.current = incoming;
    this.#activate(incoming);

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

  // ---- auto-play and slide timer ------------------------------------------

  #autoplayDelay() {
    const slide = this.deck.slides[this.nav.state.slide];
    return slide.timer > 0 ? slide.timer : this.deck.autoplay.seconds;
  }

  #autoplayTick() {
    const { slide, step } = this.nav.state;
    const atEnd = slide === this.nav.slideCount - 1 && step === this.nav.stepCounts[slide];
    if (!atEnd) this.next();
    else if (this.deck.autoplay.loop) this.first();
    else this.autoplay.stop();
    this.#paintAutoplay();
  }

  #toggleAutoplay() {
    this.autoplay.toggle();
    this.#paintAutoplay();
    this.announce(this.autoplay.paused ? 'Auto-play paused' : 'Auto-play resumed');
  }

  #paintAutoplay() {
    this.autoplayEl.hidden = !this.autoplay.running;
    this.autoplayEl.textContent = this.autoplay.paused ? 'Auto-play paused' : 'Auto-play';
    this.autoplayEl.dataset.state = this.autoplay.paused ? 'paused' : 'playing';
  }

  #tickTimer() {
    const slide = this.deck?.slides[this.nav?.state.slide];
    const show = !!(slide?.timer && slide.showTimer);
    this.timerEl.hidden = !show;
    if (!show) return;
    const left = slide.timer - (Date.now() - this.slideStartedAt) / 1000;
    this.timerEl.textContent = left >= 0 ? formatClock(left) : `-${formatClock(-left)}`;
    this.timerEl.dataset.state = left <= 0 ? 'over' : left <= 10 ? 'low' : 'ok';
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
      this.slideStartedAt = Date.now();
      this.tools?.onSlideChange();
    }
    this.autoplay?.reset();
    this.#tickTimer();
    if (this.opts.syncHash) {
      const hash = formatHash(this.nav.state);
      if (location.hash !== hash) history.replaceState(null, '', hash);
    }
    this.opts.onNavigate?.({ slide, step, total });
    for (const fn of [...this.subscribers]) fn({ slide, step, total, startedAt: this.slideStartedAt });
  }
}
