import { h } from '../dom.js';
import { isObject, clamp } from '../util.js';
import { registerBlock, normalizeBlocks, blockSteps } from './registry.js';

const MIN_COLS = 2;
const MAX_COLS = 4;

export default registerBlock({
  type: 'columns',
  label: 'Columns',
  defaults: () => ({ cols: [{ blocks: [] }, { blocks: [] }] }),
  normalize: (p, { state, path, depth }) => {
    const raw = Array.isArray(p.cols) ? p.cols.slice(0, MAX_COLS) : [];
    const cols = raw.map((c, i) => ({
      blocks: normalizeBlocks(isObject(c) ? c.blocks : [], state, `${path}.cols[${i}]`, depth + 1),
    }));
    while (cols.length < MIN_COLS) cols.push({ blocks: [] });
    return { cols };
  },
  fields: [{ type: 'columns' }],
  steps: (block) => [
    ...(block.reveal ? [block.reveal] : []),
    ...block.props.cols.flatMap((c) => c.blocks.flatMap(blockSteps)),
  ],
  render: (block, ctx) => {
    const { cols } = block.props;
    const el = h('div', { class: 'sp-columns', style: `--sp-cols:${clamp(cols.length, MIN_COLS, MAX_COLS)}` });
    for (const col of cols) {
      const colEl = h('div', { class: 'sp-column' });
      ctx.renderBlocks(col.blocks, colEl);
      el.append(colEl);
    }
    return el;
  },
});
