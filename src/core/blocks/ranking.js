import { h, rich } from '../dom.js';
import { str } from '../util.js';
import { registerBlock } from './registry.js';
import { cleanList, pad } from './shared.js';

export default registerBlock({
  type: 'ranking',
  label: 'Ranking',
  group: 'Interactive',
  defaults: () => ({ question: 'Rank these from most to least important.', items: ['Speed', 'Quality', 'Cost', 'Support'].map((text) => ({ text })) }),
  normalize: (p) => ({
    question: str(p.question, '', 1000),
    items: pad(cleanList(p.items, 8, (o) => ({ text: str(o.text, '', 200) })), 2, () => ({ text: '' })),
  }),
  fields: [
    { key: 'items', label: 'Items to rank', type: 'list', itemLabel: 'Item', add: 'Add item', min: 2, max: 8, item: () => ({ text: '' }), fields: [{ key: 'text', label: 'Text', type: 'text' }] },
    { type: 'hint', text: 'Each phone puts the items in its own order. First place earns the most points; the screen sorts by total points.' },
  ],
  edit: [{ prop: 'question', selector: '.sp-rk__q', kind: 'rich', placeholder: 'Question' }],
  render: (block, ctx) => {
    const rows = h('ol', { class: 'sp-rk__rows' });
    block.props.items.forEach(({ text }, i) => {
      rows.append(h('li', { class: 'sp-rk__row', 'data-index': i },
        h('span', { class: 'sp-rk__bar', style: ctx.mode === 'edit' || ctx.mode === 'thumb' ? `--share:${1 - i * 0.2}` : '--share:0' }),
        h('span', { class: 'sp-rk__place', text: String(i + 1) }),
        h('span', { class: 'sp-rk__text', text }),
        h('span', { class: 'sp-rk__pts', 'aria-hidden': 'true' })));
    });
    const root = h('div', { class: 'sp-rk' }, rich('p', { class: 'sp-rk__q' }, block.props.question), rows);
    if (ctx.mode === 'present') root.append(h('p', { class: 'sp-live__count', role: 'status', 'aria-live': 'polite' }));
    return root;
  },
  mount: (el, block, ctx) => {
    const live = ctx.live ?? null;
    const rows = el.querySelector('.sp-rk__rows');
    const count = el.querySelector('.sp-live__count');
    const n = block.props.items.length;
    const items = [...rows.children];
    const paint = () => {
      const scores = live ? live.ranking(block.id, n) : new Array(n).fill(0);
      const voters = live ? live.voters(block.id) : 0;
      const order = scores.map((s, i) => [s, i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
      const top = Math.max(1, ...scores);
      order.forEach(([score, i], place) => {
        const row = items[i];
        rows.append(row); // moving the row re-sorts the list
        row.style.setProperty('--share', String(score / top));
        row.querySelector('.sp-rk__place').textContent = voters ? String(place + 1) : '';
        row.querySelector('.sp-rk__pts').textContent = voters ? `${score} pts` : '';
      });
      count.textContent = voters ? `${voters} ${voters === 1 ? 'ranking' : 'rankings'}` : live ? 'Waiting for rankings' : 'Rankings come from the audience\'s phones';
    };
    paint();
    return live?.subscribe(paint);
  },
});
