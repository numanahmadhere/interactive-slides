import { h, svgIcon } from '../dom.js';
import { str, clamp } from '../util.js';
import { safeImageUrl } from '../sanitize.js';
import { registerBlock } from './registry.js';
import { cleanList, round1, stateOf } from './shared.js';

const MAX_SPOTS = 12;
const coord = (v) => round1(clamp(Number.isFinite(Number(v)) ? Number(v) : 50, 0, 100));
const DRAG_PX = 5;

export default registerBlock({
  type: 'hotspots',
  label: 'Image hotspots',
  group: 'Interactive',
  mountInEdit: true,
  defaults: () => ({ src: '', alt: '', spots: [] }),
  normalize: (p) => ({
    src: str(p.src, '', 3_000_000),
    alt: str(p.alt, '', 500),
    spots: cleanList(p.spots, MAX_SPOTS, (s) => ({ x: coord(s.x), y: coord(s.y), title: str(s.title, '', 120), text: str(s.text, '', 1000) })),
  }),
  fields: [
    { key: 'src', label: 'Image', type: 'image' },
    { key: 'alt', label: 'Alt text', type: 'text', placeholder: 'Describe the image for screen readers' },
    { type: 'hint', text: 'Drag the numbered markers on the slide to position them. Clicking one shows its note.' },
    {
      key: 'spots', label: 'Hotspots', type: 'list', itemLabel: 'Hotspot', add: 'Add hotspot', min: 0, max: MAX_SPOTS,
      item: () => ({ x: 50, y: 50, title: 'Hotspot', text: '' }),
      fields: [
        { key: 'title', label: 'Title', type: 'text' },
        { key: 'text', label: 'Note', type: 'textarea' },
        { key: 'x', label: 'Across (%)', type: 'number', min: 0, max: 100 },
        { key: 'y', label: 'Down (%)', type: 'number', min: 0, max: 100 },
      ],
    },
  ],
  render: (block, ctx) => {
    const { src, alt, spots } = block.props;
    const url = safeImageUrl(ctx.resolveAsset(src));
    const frame = h('div', { class: 'sp-hotspots__frame' });
    if (url) frame.append(h('img', { src: url, alt, draggable: 'false' }));
    else if (ctx.mode === 'edit') frame.append(h('div', { class: 'sp-image__empty', text: 'Add an image in the panel' }));
    spots.forEach((s, i) => {
      frame.append(h('button', {
        type: 'button', class: 'sp-spot', 'data-index': i, style: `left:${s.x}%;top:${s.y}%`,
        'aria-label': `Hotspot ${i + 1}${s.title ? `: ${s.title}` : ''}`, 'aria-expanded': 'false',
      }, String(i + 1)));
    });
    frame.append(h('div', { class: 'sp-callout', role: 'region', hidden: true, 'data-interactive': true },
      h('button', { class: 'sp-callout__close', type: 'button', 'aria-label': 'Close note' }, svgIcon('M18 6 6 18M6 6l12 12', { size: 28 })),
      h('h4', { class: 'sp-callout__title' }),
      h('p', { class: 'sp-callout__text' })));
    return h('div', { class: 'sp-hotspots' }, frame);
  },
  mount: (el, block, ctx) => {
    const area = el.firstElementChild;
    const frame = area.firstElementChild;
    const img = frame.querySelector('img');
    const markers = [...frame.querySelectorAll('.sp-spot')];
    const callout = frame.querySelector('.sp-callout');
    const spots = block.props.spots.map((s) => ({ ...s }));
    const state = stateOf(ctx, block, () => ({ open: -1 }));
    const editing = ctx.mode === 'edit' && !!ctx.edit;

    // The frame is sized to the picture exactly, so marker percentages are
    // relative to the image, not to the letterboxed space around it.
    const fit = () => {
      if (!img?.naturalWidth) return;
      const w = area.clientWidth;
      const hgt = area.clientHeight;
      const k = hgt > 0 ? Math.min(w / img.naturalWidth, hgt / img.naturalHeight) : w / img.naturalWidth;
      frame.style.width = `${Math.round(img.naturalWidth * k)}px`;
      frame.style.height = `${Math.round(img.naturalHeight * k)}px`;
    };
    if (img) {
      if (img.complete) fit();
      else img.addEventListener('load', fit, { once: true });
    }
    const resize = new ResizeObserver(fit);
    resize.observe(area);

    const paint = () => {
      markers.forEach((m, i) => {
        m.setAttribute('aria-expanded', String(i === state.open));
        m.classList.toggle('is-open', i === state.open);
      });
      const spot = spots[state.open];
      if (!spot) {
        callout.hidden = true;
        return;
      }
      callout.querySelector('.sp-callout__title').textContent = spot.title;
      callout.querySelector('.sp-callout__text').textContent = spot.text;
      callout.dataset.side = spot.x < 55 ? 'right' : 'left';
      callout.dataset.valign = spot.y < 30 ? 'top' : spot.y > 70 ? 'bottom' : 'middle';
      callout.style.left = `${spot.x}%`;
      callout.style.top = `${spot.y}%`;
      callout.hidden = false;
    };
    const setOpen = (i) => {
      state.open = i;
      paint();
    };

    let dragged = false;
    markers.forEach((marker, i) => {
      marker.addEventListener('click', () => {
        if (dragged) {
          dragged = false;
          return;
        }
        setOpen(state.open === i ? -1 : i);
      });
      if (!editing) return;
      marker.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        const start = { x: e.clientX, y: e.clientY };
        let moved = false;
        try {
          marker.setPointerCapture(e.pointerId);
        } catch { /* synthetic pointer */ }
        const place = (ev, final) => {
          const rect = frame.getBoundingClientRect();
          spots[i].x = round1(clamp(((ev.clientX - rect.left) / rect.width) * 100, 0, 100));
          spots[i].y = round1(clamp(((ev.clientY - rect.top) / rect.height) * 100, 0, 100));
          marker.style.left = `${spots[i].x}%`;
          marker.style.top = `${spots[i].y}%`;
          if (state.open === i) paint();
          ctx.edit.patch(block.id, { spots: spots.map((s) => ({ ...s })) }, { final });
        };
        const move = (ev) => {
          if (!moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < DRAG_PX) return;
          moved = true;
          dragged = true;
          place(ev, false);
        };
        const up = (ev) => {
          marker.removeEventListener('pointermove', move);
          marker.removeEventListener('pointerup', up);
          marker.removeEventListener('pointercancel', up);
          if (moved) place(ev, true);
        };
        marker.addEventListener('pointermove', move);
        marker.addEventListener('pointerup', up);
        marker.addEventListener('pointercancel', up);
      });
    });

    callout.querySelector('.sp-callout__close').addEventListener('click', () => {
      const open = state.open;
      setOpen(-1);
      markers[open]?.focus();
    });
    el.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || state.open < 0) return;
      e.preventDefault();
      const open = state.open;
      setOpen(-1);
      markers[open]?.focus();
    });
    const onOutside = (e) => {
      if (state.open >= 0 && !e.target.closest?.('.sp-callout, .sp-spot')) setOpen(-1);
    };
    document.addEventListener('pointerdown', onOutside);
    paint();

    return () => {
      resize.disconnect();
      document.removeEventListener('pointerdown', onOutside);
    };
  },
});
