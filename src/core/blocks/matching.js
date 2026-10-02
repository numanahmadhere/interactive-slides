import { h, rich } from '../dom.js';
import { str } from '../util.js';
import { registerBlock } from './registry.js';
import { cleanList, pad, stateOf, shuffled } from './shared.js';

const MAX_PAIRS = 8;
const DRAG_PX = 8;
const initState = (n) => () => ({ order: shuffled(n), pairs: {}, selected: null, done: false, correct: false });

export default registerBlock({
  type: 'matching',
  label: 'Matching',
  group: 'Interactive',
  scored: true,
  defaults: () => ({
    prompt: 'Match each item with its pair',
    pairs: [{ left: 'Sun', right: 'Star' }, { left: 'Earth', right: 'Planet' }, { left: 'Moon', right: 'Satellite' }],
  }),
  normalize: (p) => ({
    prompt: str(p.prompt, '', 1000),
    pairs: pad(cleanList(p.pairs, MAX_PAIRS, (c) => ({ left: str(c.left, '', 200), right: str(c.right, '', 200) })), 2, () => ({ left: '', right: '' })),
  }),
  fields: [
    {
      key: 'pairs', label: 'Pairs', type: 'list', itemLabel: 'Pair', add: 'Add pair', min: 2, max: MAX_PAIRS,
      item: () => ({ left: '', right: '' }),
      fields: [{ key: 'left', label: 'Left side', type: 'text' }, { key: 'right', label: 'Its match', type: 'text' }],
    },
    { type: 'hint', text: 'The right-hand column is shuffled for the audience. They click one item on each side, or drag across.' },
  ],
  check: (props) => (props.pairs.some((p) => !p.left.trim() || !p.right.trim()) ? 'Fill in both sides of every pair.' : null),
  edit: [{ prop: 'prompt', selector: '.sp-match__prompt', kind: 'rich', placeholder: 'Instructions' }],
  render: (block, ctx) => {
    const { prompt, pairs } = block.props;
    const present = ctx.mode === 'present';
    const state = present ? stateOf(ctx, block, initState(pairs.length)) : null;
    const rightOrder = present ? state.order : pairs.map((_, i) => i);
    const tag = present ? 'button' : 'div';

    const column = (side, indices) => h('div', { class: 'sp-match__col', 'data-side': side },
      ...indices.map((i) => h(tag, { class: 'sp-match__item', type: present ? 'button' : undefined, 'data-side': side, 'data-i': i },
        h('span', { class: 'sp-match__badge', text: side === 'left' || !present ? String(i + 1) : '' }),
        h('span', { class: 'sp-match__text', text: side === 'left' ? pairs[i].left : pairs[i].right }))));

    const root = h('div', { class: 'sp-match' },
      rich('p', { class: 'sp-match__prompt' }, prompt),
      h('div', { class: 'sp-match__board' }, column('left', pairs.map((_, i) => i)), column('right', rightOrder)));
    if (present) {
      root.append(
        h('div', { class: 'sp-quiz__actions' }, h('button', { class: 'sp-btn sp-btn--outline sp-btn--md sp-match__check', type: 'button', text: 'Check matches', disabled: true })),
        h('div', { class: 'sp-quiz__feedback', role: 'status', 'aria-live': 'polite', hidden: true },
          h('div', { class: 'sp-quiz__verdict' }), h('p', { class: 'sp-quiz__why' })));
    }
    return root;
  },
  mount: (el, block, ctx) => {
    const { pairs } = block.props;
    const n = pairs.length;
    const state = stateOf(ctx, block, initState(n));
    const items = (side) => [...el.querySelectorAll(`.sp-match__item[data-side="${side}"]`)];
    const left = items('left');
    const right = items('right');
    const check = el.querySelector('.sp-match__check');
    const feedback = el.querySelector('.sp-quiz__feedback');
    const rightIndex = (btn) => Number(btn.dataset.i);
    const leftOf = (j) => {
      const found = Object.entries(state.pairs).find(([, v]) => v === j);
      return found ? Number(found[0]) : undefined;
    };

    const paint = () => {
      left.forEach((btn) => {
        const i = rightIndex(btn);
        const j = state.pairs[i];
        btn.classList.toggle('is-selected', state.selected === i);
        btn.classList.toggle('is-paired', j !== undefined);
        btn.setAttribute('aria-pressed', String(state.selected === i));
        btn.setAttribute('aria-label', `${i + 1}. ${pairs[i].left}${j !== undefined ? `, matched with ${pairs[j].right}` : ''}`);
        if (state.done) {
          btn.classList.toggle('is-correct', j === i);
          btn.classList.toggle('is-wrong', j !== i);
        }
      });
      right.forEach((btn) => {
        const j = rightIndex(btn);
        const i = leftOf(j);
        btn.classList.toggle('is-paired', i !== undefined);
        btn.querySelector('.sp-match__badge').textContent = i !== undefined ? String(i + 1) : '';
        btn.setAttribute('aria-label', `${pairs[j].right}${i !== undefined ? `, matched with ${pairs[i].left}` : ''}`);
        if (state.done) {
          btn.classList.toggle('is-correct', i === j);
          btn.classList.toggle('is-wrong', i !== j);
        }
      });
      check.disabled = state.done || Object.keys(state.pairs).length < n;
      check.hidden = state.done;
      feedback.hidden = !state.done;
      feedback.dataset.result = state.done ? (state.correct ? 'correct' : 'wrong') : '';
      if (state.done) {
        const right_ = Object.entries(state.pairs).filter(([i, j]) => Number(i) === j).length;
        feedback.querySelector('.sp-quiz__verdict').textContent = state.correct ? 'All matched' : `${right_} of ${n} matched`;
        feedback.querySelector('.sp-quiz__why').textContent = state.correct ? '' : `Correct pairs: ${pairs.map((p) => `${p.left} = ${p.right}`).join('; ')}`;
      }
    };

    const pair = (i, j) => {
      const existing = leftOf(j);
      if (existing !== undefined) delete state.pairs[existing];
      state.pairs[i] = j;
      state.selected = null;
      paint();
    };
    const lock = () => {
      state.done = true;
      state.correct = left.every((btn) => state.pairs[rightIndex(btn)] === rightIndex(btn));
      state.selected = null;
      paint();
    };

    let drag = null;
    let suppressClick = false;
    left.forEach((btn) => {
      btn.addEventListener('click', () => {
        if (suppressClick) { suppressClick = false; return; }
        if (state.done) return;
        const i = rightIndex(btn);
        if (state.pairs[i] !== undefined) { delete state.pairs[i]; state.selected = i; }
        else state.selected = state.selected === i ? null : i;
        paint();
      });
      btn.addEventListener('pointerdown', (e) => {
        if (state.done || e.button !== 0) return;
        drag = { i: rightIndex(btn), x: e.clientX, y: e.clientY, moved: false };
      });
    });
    el.addEventListener('pointermove', (e) => {
      if (drag && !drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > DRAG_PX) {
        drag.moved = true;
        left.find((b) => rightIndex(b) === drag.i)?.classList.add('is-dragging');
      }
    });
    const endDrag = (e) => {
      if (!drag) return;
      const { i, moved } = drag;
      drag = null;
      left.forEach((b) => b.classList.remove('is-dragging'));
      if (!moved) return;
      suppressClick = true;
      const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('.sp-match__item[data-side="right"]');
      if (target && el.contains(target)) pair(i, rightIndex(target));
    };
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', () => { drag = null; });

    right.forEach((btn) => btn.addEventListener('click', () => {
      if (state.done) return;
      const j = rightIndex(btn);
      if (state.selected !== null) pair(state.selected, j);
      else if (leftOf(j) !== undefined) { delete state.pairs[leftOf(j)]; paint(); }
    }));
    check.addEventListener('click', () => { if (!state.done && Object.keys(state.pairs).length === n) lock(); });
    paint();
  },
});
