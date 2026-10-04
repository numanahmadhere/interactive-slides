import { h, rich } from '../dom.js';
import { str } from '../util.js';
import { registerBlock } from './registry.js';
import { stateOf, isLocked, LOCKED_NOTE } from './shared.js';

const SAMPLE = [{ text: 'When will the next release ship?', votes: 12 }, { text: 'Can we see this with our own data?', votes: 7 }];

export default registerBlock({
  type: 'qna',
  label: 'Audience Q&A',
  group: 'Interactive',
  defaults: () => ({ question: 'Ask us anything' }),
  normalize: (p) => ({ question: str(p.question, '', 1000) }),
  fields: [{ type: 'hint', text: 'The audience asks on their phones and upvotes each other\'s questions. The most popular rise to the top. Mark one answered or hide it from the presenter screen.' }],
  edit: [{ prop: 'question', selector: '.sp-qa__q', kind: 'rich', placeholder: 'Heading' }],
  render: (block, ctx) => {
    const list = h('ul', { class: 'sp-qa__list' });
    if (ctx.mode === 'edit' || ctx.mode === 'thumb') SAMPLE.forEach((q) => list.append(h('li', { class: 'sp-qa__item' }, h('span', { class: 'sp-qa__votes', text: String(q.votes) }), h('span', { class: 'sp-qa__text', text: q.text }))));
    const root = h('div', { class: 'sp-qa' }, rich('p', { class: 'sp-qa__q' }, block.props.question), list);
    if (ctx.mode === 'present') {
      root.append(h('p', { class: 'sp-live__count', role: 'status', 'aria-live': 'polite' }));
      root.append(h('form', { class: 'sp-live__try' },
        h('input', { type: 'text', maxlength: '280', 'aria-label': 'Type a question', placeholder: ctx.live ? 'Add a question yourself' : 'Type a question to try it' }),
        h('button', { type: 'submit', class: 'sp-btn sp-btn--outline sp-btn--md', text: 'Ask' })));
    }
    return root;
  },
  mount: (el, block, ctx) => {
    const live = ctx.live ?? null;
    const list = el.querySelector('.sp-qa__list');
    const count = el.querySelector('.sp-live__count');
    const local = stateOf(ctx, block, () => ({ items: [], seq: 0 }));
    let showHidden = false;
    const toggle = h('button', { type: 'button', class: 'sp-qa__tool sp-qa__toggle', hidden: true });
    toggle.addEventListener('click', () => { showHidden = !showHidden; paint(); });
    count.after(toggle);
    const moderate = (q, op) => (live ? live.moderate(block.id, q.id, op) : (() => { const it = local.items.find((x) => x.id === q.id); if (!it) return; if (op === 'answered') it.answered = true; else if (op === 'open') it.answered = false; else it.hidden = op === 'hide'; paint(); })());
    const paint = () => {
      const all = live
        ? live.questions(block.id, { includeHidden: true })
        : local.items.slice().sort((a, b) => Number(a.answered) - Number(b.answered) || b.votes - a.votes);
      const visible = all.filter((q) => showHidden || !q.hidden);
      const hiddenCount = all.length - all.filter((q) => !q.hidden).length;
      list.replaceChildren(...visible.map((q) => {
        const item = h('li', { class: `sp-qa__item${q.answered ? ' is-answered' : ''}${q.hidden ? ' is-hidden' : ''}` },
          h('span', { class: 'sp-qa__votes', 'aria-label': `${q.votes} ${q.votes === 1 ? 'vote' : 'votes'}`, text: String(q.votes) }),
          h('span', { class: 'sp-qa__text', text: q.text }));
        const tools = h('span', { class: 'sp-qa__tools' });
        const tool = (label, op) => {
          const b = h('button', { type: 'button', class: 'sp-qa__tool', text: label });
          b.addEventListener('click', () => moderate(q, op));
          tools.append(b);
        };
        if (q.hidden) tool('Show', 'show');
        else {
          tool(q.answered ? 'Reopen' : 'Answered', q.answered ? 'open' : 'answered');
          tool('Hide', 'hide');
        }
        item.append(tools);
        return item;
      }));
      toggle.hidden = hiddenCount === 0;
      toggle.textContent = showHidden ? 'Hide the hidden ones' : `Show ${hiddenCount} hidden`;
      const open = all.filter((q) => !q.answered && !q.hidden).length;
      count.textContent = isLocked(live, block) ? LOCKED_NOTE : all.length ? `${open} open ${open === 1 ? 'question' : 'questions'}${hiddenCount ? `. ${hiddenCount} hidden` : ''}` : live ? 'Waiting for questions' : 'Ask a question to see the list';
    };
    el.querySelector('.sp-live__try')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = e.target.querySelector('input');
      const text = input.value.replace(/\s+/g, ' ').trim().slice(0, 280);
      if (text) {
        if (live) live.ask(block.id, text);
        else local.items.push({ id: `l${++local.seq}`, text, votes: 1, answered: false, hidden: false });
      }
      input.value = '';
      paint();
    });
    paint();
    return live?.subscribe(paint);
  },
});
