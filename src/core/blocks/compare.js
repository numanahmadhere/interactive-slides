import { h } from '../dom.js';
import { str, clamp } from '../util.js';
import { safeImageUrl } from '../sanitize.js';
import { registerBlock } from './registry.js';
import { stateOf } from './shared.js';

const STEP = 5;

export default registerBlock({
  type: 'compare',
  label: 'Before / after',
  group: 'Interactive',
  defaults: () => ({ before: '', after: '', beforeLabel: 'Before', afterLabel: 'After', start: 50 }),
  normalize: (p) => ({
    before: str(p.before, '', 3_000_000),
    after: str(p.after, '', 3_000_000),
    beforeLabel: str(p.beforeLabel, '', 60),
    afterLabel: str(p.afterLabel, '', 60),
    start: clamp(Number.isFinite(Number(p.start)) ? Math.round(Number(p.start)) : 50, 0, 100),
  }),
  fields: [
    { key: 'before', label: 'Before image', type: 'image' },
    { key: 'after', label: 'After image', type: 'image' },
    { key: 'beforeLabel', label: 'Before label', type: 'text' },
    { key: 'afterLabel', label: 'After label', type: 'text' },
    { key: 'start', label: 'Starting position (%)', type: 'number', min: 0, max: 100 },
  ],
  render: (block, ctx) => {
    const { before, after, beforeLabel, afterLabel, start } = block.props;
    const beforeUrl = safeImageUrl(ctx.resolveAsset(before));
    const afterUrl = safeImageUrl(ctx.resolveAsset(after));
    const pos = ctx.mode === 'present' ? stateOf(ctx, block, () => ({ pos: start })).pos : start;

    const frame = h('div', { class: 'sp-compare__frame', 'data-interactive': true, style: `--pos:${pos}%` });
    if (afterUrl) frame.append(h('img', { class: 'sp-compare__img', src: afterUrl, alt: afterLabel, draggable: 'false' }));
    const top = h('div', { class: 'sp-compare__top' });
    if (beforeUrl) top.append(h('img', { class: 'sp-compare__img', src: beforeUrl, alt: beforeLabel, draggable: 'false' }));
    frame.append(top);
    if (!beforeUrl && !afterUrl && ctx.mode === 'edit') {
      frame.append(h('div', { class: 'sp-image__empty', text: 'Add the before and after images in the panel' }));
    }
    if (beforeLabel) frame.append(h('span', { class: 'sp-compare__label sp-compare__label--before', text: beforeLabel }));
    if (afterLabel) frame.append(h('span', { class: 'sp-compare__label sp-compare__label--after', text: afterLabel }));
    frame.append(h('div', {
      class: 'sp-compare__handle', role: 'slider', tabindex: '0', 'aria-label': 'Comparison position',
      'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pos),
    }, h('span', { class: 'sp-compare__knob' })));
    return h('div', { class: 'sp-compare' }, frame);
  },
  mount: (el, block, ctx) => {
    const state = stateOf(ctx, block, () => ({ pos: block.props.start }));
    const frame = el.querySelector('.sp-compare__frame');
    const handle = el.querySelector('.sp-compare__handle');
    const set = (v) => {
      state.pos = clamp(v, 0, 100);
      frame.style.setProperty('--pos', `${state.pos}%`);
      handle.setAttribute('aria-valuenow', String(Math.round(state.pos)));
    };
    const fromPointer = (e) => {
      const rect = frame.getBoundingClientRect();
      set(((e.clientX - rect.left) / rect.width) * 100);
    };
    let dragging = false;
    frame.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      dragging = true;
      try {
        frame.setPointerCapture(e.pointerId);
      } catch { /* synthetic pointer */ }
      fromPointer(e);
    });
    frame.addEventListener('pointermove', (e) => {
      if (dragging) fromPointer(e);
    });
    const stop = () => { dragging = false; };
    frame.addEventListener('pointerup', stop);
    frame.addEventListener('pointercancel', stop);
    handle.addEventListener('keydown', (e) => {
      const keys = { ArrowLeft: state.pos - STEP, ArrowRight: state.pos + STEP, Home: 0, End: 100 };
      if (!(e.key in keys)) return;
      e.preventDefault(); // these keys move the divider here, not the slides
      set(keys[e.key]);
    });
    set(state.pos);
  },
});
