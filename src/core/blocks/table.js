import { h } from '../dom.js';
import { str, oneOf } from '../util.js';
import { registerBlock } from './registry.js';
import { SIZE_OPTIONS } from './fields.js';

const MAX_ROWS = 30;
const MAX_COLS = 8;

// One row per line; cells split on a tab (pasted from a spreadsheet) or on " | ".
export function parseTable(data) {
  const rows = String(data ?? '').split(/\r?\n/).filter((l) => l.trim()).slice(0, MAX_ROWS)
    .map((line) => (line.includes('\t') ? line.split('\t') : line.split(/\s\|\s|^\|\s*|\s*\|$/)).slice(0, MAX_COLS).map((c) => c.trim()));
  const cols = Math.max(0, ...rows.map((r) => r.length));
  return rows.map((r) => Array.from({ length: cols }, (_, i) => r[i] ?? ''));
}

export default registerBlock({
  type: 'table',
  label: 'Table',
  group: 'Content',
  defaults: () => ({ data: 'Plan | Price | Best for\nStarter | $12 | Individuals\nPro | $24 | Teams', header: true, striped: true, size: 'md' }),
  normalize: (p) => ({
    data: str(p.data, '', 6000),
    header: p.header !== false,
    striped: p.striped !== false,
    size: oneOf(p.size, ['sm', 'md', 'lg'], 'md'),
  }),
  fields: [
    { key: 'data', label: 'Cells', type: 'textarea', rows: 8, placeholder: 'One row per line. Separate cells with " | " or paste from a spreadsheet.' },
    { key: 'header', label: 'First row is a header', type: 'toggle' },
    { key: 'striped', label: 'Alternate row shading', type: 'toggle' },
    { key: 'size', label: 'Size', type: 'segmented', options: SIZE_OPTIONS },
  ],
  render: (block) => {
    const { data, header, striped, size } = block.props;
    const rows = parseTable(data);
    const table = h('table', { class: `sp-table sp-table--${size}${striped ? ' is-striped' : ''}` });
    if (!rows.length) return h('div', { class: 'sp-table__empty', text: 'Add cells in the panel' });
    rows.forEach((row, r) => {
      const tr = h('tr');
      row.forEach((text) => tr.append(h(header && r === 0 ? 'th' : 'td', { text, scope: header && r === 0 ? 'col' : undefined })));
      if (header && r === 0) table.append(h('thead', null, tr));
      else {
        let body = table.querySelector('tbody');
        if (!body) table.append((body = h('tbody')));
        body.append(tr);
      }
    });
    return h('div', { class: 'sp-table__wrap' }, table);
  },
});
