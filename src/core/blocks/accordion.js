import { h, svgIcon } from '../dom.js';
import { registerBlock, normalizeSections, createBlock, blockSteps } from './registry.js';
import { stateOf, uniqueId, itemStep, itemSteps, REVEAL_FIELD } from './shared.js';

const container = { key: 'items', min: 1, max: 8, titled: true, item: () => ({ title: 'Item', blocks: [] }) };

const starter = (title) => ({ title, blocks: [createBlock('text', { props: { text: 'The answer goes here.' } })] });

export default registerBlock({
  type: 'accordion',
  label: 'Accordion',
  group: 'Interactive',
  container,
  mountInEdit: true,
  defaults: () => ({ items: [starter('First question'), starter('Second question')], single: false, revealItems: false }),
  normalize: (p, ctx) => ({ items: normalizeSections(p.items, container, ctx), single: p.single === true, revealItems: p.revealItems === true }),
  steps: (block) => [...itemSteps(block, block.props.items.length), ...block.props.items.flatMap((it) => it.blocks.flatMap(blockSteps))],
  fields: [
    { type: 'sections', noun: 'Item', titleLabel: 'Heading' },
    { key: 'single', label: 'Only one open at a time', type: 'toggle' },
    REVEAL_FIELD,
  ],
  render: (block, ctx) => {
    const { items } = block.props;
    const state = stateOf(ctx, block, () => ({ open: ctx.mode === 'edit' ? [0] : [] }));
    const id = uniqueId('acc');
    const root = h('div', { class: 'sp-acc' });
    items.forEach((item, i) => {
      const open = ctx.mode === 'print' || state.open.includes(i);
      const head = h('button', {
        type: 'button', class: 'sp-acc__head', id: `${id}-h${i}`, 'aria-expanded': String(open), 'aria-controls': `${id}-p${i}`,
      }, h('span', { class: 'sp-acc__title', text: item.title || `Item ${i + 1}` }), svgIcon('M6 9l6 6 6-6', { size: 44 }));
      const panel = h('div', {
        class: 'sp-acc__panel', role: 'region', id: `${id}-p${i}`, 'aria-labelledby': `${id}-h${i}`, 'data-section': i, hidden: !open,
      });
      ctx.renderBlocks(item.blocks, panel, { reveal: false });
      root.append(h('div', { class: 'sp-acc__item', 'data-step': itemStep(block, i) }, h('h3', { class: 'sp-acc__heading' }, head), panel));
    });
    return root;
  },
  mount: (el, block, ctx) => {
    const state = stateOf(ctx, block, () => ({ open: ctx.mode === 'edit' ? [0] : [] }));
    const items = [...el.firstElementChild.children];
    const parts = items.map((item) => [item.querySelector('.sp-acc__head'), item.querySelector('.sp-acc__panel')]);

    const paint = () => {
      parts.forEach(([head, panel], i) => {
        const open = state.open.includes(i);
        head.setAttribute('aria-expanded', String(open));
        panel.hidden = !open;
      });
    };
    parts.forEach(([head], i) => {
      head.addEventListener('click', () => {
        const isOpen = state.open.includes(i);
        if (block.props.single) state.open = isOpen ? [] : [i];
        else state.open = isOpen ? state.open.filter((n) => n !== i) : [...state.open, i];
        paint();
      });
    });
  },
});
