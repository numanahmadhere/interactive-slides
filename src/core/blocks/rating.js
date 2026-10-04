import { h, rich } from '../dom.js';
import { str, clamp } from '../util.js';
import { registerBlock } from './registry.js';
import { stateOf } from './shared.js';

const SAMPLE = [1, 2, 6, 9, 5];

export const average = (counts) => {
  const n = counts.reduce((a, b) => a + b, 0);
  return n ? Math.round((counts.reduce((a, c, i) => a + c * (i + 1), 0) / n) * 10) / 10 : 0;
};

export default registerBlock({
  type: 'rating',
  label: 'Rating scale',
  group: 'Interactive',
  defaults: () => ({ question: 'How useful was this session?', max: 5, low: 'Not useful', high: 'Very useful' }),
  normalize: (p) => ({
    question: str(p.question, '', 1000),
    max: Number.isFinite(Number(p.max)) ? clamp(Math.round(Number(p.max)), 3, 10) : 5,
    low: str(p.low, '', 60),
    high: str(p.high, '', 60),
  }),
  fields: [
    { key: 'max', label: 'Scale', type: 'segmented', options: [{ value: 5, label: '1 to 5' }, { value: 7, label: '1 to 7' }, { value: 10, label: '1 to 10' }] },
    { key: 'low', label: 'Label for the lowest', type: 'text', placeholder: 'Not useful' },
    { key: 'high', label: 'Label for the highest', type: 'text', placeholder: 'Very useful' },
  ],
  edit: [{ prop: 'question', selector: '.sp-rt__q', kind: 'rich', placeholder: 'Question' }],
  render: (block, ctx) => {
    const { max, low, high } = block.props;
    const present = ctx.mode === 'present';
    const sample = ctx.mode === 'edit' || ctx.mode === 'thumb';
    const cols = h('div', { class: 'sp-rt__cols', style: `--n:${max}`, role: present ? 'group' : undefined });
    for (let i = 1; i <= max; i++) {
      cols.append(h(present ? 'button' : 'div', { class: 'sp-rt__col', type: present ? 'button' : undefined, 'data-value': i },
        h('span', { class: 'sp-rt__bar', style: `--share:${sample ? (SAMPLE[(i - 1) % SAMPLE.length] || 1) / 9 : 0}` }),
        h('span', { class: 'sp-rt__n', text: String(i) })));
    }
    const root = h('div', { class: 'sp-rt' }, rich('p', { class: 'sp-rt__q' }, block.props.question), cols,
      h('div', { class: 'sp-rt__ends' }, h('span', { text: low }), h('span', { text: high })));
    if (present) root.append(h('p', { class: 'sp-live__count', role: 'status', 'aria-live': 'polite' }));
    return root;
  },
  mount: (el, block, ctx) => {
    const { max } = block.props;
    const live = ctx.live ?? null;
    const local = stateOf(ctx, block, () => ({ pick: null }));
    const cols = [...el.querySelectorAll('.sp-rt__col')];
    const count = el.querySelector('.sp-live__count');
    const paint = () => {
      const counts = live ? live.counts(block.id, max) : cols.map((_, i) => (local.pick === i ? 1 : 0));
      const n = counts.reduce((a, b) => a + b, 0);
      const top = Math.max(1, ...counts);
      cols.forEach((col, i) => {
        col.querySelector('.sp-rt__bar').style.setProperty('--share', String(counts[i] / top));
        col.classList.toggle('is-picked', local.pick === i);
        col.setAttribute('aria-label', `${i + 1}${n ? `, ${counts[i]} ${counts[i] === 1 ? 'response' : 'responses'}` : ''}`);
        col.setAttribute('aria-pressed', String(local.pick === i));
      });
      count.textContent = n ? `${n} ${n === 1 ? 'response' : 'responses'}. Average ${average(counts)}` : live ? 'Waiting for responses' : 'Click a number to try it';
    };
    cols.forEach((col, i) => col.addEventListener('click', () => {
      local.pick = i;
      live?.vote(block.id, [i]);
      paint();
    }));
    paint();
    return live?.subscribe(paint);
  },
});
