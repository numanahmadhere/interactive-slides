import { h, rich } from '../dom.js';
import { str } from '../util.js';
import { registerBlock } from './registry.js';
import { cleanList, pad, stateOf } from './shared.js';

// Quick feedback during a talk: phones show a few big buttons ("Agree", "Slow down", "Hand up") and the
// screen shows how many people chose each. It is a poll underneath, so it needs no new plan limits.
export default registerBlock({
  type: 'reactions',
  label: 'Reactions and hand raise',
  group: 'Interactive',
  defaults: () => ({ question: 'How is this going?', options: ['Agree', 'Need an example', 'Slow down', 'Hand up'].map((text) => ({ text })) }),
  normalize: (p) => ({
    question: str(p.question, '', 1000),
    options: pad(cleanList(p.options, 6, (o) => ({ text: str(o.text, '', 40) })), 2, () => ({ text: '' })),
  }),
  fields: [
    { key: 'options', label: 'Buttons', type: 'list', itemLabel: 'Button', add: 'Add button', min: 2, max: 6, item: () => ({ text: '' }), fields: [{ key: 'text', label: 'Text', type: 'text' }] },
    { type: 'hint', text: 'Each person has one current reaction and can change it. Reset votes between topics from the live panel.' },
  ],
  edit: [{ prop: 'question', selector: '.sp-rx__q', kind: 'rich', placeholder: 'Question' }],
  render: (block, ctx) => {
    const present = ctx.mode === 'present';
    const row = h('div', { class: 'sp-rx__row', role: 'group' });
    block.props.options.forEach(({ text }, i) => row.append(h(present ? 'button' : 'div', { class: 'sp-rx__chip', type: present ? 'button' : undefined, 'data-index': i },
      h('span', { class: 'sp-rx__n', text: '0' }), h('span', { class: 'sp-rx__t', text }))));
    return h('div', { class: 'sp-rx' }, rich('p', { class: 'sp-rx__q' }, block.props.question), row,
      h('p', { class: 'sp-live__count', role: 'status', 'aria-live': 'polite' }));
  },
  mount: (el, block, ctx) => {
    const { options } = block.props;
    const chips = [...el.querySelectorAll('.sp-rx__chip')];
    const count = el.querySelector('.sp-live__count');
    const live = ctx.live ?? null;
    const local = stateOf(ctx, block, () => ({ pick: null }));
    const paint = () => {
      const counts = live?.counts(block.id, options.length) ?? options.map((_, i) => (local.pick === i ? 1 : 0));
      const top = Math.max(0, ...counts);
      chips.forEach((chip, i) => {
        chip.querySelector('.sp-rx__n').textContent = String(counts[i]);
        chip.classList.toggle('is-top', top > 0 && counts[i] === top);
        chip.classList.toggle('is-picked', local.pick === i);
        chip.setAttribute('aria-pressed', String(local.pick === i));
        chip.setAttribute('aria-label', `${options[i].text}, ${counts[i]}`);
      });
      const people = live ? live.voters(block.id) : local.pick === null ? 0 : 1;
      count.textContent = people ? `${people} ${people === 1 ? 'person has' : 'people have'} reacted` : live ? 'Waiting for reactions' : 'Click a button to try it';
    };
    chips.forEach((chip, i) => chip.addEventListener('click', () => {
      local.pick = i;
      live?.vote(block.id, [i]);
      paint();
    }));
    paint();
    return live?.subscribe(paint);
  },
});
