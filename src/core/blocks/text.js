import { rich } from '../dom.js';
import { str, oneOf } from '../util.js';
import { registerBlock } from './registry.js';
import { ALIGN_OPTIONS, SIZE_OPTIONS } from './fields.js';

export default registerBlock({
  type: 'text',
  label: 'Text',
  group: 'Content',
  defaults: () => ({ text: 'Text', size: 'md', align: 'start', muted: false }),
  normalize: (p) => ({
    text: str(p.text, '', 5000),
    size: oneOf(p.size, ['sm', 'md', 'lg'], 'md'),
    align: oneOf(p.align, ['start', 'center', 'end'], 'start'),
    muted: p.muted === true,
  }),
  fields: [
    { key: 'size', label: 'Size', type: 'segmented', options: SIZE_OPTIONS },
    { key: 'align', label: 'Align', type: 'segmented', options: ALIGN_OPTIONS },
    { key: 'muted', label: 'Muted colour', type: 'toggle' },
  ],
  edit: [{ prop: 'text', selector: '', kind: 'rich', placeholder: 'Text' }],
  render: (block) => {
    const { text, size, align, muted } = block.props;
    return rich('p', { class: `sp-text sp-text--${size}${muted ? ' is-muted' : ''}`, 'data-align': align }, text);
  },
});
