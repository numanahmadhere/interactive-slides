// Turns a deck's data into DOM. One renderer serves the editor canvas, the
// presenter, thumbnails and the standalone export; `mode` is the only thing
// that changes ("present", "edit", "thumb", "print" for expanded handouts, and
// "image" for pictures of the slide exactly as it looks on screen).
//
// Interactive blocks describe their behaviour in a mount() hook. Rendering is
// pure DOM building; behaviour is attached afterwards by activateSlide(), once
// the slide is on the page, and detached by the function it returns.

import { h } from './dom.js';
import { getLayout } from './layouts.js';
import { getBlock } from './blocks/index.js';
import { slideTitle } from './schema.js';

const V_ALIGN = { start: 'flex-start', center: 'center', end: 'flex-end' };
const mounts = new WeakMap(); // slide element -> [() => dispose?]

// session: shared interactive state (see session.js)
// actions: { next, prev, first, back, goToSlide(id) } for blocks that navigate
// edit: { patch(blockId, props, { final }) } so blocks can be adjusted on the canvas
export function makeContext({ deck, slide, mode = 'present', resolveAsset, session = null, actions = null, edit = null } = {}) {
  const ctx = {
    deck,
    slide,
    mode,
    session,
    actions,
    edit,
    resolveAsset: resolveAsset ?? ((src) => src),
    mounts: [],
    renderBlocks(blocks, container, opts) {
      for (const block of blocks) container.append(renderBlock(block, ctx, opts));
    },
  };
  return ctx;
}

// opts.reveal: false ignores `reveal` on these blocks (inside tabs and the like,
// where a slide-level step would hide something the audience cannot find).
export function renderBlock(block, ctx, { reveal = true } = {}) {
  const def = getBlock(block.type);
  const wrap = h('div', {
    class: 'sp-block',
    'data-block': block.id,
    'data-type': block.type,
    'data-step': reveal ? block.reveal || undefined : undefined,
  });
  if (!def) {
    wrap.append(h('div', { class: 'sp-block__unknown', text: `Unsupported block: ${block.type}` }));
    return wrap;
  }
  try {
    wrap.append(def.render(block, ctx));
    const mounts = ctx.mode === 'present' || (ctx.mode === 'edit' && def.mountInEdit) || ((ctx.mode === 'print' || ctx.mode === 'image') && def.mountInPrint);
    if (def.mount && mounts) {
      ctx.mounts.push(() => def.mount(wrap, block, ctx));
    }
  } catch (err) {
    console.error(`Block ${block.type} failed to render`, err);
    wrap.append(h('div', { class: 'sp-block__unknown', text: `Could not render ${block.type}` }));
  }
  return wrap;
}

export function renderSlide(deck, slide, { mode = 'present', resolveAsset, index = 0, session, actions, edit } = {}) {
  const layout = getLayout(slide.layout) ?? getLayout('blank');
  const ctx = makeContext({ deck, slide, mode, resolveAsset, session, actions, edit });

  const el = h('section', {
    class: `sp-slide sp-layout-${layout.id}`,
    'data-layout': layout.id,
    'data-tone': layout.tone,
    'data-slide': slide.id,
    'aria-label': slideTitle(slide, index),
  });
  const { grid } = layout;
  el.style.gridTemplateAreas = grid.areas.map((row) => `"${row.join(' ')}"`).join(' ');
  el.style.gridTemplateColumns = grid.columns;
  el.style.gridTemplateRows = grid.rows;
  el.style.gap = grid.gap;
  el.style.padding = layout.pad;
  if (grid.align) el.style.alignContent = grid.align;

  for (const slot of layout.slots) {
    const slotEl = h('div', { class: `sp-slot${slot.scrim ? ' has-scrim' : ''}`, 'data-slot': slot.id });
    slotEl.style.gridArea = slot.area ?? slot.id;
    if (slot.pad !== undefined) slotEl.style.padding = slot.pad;
    if (slot.layer !== undefined) slotEl.style.zIndex = String(slot.layer);
    if (slot.v) slotEl.style.justifyContent = V_ALIGN[slot.v];
    ctx.renderBlocks(slide.blocks.filter((b) => b.slot === slot.id), slotEl);
    el.append(slotEl);
  }
  mounts.set(el, ctx.mounts);
  return el;
}

// Attach behaviour to a slide element that is now in the document. Returns a
// function that detaches it (timers, document listeners).
export function activateSlide(el) {
  const disposers = [];
  for (const mount of mounts.get(el) ?? []) {
    try {
      const dispose = mount();
      if (typeof dispose === 'function') disposers.push(dispose);
    } catch (err) {
      console.error('Block failed to start', err);
    }
  }
  return () => {
    for (const dispose of disposers) {
      try {
        dispose();
      } catch (err) {
        console.error('Block failed to stop', err);
      }
    }
  };
}
