import { h, svgEl } from '../dom.js';
import { str, oneOf } from '../util.js';
import { ICONS, ICON_NAMES } from '../icon-set.js';
import { registerBlock } from './registry.js';
import { ALIGN_OPTIONS } from './fields.js';

const SIZES = { md: 96, lg: 160, xl: 240 };

export default registerBlock({
  type: 'icon',
  label: 'Icon',
  group: 'Design',
  defaults: () => ({ name: 'star', size: 'lg', color: 'accent', label: '', align: 'start' }),
  normalize: (p) => ({
    name: oneOf(p.name, ICON_NAMES, 'star'),
    size: oneOf(p.size, Object.keys(SIZES), 'lg'),
    color: oneOf(p.color, ['accent', 'fg', 'muted', 'good', 'bad'], 'accent'),
    label: str(p.label, '', 120),
    align: oneOf(p.align, ['start', 'center', 'end'], 'start'),
  }),
  fields: [
    { key: 'name', label: 'Icon', type: 'icon' },
    { key: 'size', label: 'Size', type: 'segmented', options: [{ value: 'md', label: 'Medium' }, { value: 'lg', label: 'Large' }, { value: 'xl', label: 'Huge' }] },
    { key: 'color', label: 'Colour', type: 'select', options: [
      { value: 'accent', label: 'Accent' }, { value: 'fg', label: 'Text' }, { value: 'muted', label: 'Muted' }, { value: 'good', label: 'Green' }, { value: 'bad', label: 'Red' },
    ] },
    { key: 'align', label: 'Align', type: 'segmented', options: ALIGN_OPTIONS },
    { key: 'label', label: 'Label under the icon', type: 'text' },
  ],
  edit: [{ prop: 'label', selector: '.sp-icon__label', kind: 'plain', placeholder: 'Label' }],
  render: (block) => {
    const { name, size, color, label, align } = block.props;
    const px = SIZES[size];
    const svg = svgEl('svg', {
      class: 'sp-icon__svg', viewBox: '0 0 24 24', width: px, height: px, fill: 'none', stroke: 'currentColor',
      'stroke-width': 1.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', role: label ? 'img' : undefined, 'aria-label': label || undefined, 'aria-hidden': label ? undefined : 'true',
    }, svgEl('path', { d: ICONS[name] }));
    const el = h('div', { class: `sp-icon sp-icon--${color}`, 'data-align': align }, svg);
    if (label) el.append(h('div', { class: 'sp-icon__label', text: label }));
    return el;
  },
});
