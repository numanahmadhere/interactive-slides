// Presenting tools drawn over the slide: laser pointer, freehand drawing,
// spotlight, and the black and whiteboard screens. Drawings belong to the slide
// they were made on and survive moving away and back; coordinates are stored
// relative to the slide so they stay put when the window is resized.

import { h, svgIcon } from '../core/dom.js';

export const COLORS = [
  ['Red', '#ff3b3b'], ['Yellow', '#ffd60a'], ['Green', '#30d158'], ['Blue', '#4f8bff'], ['White', '#ffffff'],
];
const LINE = 7 / 1920; // pen width as a fraction of the slide width
const SPOT_MIN = 90;
const SPOT_MAX = 420;

export class Tools {
  constructor(player) {
    this.player = player;
    this.root = player.root;
    this.mode = null; // null | 'laser' | 'draw' | 'spotlight'
    this.blank = null; // null | 'black' | 'board'
    this.color = COLORS[0][1];
    this.strokes = new Map(); // slide index or 'board' -> [{ color, w, pts }]
    this.stroke = null;
    this.radius = 170;

    this.laser = h('div', { class: 'sp-laser', hidden: true, 'aria-hidden': 'true' });
    this.spot = h('div', { class: 'sp-spotlight', hidden: true, 'aria-hidden': 'true' });
    this.screen = h('div', { class: 'sp-screen', hidden: true, 'aria-hidden': 'true' });
    this.canvas = h('canvas', { class: 'sp-draw', 'aria-hidden': 'true' });
    this.bar = this.#buildBar();
    this.root.append(this.screen, this.canvas, this.spot, this.laser, this.bar);

    this.listeners = [];
    this.#on(this.root, 'pointermove', (e) => this.#onMove(e));
    this.#on(this.root, 'pointerleave', () => { this.laser.hidden = true; });
    this.#on(this.root, 'wheel', (e) => this.#onWheel(e), { passive: false });
    this.#on(this.canvas, 'pointerdown', (e) => this.#strokeStart(e));
    this.#on(this.canvas, 'pointermove', (e) => this.#strokeMove(e));
    this.#on(this.canvas, 'pointerup', () => this.#strokeEnd());
    this.#on(this.canvas, 'pointercancel', () => this.#strokeEnd());
    this.resize = new ResizeObserver(() => this.#sizeCanvas());
    this.resize.observe(this.root);
    this.#sizeCanvas();
  }

  get drawing() {
    return this.mode === 'draw' || this.blank === 'board';
  }

  // Draw mode and blank screens own the pointer, so clicks must not turn pages.
  get capturesPointer() {
    return this.drawing || this.blank === 'black';
  }

  get active() {
    return this.mode !== null || this.blank !== null;
  }

  destroy() {
    this.resize.disconnect();
    for (const [target, type, fn, opts] of this.listeners) target.removeEventListener(type, fn, opts);
  }

  // ---- modes ---------------------------------------------------------------

  setMode(mode) {
    this.mode = mode;
    this.#paint();
    const names = { laser: 'Laser pointer on', draw: 'Drawing on', spotlight: 'Spotlight on' };
    this.player.announce(mode ? names[mode] : 'Tools off');
  }

  toggle(mode) {
    this.setMode(this.mode === mode ? null : mode);
  }

  toggleBlank(kind) {
    this.blank = this.blank === kind ? null : kind;
    if (this.blank) this.mode = null;
    this.#paint();
    this.player.announce(this.blank === 'black' ? 'Screen blank' : this.blank === 'board' ? 'Whiteboard' : 'Slide shown');
  }

  // Esc: turn off whatever is on. Returns true if there was something to turn off.
  dismiss() {
    if (!this.active) return false;
    this.mode = null;
    this.blank = null;
    this.#paint();
    return true;
  }

  // Any key brings the slide back from a black screen.
  wake() {
    if (this.blank !== 'black') return false;
    this.blank = null;
    this.#paint();
    return true;
  }

  setColor(i) {
    const entry = COLORS[i];
    if (!entry) return;
    this.color = entry[1];
    this.#paintBar();
  }

  #paint() {
    this.root.dataset.tool = this.mode ?? '';
    this.root.dataset.blank = this.blank ?? '';
    this.laser.hidden = this.mode !== 'laser';
    this.spot.hidden = this.mode !== 'spotlight';
    this.screen.hidden = this.blank === null;
    this.screen.dataset.kind = this.blank ?? '';
    this.bar.hidden = !this.drawing;
    this.canvas.classList.toggle('is-active', this.drawing);
    this.#paintBar();
    this.redraw();
  }

  // ---- pointer -------------------------------------------------------------

  #on(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    this.listeners.push([target, type, fn, opts]);
  }

  #local(e) {
    const r = this.root.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  #onMove(e) {
    const [x, y] = this.#local(e);
    if (this.mode === 'laser' && e.pointerType !== 'touch') {
      this.laser.hidden = false;
      this.laser.style.transform = `translate(${x}px, ${y}px)`;
    } else if (this.mode === 'spotlight') {
      this.spot.style.setProperty('--x', `${x}px`);
      this.spot.style.setProperty('--y', `${y}px`);
    }
  }

  #onWheel(e) {
    if (this.mode !== 'spotlight') return;
    e.preventDefault();
    this.radius = Math.min(SPOT_MAX, Math.max(SPOT_MIN, this.radius - Math.sign(e.deltaY) * 14));
    this.spot.style.setProperty('--r', `${this.radius}px`);
  }

  // ---- drawing -------------------------------------------------------------

  #key() {
    return this.blank === 'board' ? 'board' : this.player.nav?.state.slide ?? 0;
  }

  #ref(key) {
    return key === 'board' ? this.root.getBoundingClientRect() : this.player.stage.getBoundingClientRect();
  }

  #strokeStart(e) {
    if (!this.drawing || e.button !== 0) return;
    const key = this.#key();
    const rect = this.#ref(key);
    this.stroke = { key, color: this.color, w: LINE, pts: [[(e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height]] };
    try { this.canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
    if (!this.strokes.has(key)) this.strokes.set(key, []);
    this.strokes.get(key).push(this.stroke);
    this.redraw();
  }

  #strokeMove(e) {
    if (!this.stroke) return;
    const rect = this.#ref(this.stroke.key);
    this.stroke.pts.push([(e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height]);
    this.redraw();
  }

  #strokeEnd() {
    this.stroke = null;
  }

  undoStroke() {
    const list = this.strokes.get(this.#key());
    if (list?.length) list.pop();
    this.redraw();
  }

  clearStrokes() {
    this.strokes.delete(this.#key());
    this.redraw();
  }

  strokeCount(key = this.#key()) {
    return this.strokes.get(key)?.length ?? 0;
  }

  #sizeCanvas() {
    const r = this.root.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.round(r.width * dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * dpr));
    this.redraw();
  }

  // Called when the slide changes so each slide shows its own drawings.
  onSlideChange() {
    this.stroke = null;
    this.redraw();
  }

  redraw() {
    if (!this.player.nav) return; // before the first slide exists
    const ctx = this.canvas.getContext('2d');
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const key = this.#key();
    const list = this.strokes.get(key);
    if (!list?.length) return;
    const dpr = window.devicePixelRatio || 1;
    const rootRect = this.root.getBoundingClientRect();
    const rect = this.#ref(key);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const s of list) {
      ctx.strokeStyle = s.color;
      ctx.fillStyle = s.color;
      ctx.lineWidth = s.w * rect.width * dpr;
      const px = (p) => [(rect.left - rootRect.left + p[0] * rect.width) * dpr, (rect.top - rootRect.top + p[1] * rect.height) * dpr];
      ctx.beginPath();
      s.pts.forEach((p, i) => {
        const [x, y] = px(p);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      if (s.pts.length === 1) {
        const [x, y] = px(s.pts[0]);
        ctx.arc(x, y, ctx.lineWidth / 2, 0, Math.PI * 2);
        ctx.fill();
      } else ctx.stroke();
    }
  }

  // ---- toolbar -------------------------------------------------------------

  #buildBar() {
    const bar = h('div', { class: 'sp-draw-bar', role: 'toolbar', 'aria-label': 'Drawing tools', hidden: true });
    this.swatches = COLORS.map(([name, value], i) => {
      const b = h('button', { type: 'button', class: 'sp-draw-bar__swatch', 'aria-label': `${name} pen (${i + 1})`, style: `--c:${value}` });
      b.addEventListener('click', () => this.setColor(i));
      return b;
    });
    const action = (label, path, fn) => {
      const b = h('button', { type: 'button', class: 'sp-draw-bar__btn', 'aria-label': label, title: label }, svgIcon(path, { size: 20 }));
      b.addEventListener('click', fn);
      return b;
    };
    bar.append(
      ...this.swatches,
      h('span', { class: 'sp-draw-bar__sep' }),
      action('Undo last stroke (U)', 'M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11', () => this.undoStroke()),
      action('Clear drawing (C)', 'M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14', () => this.clearStrokes()),
      action('Done (Esc)', 'M18 6 6 18M6 6l12 12', () => this.dismiss()),
    );
    return bar;
  }

  #paintBar() {
    this.swatches?.forEach((b, i) => b.setAttribute('aria-pressed', String(COLORS[i][1] === this.color)));
  }
}
