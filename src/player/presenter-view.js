// The speaker's second window: the slide the audience sees, what comes next,
// the speaker notes, a clock, an elapsed timer and the slide countdown.
//
// It is drawn into a separate browser window by this window's script, so it
// shares the live Player directly: no messaging, and what you press here is
// exactly what happens on the audience screen. Close this window or the
// presentation and the other follows.

import { h, svgIcon } from '../core/dom.js';
import { renderSlide } from '../core/render.js';
import { applyTheme } from '../core/theme.js';
import { ASPECTS, slideTitle } from '../core/schema.js';
import { applyReveals } from './reveal.js';
import { formatClock, formatTimeOfDay } from './clock.js';

const NOTE_SIZES = [16, 20, 24, 30, 38];

// Everything the page's stylesheets say, as one string, so a new window looks the same.
function collectCss(doc) {
  let css = '';
  for (const sheet of doc.styleSheets) {
    try {
      for (const rule of sheet.cssRules) css += `${rule.cssText}\n`;
    } catch { /* a cross-origin sheet cannot be read */ }
  }
  return css;
}

export function openPresenterView(player, { win } = {}) {
  const w = win ?? window.open('', 'interactive-slides-presenter', 'popup=yes,width=1240,height=800');
  if (!w) return null;
  return new PresenterView(player, w);
}

export class PresenterView {
  constructor(player, win) {
    this.player = player;
    this.win = win;
    this.doc = win.document;
    this.noteSize = 2;
    this.elapsed = 0; // seconds before the last resume
    this.resumedAt = Date.now();
    this.paused = false;
    this.closed = false;

    this.doc.open();
    this.doc.write('<!doctype html><html lang="en"><head><meta charset="utf-8"><title></title></head><body></body></html>');
    this.doc.close();
    this.doc.title = `Presenter view: ${player.deck.meta.title}`;
    const style = this.doc.createElement('style');
    style.textContent = collectCss(document);
    this.doc.head.append(style);
    this.doc.body.className = 'pv-body';

    this.#build();
    this.unsubscribe = player.subscribe((s) => this.update(s));
    this.removeClosers = player.onDestroy(() => this.close());
    this.ticker = setInterval(() => this.#tick(), 500);
    this.#on(this.doc, 'keydown', (e) => this.#onKey(e));
    this.#on(win, 'pagehide', () => this.#dispose());
    this.update({ ...player.state, total: player.nav.slideCount, startedAt: player.slideStartedAt });
  }

  #on(target, type, fn) {
    target.addEventListener(type, fn);
    (this.listeners ??= []).push([target, type, fn]);
  }

  close() {
    if (this.closed) return;
    try { this.win.close(); } catch { /* already closed */ }
    this.#dispose();
  }

  #dispose() {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.ticker);
    this.unsubscribe?.();
    this.removeClosers?.();
    this.observers?.forEach((o) => o.disconnect());
  }

  // ---- layout --------------------------------------------------------------

  #build() {
    const btn = (label, cls, onClick, ...kids) => {
      const b = h('button', { type: 'button', class: `pv__btn ${cls}`, 'aria-label': label, title: label }, ...kids);
      b.addEventListener('click', onClick);
      return b;
    };
    this.clock = h('span', { class: 'pv__clock' });
    this.elapsedEl = h('span', { class: 'pv__elapsed-time', 'aria-label': 'Time elapsed' });
    this.pauseBtn = btn('Pause timer', 'pv__btn--ghost', () => this.#togglePause(), svgIcon('M8 5v14M16 5v14', { size: 18 }));
    const resetBtn = btn('Restart timer', 'pv__btn--ghost', () => this.#resetTimer(), svgIcon('M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5', { size: 18 }));

    const bar = h('header', { class: 'pv__bar' },
      h('div', { class: 'pv__deck', text: this.player.deck.meta.title }),
      h('div', { class: 'pv__timers' }, this.elapsedEl, this.pauseBtn, resetBtn, h('span', { class: 'pv__sep' }), this.clock));

    this.countEl = h('div', { class: 'pv__count', 'aria-live': 'off' });
    this.heading = h('h2', { class: 'pv__heading' });
    this.currentBox = h('div', { class: 'pv__preview' });
    this.stepNote = h('div', { class: 'pv__step' });
    const controls = h('div', { class: 'pv__controls' },
      btn('Previous', '', () => this.player.prev(), svgIcon('M15 18l-6-6 6-6', { size: 24 }), h('span', { text: 'Previous' })),
      btn('Next', 'pv__btn--primary', () => this.player.next(), h('span', { text: 'Next' }), svgIcon('M9 18l6-6-6-6', { size: 24 })));
    const left = h('section', { class: 'pv__current' }, this.heading, this.currentBox, this.stepNote, controls);

    this.nextBox = h('div', { class: 'pv__preview pv__preview--next' });
    this.nextHeading = h('h2', { class: 'pv__heading', text: 'Up next' });
    this.notes = h('div', { class: 'pv__notes-text', tabindex: '0', role: 'region', 'aria-label': 'Speaker notes' });
    const smaller = btn('Smaller notes', 'pv__btn--ghost', () => this.#noteSize(-1), h('span', { text: 'A-' }));
    const larger = btn('Larger notes', 'pv__btn--ghost', () => this.#noteSize(1), h('span', { text: 'A+' }));
    const right = h('aside', { class: 'pv__side' },
      h('section', { class: 'pv__next' }, this.nextHeading, this.nextBox),
      h('section', { class: 'pv__notes' }, h('div', { class: 'pv__notes-head' }, h('h2', { class: 'pv__heading', text: 'Notes' }), h('span', { class: 'pv__sizes' }, smaller, larger)), this.notes));

    this.countdown = h('div', { class: 'pv__countdown', hidden: true });
    this.doc.body.append(h('div', { class: 'pv' }, bar, h('main', { class: 'pv__main' }, left, right), this.countdown));
    this.#noteSize(0);
  }

  // A fixed-size slide scaled into a box that is sized by CSS.
  #preview(box, index, step) {
    const { deck } = this.player;
    const { width, height } = ASPECTS[deck.aspect];
    box.style.aspectRatio = `${width} / ${height}`;
    const stage = this.doc.createElement('div');
    stage.className = 'pv__stage';
    stage.style.width = `${width}px`;
    stage.style.height = `${height}px`;
    applyTheme(stage, deck.theme);
    const el = renderSlide(deck, deck.slides[index], { mode: 'thumb', resolveAsset: this.player.opts.resolveAsset, index });
    applyReveals(el, deck.slides[index], step);
    stage.append(el);
    box.replaceChildren(stage);
    const fit = () => {
      const w = box.clientWidth;
      if (w) stage.style.transform = `scale(${w / width})`;
    };
    fit();
    (this.observers ??= []).push(new this.win.ResizeObserver(fit));
    this.observers.at(-1).observe(box);
  }

  // ---- state ---------------------------------------------------------------

  update({ slide, step, total, startedAt }) {
    if (this.closed) return;
    const { deck, nav } = this.player;
    this.observers?.forEach((o) => o.disconnect());
    this.observers = [];
    this.slideStartedAt = startedAt ?? Date.now();
    this.currentSlide = deck.slides[slide];

    this.heading.textContent = `Now showing: ${slide + 1} of ${total}. ${slideTitle(deck.slides[slide], slide)}`;
    this.#preview(this.currentBox, slide, step);
    const steps = nav.stepCounts[slide];
    this.stepNote.textContent = steps ? `Reveal ${step} of ${steps}` : '';

    let next = null;
    if (step < steps) next = { slide, step: step + 1 };
    else if (slide < total - 1) next = { slide: slide + 1, step: 0 };
    if (next) {
      this.nextHeading.textContent = next.slide === slide ? 'Up next: reveal on this slide' : `Up next: ${next.slide + 1}. ${slideTitle(deck.slides[next.slide], next.slide)}`;
      this.#preview(this.nextBox, next.slide, next.step);
    } else {
      this.nextHeading.textContent = 'End of the presentation';
      this.nextBox.replaceChildren();
      this.nextBox.style.aspectRatio = '16 / 9';
    }

    const notes = deck.slides[slide].notes.trim();
    this.notes.textContent = notes || 'No notes for this slide.';
    this.notes.classList.toggle('is-empty', !notes);
    this.notes.scrollTop = 0;
    this.#tick();
  }

  #tick() {
    if (this.closed) return;
    this.clock.textContent = formatTimeOfDay(new Date());
    this.elapsedEl.textContent = formatClock(this.#elapsed());
    const timer = this.currentSlide?.timer;
    if (timer) {
      const left = timer - (Date.now() - this.slideStartedAt) / 1000;
      this.countdown.hidden = false;
      this.countdown.textContent = `Slide timer ${left >= 0 ? formatClock(left) : `-${formatClock(-left)}`}`;
      this.countdown.dataset.state = left <= 0 ? 'over' : left <= 10 ? 'low' : 'ok';
    } else {
      this.countdown.hidden = true;
    }
  }

  #elapsed() {
    return this.elapsed + (this.paused ? 0 : (Date.now() - this.resumedAt) / 1000);
  }

  #togglePause() {
    if (this.paused) {
      this.resumedAt = Date.now();
      this.paused = false;
    } else {
      this.elapsed = this.#elapsed();
      this.paused = true;
    }
    this.pauseBtn.setAttribute('aria-label', this.paused ? 'Resume timer' : 'Pause timer');
    this.pauseBtn.title = this.pauseBtn.getAttribute('aria-label');
    this.pauseBtn.replaceChildren(svgIcon(this.paused ? 'M7 4l13 8-13 8z' : 'M8 5v14M16 5v14', { size: 18 }));
    this.#tick();
  }

  #resetTimer() {
    this.elapsed = 0;
    this.resumedAt = Date.now();
    this.#tick();
  }

  #noteSize(delta) {
    this.noteSize = Math.min(NOTE_SIZES.length - 1, Math.max(0, this.noteSize + delta));
    this.notes.style.fontSize = `${NOTE_SIZES[this.noteSize]}px`;
  }

  #onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const p = this.player;
    const keys = {
      ArrowRight: () => p.next(), ArrowDown: () => p.next(), PageDown: () => p.next(), ' ': () => p.next(), Enter: () => p.next(),
      ArrowLeft: () => p.prev(), ArrowUp: () => p.prev(), PageUp: () => p.prev(),
      Home: () => p.first(), End: () => p.last(),
    };
    const action = keys[e.key];
    if (!action || e.target.closest?.('button')) return; // a focused button handles Enter and Space itself
    e.preventDefault();
    action();
  }
}
