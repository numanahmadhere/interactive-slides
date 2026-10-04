import { h } from '../dom.js';
import { str, oneOf, clamp } from '../util.js';
import { safeImageUrl } from '../sanitize.js';
import { registerBlock } from './registry.js';

export default registerBlock({
  type: 'image',
  label: 'Image',
  group: 'Content',
  defaults: () => ({ src: '', alt: '', fit: 'contain', rounded: false, caption: '', zoom: 1, fx: 50, fy: 50 }),
  normalize: (p) => ({
    src: str(p.src, '', 3_000_000),
    alt: str(p.alt, '', 500),
    fit: oneOf(p.fit, ['contain', 'cover'], 'contain'),
    rounded: p.rounded === true,
    caption: str(p.caption, '', 300),
    zoom: Number.isFinite(Number(p.zoom)) ? clamp(Math.round(Number(p.zoom) * 100) / 100, 1, 4) : 1,
    fx: Number.isFinite(Number(p.fx)) ? clamp(Math.round(Number(p.fx)), 0, 100) : 50,
    fy: Number.isFinite(Number(p.fy)) ? clamp(Math.round(Number(p.fy)), 0, 100) : 50,
  }),
  fields: [
    { key: 'src', label: 'Image', type: 'image' },
    { key: 'alt', label: 'Alt text', type: 'text', placeholder: 'Describe the image for screen readers' },
    { key: 'fit', label: 'Fit', type: 'segmented', options: [
      { value: 'contain', label: 'Contain' }, { value: 'cover', label: 'Fill' },
    ] },
    { key: 'rounded', label: 'Rounded corners', type: 'toggle' },
    { key: 'zoom', label: 'Zoom (crop)', type: 'range', min: 1, max: 4, step: 0.05 },
    { key: 'caption', label: 'Caption', type: 'text', placeholder: 'Optional caption' },
  ],
  render: (block, ctx) => {
    const { src, alt, fit, rounded, caption, zoom, fx, fy } = block.props;
    const url = safeImageUrl(ctx.resolveAsset(src));
    const fig = h('figure', { class: `sp-image sp-image--${fit}${rounded ? ' is-rounded' : ''}` });
    if (url) {
      const img = h('img', { src: url, alt, draggable: 'false' });
      // Crop: zoom in on a point of the picture, kept inside the frame.
      if (zoom > 1 || fx !== 50 || fy !== 50) {
        img.style.objectPosition = `${fx}% ${fy}%`;
        if (zoom > 1) img.style.transform = `scale(${zoom})`;
        img.style.transformOrigin = `${fx}% ${fy}%`;
        fig.classList.add('is-cropped');
      }
      fig.append(img);
    } else if (ctx.mode === 'edit') {
      fig.append(h('div', { class: 'sp-image__empty', text: 'No image' }));
    }
    if (caption) fig.append(h('figcaption', { text: caption }));
    return fig;
  },
});
