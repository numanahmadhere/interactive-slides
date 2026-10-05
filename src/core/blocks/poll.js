import { h, rich } from '../dom.js';
import { str } from '../util.js';
import { registerBlock } from './registry.js';
import { cleanList, pad, stateOf } from './shared.js';

export const POLL_CHARTS = ['bars', 'columns', 'donut'];
export const POLL_COLORS = ['#6B6BFF', '#2BC4A0', '#FF7FAE', '#F5B93B', '#9B7CFF', '#FF8A5B', '#4DB6FF', '#8BC34A'];

// A question with no right answer. While a live room is open the audience votes
// on their phones and the bars move; without one, clicking an option records a
// single vote so the block still works on its own.
export default registerBlock({
  type: 'poll',
  label: 'Live poll',
  group: 'Interactive',
  defaults: () => ({ question: 'Which topic should we cover first?', options: ['Option A', 'Option B', 'Option C'].map((text) => ({ text })), multi: false, chart: 'bars' }),
  normalize: (p) => ({
    question: str(p.question, '', 1000),
    options: pad(cleanList(p.options, 8, (o) => ({ text: str(o.text, '', 300) })), 2, () => ({ text: '' })),
    multi: p.multi === true,
    chart: POLL_CHARTS.includes(p.chart) ? p.chart : 'bars',
  }),
  fields: [
    { key: 'chart', label: 'Results chart', type: 'select', options: [{ value: 'bars', label: 'Bars' }, { value: 'columns', label: 'Columns' }, { value: 'donut', label: 'Donut' }] },
    { key: 'multi', label: 'Allow several answers', type: 'toggle' },
    { key: 'options', label: 'Options', type: 'list', itemLabel: 'Option', add: 'Add option', min: 2, max: 8,
      item: () => ({ text: '' }), fields: [{ key: 'text', label: 'Text', type: 'text' }] },
  ],
  edit: [{ prop: 'question', selector: '.sp-poll__q', kind: 'rich', placeholder: 'Question' }],
  render: (block, ctx) => {
    const { question, options, chart } = block.props;
    const present = ctx.mode === 'present';
    const rows = h('div', { class: 'sp-poll__rows', role: 'group' });
    options.forEach(({ text }, i) => {
      rows.append(h(present ? 'button' : 'div', { class: 'sp-poll__row', type: present ? 'button' : undefined, 'data-index': i, style: `--c:${POLL_COLORS[i % POLL_COLORS.length]}` },
        h('span', { class: 'sp-poll__bar' }),
        h('span', { class: 'sp-choice__key', text: String.fromCharCode(65 + i) }),
        h('span', { class: 'sp-poll__text', text }),
        h('span', { class: 'sp-poll__pct', 'aria-hidden': 'true' })));
    });
    return h('div', { class: `sp-poll sp-poll--${chart}` },
      rich('p', { class: 'sp-poll__q' }, question),
      h('div', { class: 'sp-poll__body' }, ...(chart === 'donut' ? [h('div', { class: 'sp-poll__donut', 'aria-hidden': 'true' })] : []), rows),
      h('p', { class: 'sp-poll__total', role: 'status', 'aria-live': 'polite' }));
  },
  mount: (el, block, ctx) => {
    const { options, multi } = block.props;
    const rows = [...el.querySelectorAll('.sp-poll__row')];
    const total = el.querySelector('.sp-poll__total');
    const donut = el.querySelector('.sp-poll__donut');
    const local = stateOf(ctx, block, () => ({ picks: [] }));
    const live = ctx.live ?? null;

    const paint = () => {
      const counts = live?.counts(block.id, options.length) ?? options.map((_, i) => (local.picks.includes(i) ? 1 : 0));
      const voters = live ? live.voters(block.id) : local.picks.length ? 1 : 0;
      const sum = counts.reduce((a, b) => a + b, 0);
      const top = Math.max(...counts, 0);
      rows.forEach((row, i) => {
        const share = sum ? counts[i] / sum : 0;
        row.style.setProperty('--share', String(share));
        row.classList.toggle('is-top', top > 0 && counts[i] === top);
        row.classList.toggle('is-picked', local.picks.includes(i));
        row.setAttribute('aria-pressed', String(local.picks.includes(i)));
        row.querySelector('.sp-poll__pct').textContent = sum ? `${Math.round(share * 100)}%` : '';
        row.setAttribute('aria-label', `${options[i].text}${sum ? `, ${counts[i]} ${counts[i] === 1 ? 'vote' : 'votes'}` : ''}`);
      });
      if (donut) {
        let at = 0;
        const stops = counts.map((n, i) => { const from = at; at += sum ? (n / sum) * 100 : 0; return `${POLL_COLORS[i % POLL_COLORS.length]} ${from}% ${at}%`; });
        donut.style.background = sum ? `conic-gradient(${stops.join(', ')})` : '';
      }
      total.textContent = voters ? `${voters} ${voters === 1 ? 'response' : 'responses'}` : live ? 'Waiting for responses' : 'Click an option to record a response';
    };

    rows.forEach((row, i) => {
      row.addEventListener('click', () => {
        local.picks = multi ? (local.picks.includes(i) ? local.picks.filter((n) => n !== i) : [...local.picks, i].sort((a, b) => a - b)) : [i];
        if (live && local.picks.length) live.vote(block.id, local.picks);
        paint();
      });
    });
    paint();
    return live?.subscribe(paint);
  },
});
