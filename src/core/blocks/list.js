import { h, rich } from '../dom.js';
import { str, oneOf } from '../util.js';
import { registerBlock } from './registry.js';

const MAX_ITEMS = 50;

// With revealItems, item i appears at step (reveal || 1) + i.
const firstStep = (block) => block.reveal || 1;

export default registerBlock({
  type: 'list',
  label: 'List',
  defaults: () => ({ items: ['Item'], ordered: false, revealItems: false, size: 'md' }),
  normalize: (p) => ({
    items: (Array.isArray(p.items) ? p.items : []).slice(0, MAX_ITEMS).map((s) => str(s, '', 1000)),
    ordered: p.ordered === true,
    revealItems: p.revealItems === true,
    size: oneOf(p.size, ['sm', 'md', 'lg'], 'md'),
  }),
  steps: (block) => {
    const { items, revealItems } = block.props;
    if (!revealItems) return block.reveal ? [block.reveal] : [];
    return items.map((_, i) => firstStep(block) + i);
  },
  render: (block) => {
    const { items, ordered, revealItems, size } = block.props;
    const list = h(ordered ? 'ol' : 'ul', { class: `sp-list sp-list--${size}` });
    items.forEach((html, i) => {
      list.append(rich('li', { 'data-step': revealItems ? firstStep(block) + i : undefined }, html));
    });
    return list;
  },
});
