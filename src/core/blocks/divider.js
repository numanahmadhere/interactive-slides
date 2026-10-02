import { h } from '../dom.js';
import { oneOf } from '../util.js';
import { registerBlock } from './registry.js';

export default registerBlock({
  type: 'divider',
  label: 'Divider',
  defaults: () => ({ style: 'line' }),
  normalize: (p) => ({ style: oneOf(p.style, ['line', 'accent'], 'line') }),
  render: (block) => h('hr', { class: `sp-divider sp-divider--${block.props.style}` }),
});
