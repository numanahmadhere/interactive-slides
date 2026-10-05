import { h, rich } from '../dom.js';
import { str } from '../util.js';
import { safeImageUrl } from '../sanitize.js';
import { registerBlock } from './registry.js';
import { stateOf } from './shared.js';

const THUMB_WIDTH = 480;
const THUMB_MAX_CHARS = 38000; // under the protocol's limit

// A small JPEG of the picture for phones to tap on. Drawn on the presenter's page, so the original never leaves it.
function thumbnail(img) {
  try {
    const ratio = img.naturalWidth / img.naturalHeight;
    if (!img.naturalWidth || !img.naturalHeight) return null;
    for (const [width, quality] of [[THUMB_WIDTH, 0.7], [400, 0.55], [320, 0.45], [240, 0.4]]) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.min(width, img.naturalWidth);
      canvas.height = Math.max(1, Math.round(canvas.width / ratio));
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      const url = canvas.toDataURL('image/jpeg', quality);
      if (url.length <= THUMB_MAX_CHARS) return { image: url, ratio };
    }
  } catch { /* an image the browser will not let us read: phones get a blank target */ }
  return null;
}

export default registerBlock({
  type: 'pin',
  label: 'Pin on image',
  group: 'Interactive',
  mountInEdit: false,
  defaults: () => ({ question: 'Where would you put the new entrance?', src: '', alt: '' }),
  normalize: (p) => ({ question: str(p.question, '', 1000), src: str(p.src, '', 3_000_000), alt: str(p.alt, '', 500) }),
  fields: [
    { key: 'src', label: 'Image', type: 'image' },
    { key: 'alt', label: 'Alt text', type: 'text', placeholder: 'Describe the image for screen readers' },
    { type: 'hint', text: 'Each person taps once on their phone; the dots appear here. Good for maps, floor plans, diagrams and screenshots.' },
  ],
  edit: [{ prop: 'question', selector: '.sp-pin__q', kind: 'rich', placeholder: 'Question' }],
  render: (block, ctx) => {
    const url = safeImageUrl(ctx.resolveAsset(block.props.src));
    const stage = h('div', { class: 'sp-pin__stage' });
    const frame = h('div', { class: 'sp-pin__frame' }); // wraps the picture tightly, so dots line up with it
    if (url) frame.append(h('img', { src: url, alt: block.props.alt, draggable: 'false' }));
    else frame.append(h('div', { class: 'sp-image__empty', text: 'Choose an image in the panel' }));
    frame.append(h('div', { class: 'sp-pin__dots' }));
    stage.append(frame);
    const root = h('div', { class: 'sp-pin' }, rich('p', { class: 'sp-pin__q' }, block.props.question), stage);
    if (ctx.mode === 'present') root.append(h('p', { class: 'sp-live__count', role: 'status', 'aria-live': 'polite' }));
    return root;
  },
  mount: (el, block, ctx) => {
    const live = ctx.live ?? null;
    const img = el.querySelector('.sp-pin__frame img');
    const layer = el.querySelector('.sp-pin__dots');
    const count = el.querySelector('.sp-live__count');
    const local = stateOf(ctx, block, () => ({ pins: [] }));
    const share = () => {
      const t = img && thumbnail(img);
      live?.setImage?.(block.id, t?.image ?? '', t?.ratio ?? (img?.naturalWidth ? img.naturalWidth / img.naturalHeight : 1.5));
    };
    if (live && img) {
      if (img.complete) share();
      else img.addEventListener('load', share, { once: true });
    }
    const paint = () => {
      const pins = live ? live.pins(block.id) : local.pins;
      layer.replaceChildren(...pins.map(([x, y]) => h('span', { class: 'sp-pin__dot', style: `left:${x / 10}%;top:${y / 10}%` })));
      count.textContent = pins.length ? `${pins.length} ${pins.length === 1 ? 'pin' : 'pins'}` : live ? 'Waiting for pins' : 'Click the picture to try it';
    };
    el.querySelector('.sp-pin__frame').addEventListener('click', (e) => {
      const box = e.currentTarget.getBoundingClientRect();
      const x = Math.max(0, Math.min(1000, Math.round(((e.clientX - box.left) / box.width) * 1000)));
      const y = Math.max(0, Math.min(1000, Math.round(((e.clientY - box.top) / box.height) * 1000)));
      if (live) live.pin(block.id, x, y);
      else local.pins = [...local.pins.slice(-299), [x, y]];
      paint();
    });
    paint();
    return live?.subscribe(paint);
  },
});
