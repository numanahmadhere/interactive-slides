import { h } from '../dom.js';
import { str, oneOf } from '../util.js';
import { registerBlock } from './registry.js';

export default registerBlock({
  type: 'code',
  label: 'Code',
  defaults: () => ({ code: '', language: '', filename: '', size: 'md' }),
  normalize: (p) => ({
    code: str(p.code, '', 20000),
    language: str(p.language, '', 30),
    filename: str(p.filename, '', 120),
    size: oneOf(p.size, ['sm', 'md', 'lg'], 'md'),
  }),
  render: (block) => {
    const { code, language, filename, size } = block.props;
    const wrap = h('figure', { class: `sp-code sp-code--${size}` });
    if (filename || language) {
      wrap.append(h('figcaption', { text: filename || language }));
    }
    wrap.append(h('pre', null, h('code', { text: code, 'data-language': language || undefined })));
    return wrap;
  },
});
