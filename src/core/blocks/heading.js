import { rich } from '../dom.js';
import { str, oneOf, clamp } from '../util.js';
import { registerBlock } from './registry.js';

export default registerBlock({
  type: 'heading',
  label: 'Heading',
  defaults: () => ({ text: 'Heading', level: 2, align: 'start' }),
  normalize: (p) => ({
    text: str(p.text, '', 500),
    level: clamp(Number.isInteger(p.level) ? p.level : 2, 1, 3),
    align: oneOf(p.align, ['start', 'center', 'end'], 'start'),
  }),
  render: (block) => {
    const { text, level, align } = block.props;
    return rich(`h${level}`, { class: `sp-heading sp-heading--${level}`, 'data-align': align }, text);
  },
});
