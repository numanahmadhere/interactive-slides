import { h } from '../dom.js';
import { registerBlock, normalizeSections, blockSteps } from './registry.js';

const container = { key: 'items', min: 1, max: 100, revealChildren: false, item: () => ({ blocks: [] }) };

// Free-form blocks moved and resized as one. Children carry frames relative to the
// group's top-left. Made with Group in the editor, so it is not offered in the Insert panel.
export default registerBlock({
  type: 'group',
  label: 'Group',
  group: 'Design',
  internal: true,
  container,
  defaults: () => ({ items: [{ blocks: [] }] }),
  normalize: (p, ctx) => ({ items: normalizeSections(p.items, container, ctx) }),
  fields: [{ type: 'hint', text: 'These blocks move and resize together. Ungroup to edit them one by one (Ctrl+Shift+G).' }],
  steps: (block) => [
    ...(block.reveal ? [block.reveal] : []),
    ...block.props.items.flatMap((c) => c.blocks.flatMap(blockSteps)),
  ],
  render: (block, ctx) => {
    const el = h('div', { class: 'sp-group' });
    ctx.renderBlocks(block.props.items[0].blocks, el);
    return el;
  },
});
