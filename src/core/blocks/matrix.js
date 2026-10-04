import { h } from '../dom.js';
import { str, oneOf } from '../util.js';
import { registerBlock } from './registry.js';

const lines = (s) => String(s ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 8);

// A 2x2 grid with labelled axes: priority matrices, impact/effort, risk maps.
export default registerBlock({
  type: 'matrix',
  label: '2x2 matrix',
  group: 'Content',
  defaults: () => ({
    xLabel: 'Effort', yLabel: 'Impact',
    tl: 'Quick wins', tr: 'Big bets', bl: 'Fill-ins', br: 'Avoid',
    tlItems: 'Fix the sign-up copy', trItems: 'Rebuild onboarding', blItems: 'Update the footer', brItems: 'New logo again',
    size: 'md',
  }),
  normalize: (p) => ({
    xLabel: str(p.xLabel, '', 40), yLabel: str(p.yLabel, '', 40),
    tl: str(p.tl, '', 40), tr: str(p.tr, '', 40), bl: str(p.bl, '', 40), br: str(p.br, '', 40),
    tlItems: str(p.tlItems, '', 800), trItems: str(p.trItems, '', 800), blItems: str(p.blItems, '', 800), brItems: str(p.brItems, '', 800),
    size: oneOf(p.size, ['sm', 'md', 'lg'], 'md'),
  }),
  fields: [
    { key: 'xLabel', label: 'Horizontal axis', type: 'text' },
    { key: 'yLabel', label: 'Vertical axis', type: 'text' },
    { key: 'tl', label: 'Top left title', type: 'text' },
    { key: 'tlItems', label: 'Top left items (one per line)', type: 'textarea', rows: 3 },
    { key: 'tr', label: 'Top right title', type: 'text' },
    { key: 'trItems', label: 'Top right items', type: 'textarea', rows: 3 },
    { key: 'bl', label: 'Bottom left title', type: 'text' },
    { key: 'blItems', label: 'Bottom left items', type: 'textarea', rows: 3 },
    { key: 'br', label: 'Bottom right title', type: 'text' },
    { key: 'brItems', label: 'Bottom right items', type: 'textarea', rows: 3 },
  ],
  render: (block) => {
    const p = block.props;
    const cell = (key) => h('div', { class: 'sp-mx__cell' }, h('h3', { class: 'sp-mx__title', text: p[key] }),
      h('ul', { class: 'sp-mx__list' }, ...lines(p[`${key}Items`]).map((t) => h('li', { text: t }))));
    return h('figure', { class: `sp-mx sp-mx--${p.size}`, 'aria-label': `${p.yLabel} against ${p.xLabel}` },
      h('span', { class: 'sp-mx__y', text: p.yLabel }),
      h('div', { class: 'sp-mx__grid' }, cell('tl'), cell('tr'), cell('bl'), cell('br')),
      h('span', { class: 'sp-mx__x', text: p.xLabel }));
  },
});
