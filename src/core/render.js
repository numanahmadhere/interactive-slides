// Turns a deck's data into DOM. One renderer serves the editor canvas, the
// presenter, thumbnails and the standalone export; `mode` is the only thing
// that changes ("present", "edit" or "thumb").

import { h } from './dom.js';
import { getLayout } from './layouts.js';
import { getBlock } from './blocks/index.js';
import { slideTitle } from './schema.js';

const V_ALIGN = { start: 'flex-start', center: 'center', end: 'flex-end' };

export function makeContext({ deck, slide, mode = 'present', resolveAsset } = {}) {
  const ctx = {
    deck,
    slide,
    mode,
    resolveAsset: resolveAsset ?? ((src) => src),
    renderBlocks(blocks, container) {
      for (const block of blocks) container.append(renderBlock(block, ctx));
    },
  };
  return ctx;
}

export function renderBlock(block, ctx) {
  const def = getBlock(block.type);
  const wrap = h('div', {
    class: 'sp-block',
    'data-block': block.id,
    'data-type': block.type,
    'data-step': block.reveal || undefined,
  });
  if (!def) {
    wrap.append(h('div', { class: 'sp-block__unknown', text: `Unsupported block: ${block.type}` }));
    return wrap;
  }
  try {
    wrap.append(def.render(block, ctx));
  } catch (err) {
    console.error(`Block ${block.type} failed to render`, err);
    wrap.append(h('div', { class: 'sp-block__unknown', text: `Could not render ${block.type}` }));
  }
  return wrap;
}

export function renderSlide(deck, slide, { mode = 'present', resolveAsset, index = 0 } = {}) {
  const layout = getLayout(slide.layout) ?? getLayout('blank');
  const ctx = makeContext({ deck, slide, mode, resolveAsset });

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
  return el;
}
