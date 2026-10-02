import { h, svgEl } from '../dom.js';
import { str, oneOf } from '../util.js';
import { registerBlock } from './registry.js';
import { ALIGN_OPTIONS } from './fields.js';

const KINDS = ['rect', 'rounded', 'pill', 'ellipse', 'line', 'arrow'];
const ARROWS = { right: 'M4 12h16M14 6l6 6-6 6', left: 'M20 12H4M10 6l-6 6 6 6', up: 'M12 20V4M6 10l6-6 6 6', down: 'M12 4v16M6 14l6 6 6-6' };

export default registerBlock({
  type: 'shape',
  label: 'Shape',
  group: 'Design',
  defaults: () => ({ kind: 'rounded', fill: 'accent', text: 'Shape', size: 'md', width: 'full', align: 'start', direction: 'right' }),
  normalize: (p) => ({
    kind: oneOf(p.kind, KINDS, 'rounded'),
    fill: oneOf(p.fill, ['accent', 'surface', 'outline', 'muted', 'good', 'bad'], 'accent'),
    text: str(p.text, '', 300),
    size: oneOf(p.size, ['sm', 'md', 'lg'], 'md'),
    width: oneOf(p.width, ['auto', 'half', 'full'], 'full'),
    align: oneOf(p.align, ['start', 'center', 'end'], 'start'),
    direction: oneOf(p.direction, Object.keys(ARROWS), 'right'),
  }),
  fields: [
    { key: 'kind', label: 'Shape', type: 'select', options: [
      { value: 'rounded', label: 'Rounded box' }, { value: 'rect', label: 'Box' }, { value: 'pill', label: 'Pill' },
      { value: 'ellipse', label: 'Ellipse' }, { value: 'line', label: 'Line' }, { value: 'arrow', label: 'Arrow' },
    ] },
    { key: 'direction', label: 'Arrow points', type: 'segmented', options: [{ value: 'right', label: 'Right' }, { value: 'left', label: 'Left' }, { value: 'up', label: 'Up' }, { value: 'down', label: 'Down' }], when: { key: 'kind', in: ['arrow'] } },
    { key: 'fill', label: 'Style', type: 'select', options: [
      { value: 'accent', label: 'Accent' }, { value: 'surface', label: 'Panel' }, { value: 'outline', label: 'Outline' },
      { value: 'muted', label: 'Muted' }, { value: 'good', label: 'Green' }, { value: 'bad', label: 'Red' },
    ] },
    { key: 'size', label: 'Size', type: 'segmented', options: [{ value: 'sm', label: 'Small' }, { value: 'md', label: 'Medium' }, { value: 'lg', label: 'Large' }] },
    { key: 'width', label: 'Width', type: 'segmented', options: [{ value: 'auto', label: 'Fit' }, { value: 'half', label: 'Half' }, { value: 'full', label: 'Full' }], when: { key: 'kind', in: ['rect', 'rounded', 'pill', 'ellipse', 'line'] } },
    { key: 'align', label: 'Text and position', type: 'segmented', options: ALIGN_OPTIONS },
  ],
  edit: [{ prop: 'text', selector: '.sp-shape__text', kind: 'plain', placeholder: 'Text' }],
  render: (block) => {
    const { kind, fill, text, size, width, align, direction } = block.props;
    const attrs = { 'data-kind': kind, 'data-fill': fill, 'data-size': size, 'data-align': align };
    if (kind === 'line') return h('div', { class: 'sp-shape sp-shape--line', ...attrs, 'data-width': width });
    if (kind === 'arrow') {
      const svg = svgEl('svg', { class: 'sp-shape__arrow', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' },
        svgEl('path', { d: ARROWS[direction] }));
      return h('div', { class: 'sp-shape sp-shape--arrow', ...attrs }, svg);
    }
    return h('div', { class: 'sp-shape', ...attrs, 'data-width': width }, h('span', { class: 'sp-shape__text', text }));
  },
});
