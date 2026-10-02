import { h, rich, svgIcon } from '../dom.js';
import { str } from '../util.js';
import { registerBlock } from './registry.js';
import { cleanList, pad, stateOf, shuffled } from './shared.js';

const MAX_ITEMS = 8;
const DRAG_PX = 8;
const initState = (n) => () => ({ order: shuffled(n), done: false, correct: false });

export default registerBlock({
  type: 'ordering',
  label: 'Put in order',
  group: 'Interactive',
  scored: true,
  defaults: () => ({ prompt: 'Put these steps in the right order', items: ['Plan', 'Build', 'Test', 'Launch'] }),
  normalize: (p) => ({
    prompt: str(p.prompt, '', 1000),
    items: pad(cleanList(Array.isArray(p.items) ? p.items.map((t) => ({ t })) : [], MAX_ITEMS, (c) => ({ t: str(c.t, '', 300) })), 2, () => ({ t: '' })).map((c) => c.t),
  }),
  fields: [
    {
      key: 'items', label: 'Items in the correct order', type: 'strings', itemLabel: 'Step', add: 'Add step', min: 2, max: MAX_ITEMS, item: () => '',
    },
    { type: 'hint', text: 'List them in the right order here. The audience sees them shuffled and drags them into place.' },
  ],
  check: (props) => (props.items.some((t) => !t.trim()) ? 'Fill in every step.' : null),
  edit: [{ prop: 'prompt', selector: '.sp-order__prompt', kind: 'rich', placeholder: 'Instructions' }],
  render: (block, ctx) => {
    const { prompt, items } = block.props;
    const present = ctx.mode === 'present';
    const state = present ? stateOf(ctx, block, initState(items.length)) : null;
    const order = present ? state.order : items.map((_, i) => i);

    const list = h('div', { class: 'sp-order__list', role: 'list' });
    order.forEach((idx, pos) => {
      const row = h('div', { class: 'sp-order__row', role: 'listitem', 'data-i': idx },
        present ? h('span', { class: 'sp-order__grip', 'aria-hidden': 'true' }, svgIcon('M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01', { size: 36 })) : null,
        h('span', { class: 'sp-order__pos', text: String(pos + 1) }),
        h('span', { class: 'sp-order__text', text: items[idx] }),
        present ? h('span', { class: 'sp-order__moves' },
          h('button', { class: 'sp-order__up', type: 'button', 'aria-label': 'Move up' }, svgIcon('M12 19V5M5 12l7-7 7 7', { size: 32 })),
          h('button', { class: 'sp-order__down', type: 'button', 'aria-label': 'Move down' }, svgIcon('M12 5v14M5 12l7 7 7-7', { size: 32 }))) : null);
      list.append(row);
    });

    const root = h('div', { class: 'sp-order' }, rich('p', { class: 'sp-order__prompt' }, prompt), list);
    if (present) {
      root.append(
        h('div', { class: 'sp-quiz__actions' }, h('button', { class: 'sp-btn sp-btn--outline sp-btn--md sp-order__check', type: 'button', text: 'Check order' })),
        h('div', { class: 'sp-quiz__feedback', role: 'status', 'aria-live': 'polite', hidden: true },
          h('div', { class: 'sp-quiz__verdict' }), h('p', { class: 'sp-quiz__why' })));
    }
    return root;
  },
  mount: (el, block, ctx) => {
    const { items } = block.props;
    const state = stateOf(ctx, block, initState(items.length));
    const list = el.querySelector('.sp-order__list');
    const rows = new Map([...list.children].map((r) => [Number(r.dataset.i), r]));
    const check = el.querySelector('.sp-order__check');
    const feedback = el.querySelector('.sp-quiz__feedback');

    const paint = () => {
      state.order.forEach((idx, pos) => {
        const row = rows.get(idx);
        list.append(row); // re-appending in order reorders the DOM
        row.querySelector('.sp-order__pos').textContent = String(pos + 1);
        row.querySelector('.sp-order__up').disabled = state.done || pos === 0;
        row.querySelector('.sp-order__down').disabled = state.done || pos === state.order.length - 1;
        row.setAttribute('aria-label', `${pos + 1}. ${items[idx]}`);
        if (state.done) {
          row.classList.toggle('is-correct', idx === pos);
          row.classList.toggle('is-wrong', idx !== pos);
        }
      });
      check.hidden = state.done;
      feedback.hidden = !state.done;
      feedback.dataset.result = state.done ? (state.correct ? 'correct' : 'wrong') : '';
      if (state.done) {
        feedback.querySelector('.sp-quiz__verdict').textContent = state.correct ? 'Correct order' : 'Not quite';
        feedback.querySelector('.sp-quiz__why').textContent = state.correct ? '' : `Correct order: ${items.join(', then ')}`;
      }
    };
    const move = (from, to) => {
      if (state.done || to < 0 || to >= state.order.length) return;
      const [x] = state.order.splice(from, 1);
      state.order.splice(to, 0, x);
      paint();
    };

    for (const [idx, row] of rows) {
      row.querySelector('.sp-order__up').addEventListener('click', () => move(state.order.indexOf(idx), state.order.indexOf(idx) - 1));
      row.querySelector('.sp-order__down').addEventListener('click', () => move(state.order.indexOf(idx), state.order.indexOf(idx) + 1));
    }

    // Drag a row up or down; it swaps with whichever row the pointer is over.
    let drag = null;
    list.addEventListener('pointerdown', (e) => {
      const row = e.target.closest('.sp-order__row');
      if (state.done || !row || e.button !== 0 || e.target.closest('button')) return;
      drag = { row, y: e.clientY, moved: false };
      try { row.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
    });
    list.addEventListener('pointermove', (e) => {
      if (!drag) return;
      if (!drag.moved) {
        if (Math.abs(e.clientY - drag.y) < DRAG_PX) return;
        drag.moved = true;
        drag.row.classList.add('is-dragging');
      }
      const all = state.order.map((i) => rows.get(i));
      let target = all.findIndex((r) => e.clientY < r.getBoundingClientRect().top + r.getBoundingClientRect().height / 2);
      if (target < 0) target = all.length - 1;
      const from = all.indexOf(drag.row);
      if (target !== from) move(from, target);
    });
    const stop = () => { drag?.row.classList.remove('is-dragging'); drag = null; };
    list.addEventListener('pointerup', stop);
    list.addEventListener('pointercancel', stop);

    check.addEventListener('click', () => {
      if (state.done) return;
      state.done = true;
      state.correct = state.order.every((idx, pos) => idx === pos);
      paint();
    });
    paint();
  },
});
