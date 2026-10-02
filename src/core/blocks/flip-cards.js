import { h } from '../dom.js';
import { str, oneOf } from '../util.js';
import { registerBlock } from './registry.js';
import { cleanList, pad, stateOf } from './shared.js';

const MAX_CARDS = 8;

export default registerBlock({
  type: 'flip-cards',
  label: 'Flip cards',
  group: 'Interactive',
  mountInEdit: true,
  defaults: () => ({
    cards: [{ front: 'Term one', back: 'What it means.' }, { front: 'Term two', back: 'What it means.' }, { front: 'Term three', back: 'What it means.' }],
    size: 'md',
  }),
  normalize: (p) => ({
    cards: pad(cleanList(p.cards, MAX_CARDS, (c) => ({ front: str(c.front, '', 300), back: str(c.back, '', 600) })), 1, () => ({ front: '', back: '' })),
    size: oneOf(p.size, ['md', 'lg'], 'md'),
  }),
  fields: [
    {
      key: 'cards', label: 'Cards', type: 'list', itemLabel: 'Card', add: 'Add card', min: 1, max: MAX_CARDS,
      item: () => ({ front: 'Front', back: 'Back' }),
      fields: [{ key: 'front', label: 'Front', type: 'textarea' }, { key: 'back', label: 'Back', type: 'textarea' }],
    },
    { key: 'size', label: 'Card height', type: 'segmented', options: [{ value: 'md', label: 'Medium' }, { value: 'lg', label: 'Tall' }] },
  ],
  render: (block, ctx) => {
    const { cards, size } = block.props;
    const state = stateOf(ctx, block, () => ({ flipped: [] }));
    const cols = cards.length <= 4 ? cards.length : Math.ceil(cards.length / 2);
    const root = h('div', { class: `sp-flip sp-flip--${size}`, style: `--sp-flip-cols:${cols}` });
    cards.forEach((card, i) => {
      const flipped = state.flipped.includes(i);
      root.append(h('button', { type: 'button', class: `sp-flip__card${flipped ? ' is-flipped' : ''}`, 'aria-pressed': String(flipped) },
        h('span', { class: 'sp-flip__inner' },
          h('span', { class: 'sp-flip__face sp-flip__face--front', 'aria-hidden': String(flipped), text: card.front }),
          h('span', { class: 'sp-flip__face sp-flip__face--back', 'aria-hidden': String(!flipped), text: card.back }))));
    });
    return root;
  },
  mount: (el, block, ctx) => {
    const state = stateOf(ctx, block, () => ({ flipped: [] }));
    [...el.firstElementChild.children].forEach((card, i) => {
      card.addEventListener('click', () => {
        const flipped = !state.flipped.includes(i);
        state.flipped = flipped ? [...state.flipped, i] : state.flipped.filter((n) => n !== i);
        card.classList.toggle('is-flipped', flipped);
        card.setAttribute('aria-pressed', String(flipped));
        card.querySelector('.sp-flip__face--front').setAttribute('aria-hidden', String(flipped));
        card.querySelector('.sp-flip__face--back').setAttribute('aria-hidden', String(!flipped));
      });
    });
  },
});
