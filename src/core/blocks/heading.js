import { rich } from '../dom.js';
import { str, oneOf, clamp } from '../util.js';
import { registerBlock } from './registry.js';
import { ALIGN_OPTIONS } from './fields.js';

export default registerBlock({
  type: 'heading',
  label: 'Heading',
  group: 'Content',
  defaults: () => ({ text: 'Heading', level: 2, align: 'start' }),
  normalize: (p) => ({
    text: str(p.text, '', 500),
    level: clamp(Number.isInteger(p.level) ? p.level : 2, 1, 3),
    align: oneOf(p.align, ['start', 'center', 'end'], 'start'),
  }),
  fields: [
    { key: 'level', label: 'Size', type: 'segmented', options: [
      { value: 1, label: 'Large' }, { value: 2, label: 'Medium' }, { value: 3, label: 'Small' },
    ] },
    { key: 'align', label: 'Align', type: 'segmented', options: ALIGN_OPTIONS },
  ],
  edit: [{ prop: 'text', selector: '', kind: 'rich', placeholder: 'Heading' }],
  render: (block) => {
    const { text, level, align } = block.props;
    return rich(`h${level}`, { class: `sp-heading sp-heading--${level}`, 'data-align': align }, text);
  },
});
