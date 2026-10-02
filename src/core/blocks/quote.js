import { h, rich } from '../dom.js';
import { str } from '../util.js';
import { registerBlock } from './registry.js';

export default registerBlock({
  type: 'quote',
  label: 'Quote',
  defaults: () => ({ text: 'Quote', cite: '' }),
  normalize: (p) => ({ text: str(p.text, '', 2000), cite: str(p.cite, '', 200) }),
  fields: [],
  edit: [
    { prop: 'text', selector: 'blockquote', kind: 'rich', placeholder: 'Quote' },
    { prop: 'cite', selector: 'figcaption', kind: 'plain', placeholder: 'Source' },
  ],
  render: (block, ctx) => {
    const { text, cite } = block.props;
    const el = h('figure', { class: 'sp-quote' });
    el.append(rich('blockquote', null, text));
    if (cite || ctx.mode === 'edit') el.append(h('figcaption', { text: cite }));
    return el;
  },
});
