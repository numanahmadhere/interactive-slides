import { h, rich } from '../dom.js';
import { str, clamp } from '../util.js';
import { registerBlock } from './registry.js';
import { stateOf, isLocked, LOCKED_NOTE } from './shared.js';

const SAMPLE = ['Faster follow-ups would help us most.', 'I would like more examples from our own work.', 'The pace was right for me.'];

export default registerBlock({
  type: 'open-answers',
  label: 'Open answers',
  group: 'Interactive',
  defaults: () => ({ question: 'What is one thing we should change?', limit: 1 }),
  normalize: (p) => ({ question: str(p.question, '', 1000), limit: Number.isFinite(Number(p.limit)) ? clamp(Math.round(Number(p.limit)), 1, 5) : 1 }),
  fields: [
    { key: 'limit', label: 'Answers each person can send', type: 'segmented', options: [1, 2, 3, 5].map((n) => ({ value: n, label: String(n) })) },
    { type: 'hint', text: 'Answers appear as cards, newest first. Anyone can type; nothing is stored on a server.' },
  ],
  edit: [{ prop: 'question', selector: '.sp-oa__q', kind: 'rich', placeholder: 'Question' }],
  render: (block, ctx) => {
    const wall = h('ul', { class: 'sp-oa__wall' });
    if (ctx.mode === 'edit' || ctx.mode === 'thumb') SAMPLE.forEach((t) => wall.append(h('li', { text: t })));
    const root = h('div', { class: 'sp-oa' }, rich('p', { class: 'sp-oa__q' }, block.props.question), wall);
    if (ctx.mode === 'present') {
      root.append(h('p', { class: 'sp-live__count', role: 'status', 'aria-live': 'polite' }));
      if (!ctx.live) {
        root.append(h('form', { class: 'sp-live__try' },
          h('input', { type: 'text', maxlength: '280', 'aria-label': 'Type an answer to try it', placeholder: 'Type an answer to try it' }),
          h('button', { type: 'submit', class: 'sp-btn sp-btn--outline sp-btn--md', text: 'Add' })));
      }
    }
    return root;
  },
  mount: (el, block, ctx) => {
    const wall = el.querySelector('.sp-oa__wall');
    const count = el.querySelector('.sp-live__count');
    const live = ctx.live ?? null;
    const local = stateOf(ctx, block, () => ({ items: [] }));
    const paint = () => {
      const items = live ? live.responses(block.id) : local.items.slice().reverse();
      wall.replaceChildren(...items.map((t) => h('li', { text: t })));
      count.textContent = isLocked(live, block) ? LOCKED_NOTE : items.length ? `${items.length} ${items.length === 1 ? 'answer' : 'answers'}` : live ? 'Waiting for answers' : 'Add an answer to see the wall';
    };
    el.querySelector('.sp-live__try')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = e.target.querySelector('input');
      const text = input.value.replace(/\s+/g, ' ').trim().slice(0, 280);
      if (text && local.items.length < block.props.limit * 5) local.items.push(text);
      input.value = '';
      paint();
    });
    paint();
    return live?.subscribe(paint);
  },
});
