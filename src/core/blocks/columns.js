import { h } from '../dom.js';
import { registerBlock, normalizeSections, blockSteps } from './registry.js';

const container = { key: 'cols', min: 2, max: 4, revealChildren: true, item: () => ({ blocks: [] }) };

export default registerBlock({
  type: 'columns',
  label: 'Columns',
  group: 'Content',
  container,
  defaults: () => ({ cols: [{ blocks: [] }, { blocks: [] }] }),
  normalize: (p, ctx) => ({ cols: normalizeSections(p.cols, container, ctx) }),
  fields: [{ type: 'sections', noun: 'Column' }],
  steps: (block) => [
    ...(block.reveal ? [block.reveal] : []),
    ...block.props.cols.flatMap((c) => c.blocks.flatMap(blockSteps)),
  ],
  render: (block, ctx) => {
    const { cols } = block.props;
    const el = h('div', { class: 'sp-columns', style: `--sp-cols:${cols.length}` });
    cols.forEach((col, i) => {
      const colEl = h('div', { class: 'sp-column', 'data-section': i });
      ctx.renderBlocks(col.blocks, colEl);
      el.append(colEl);
    });
    return el;
  },
});
