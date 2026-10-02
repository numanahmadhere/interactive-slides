import { h } from '../dom.js';
import { str, oneOf } from '../util.js';
import { safeImageUrl } from '../sanitize.js';
import { registerBlock } from './registry.js';

export default registerBlock({
  type: 'image',
  label: 'Image',
  group: 'Content',
  defaults: () => ({ src: '', alt: '', fit: 'contain', rounded: false, caption: '' }),
  normalize: (p) => ({
    src: str(p.src, '', 3_000_000),
    alt: str(p.alt, '', 500),
    fit: oneOf(p.fit, ['contain', 'cover'], 'contain'),
    rounded: p.rounded === true,
    caption: str(p.caption, '', 300),
  }),
  fields: [
    { key: 'src', label: 'Image', type: 'image' },
    { key: 'alt', label: 'Alt text', type: 'text', placeholder: 'Describe the image for screen readers' },
    { key: 'fit', label: 'Fit', type: 'segmented', options: [
      { value: 'contain', label: 'Contain' }, { value: 'cover', label: 'Fill' },
    ] },
    { key: 'rounded', label: 'Rounded corners', type: 'toggle' },
    { key: 'caption', label: 'Caption', type: 'text', placeholder: 'Optional caption' },
  ],
  render: (block, ctx) => {
    const { src, alt, fit, rounded, caption } = block.props;
    const url = safeImageUrl(ctx.resolveAsset(src));
    const fig = h('figure', { class: `sp-image sp-image--${fit}${rounded ? ' is-rounded' : ''}` });
    if (url) {
      fig.append(h('img', { src: url, alt, draggable: 'false' }));
    } else if (ctx.mode === 'edit') {
      fig.append(h('div', { class: 'sp-image__empty', text: 'No image' }));
    }
    if (caption) fig.append(h('figcaption', { text: caption }));
    return fig;
  },
});
