// Pure deck operations used by the editor. Each takes a deck and returns a new
// one, sharing every object that did not change; that is what keeps undo
// history cheap (snapshots are just references) and lets views skip work for
// slides whose object identity is unchanged. A no-op returns the same deck.

import { uid } from '../core/util.js';
import { getLayout } from '../core/layouts.js';
import { MAX_SLIDES } from '../core/schema.js';
import { scaleChildFrame } from './transform.js';
import { getBlock, sectionKey, createBlock } from '../core/blocks/index.js';

const same = (a, b) =>
  Object.is(a, b) || (a && b && typeof a === 'object' && JSON.stringify(a) === JSON.stringify(b));

// ---- lookup ---------------------------------------------------------------

export function findSlide(deck, slideId) {
  const index = deck.slides.findIndex((s) => s.id === slideId);
  return index < 0 ? null : { slide: deck.slides[index], index };
}

function search(blocks, id, parent) {
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (block.id === id) return { block, siblings: blocks, index: i, parent };
    const key = sectionKey(block);
    if (key) {
      for (let section = 0; section < block.props[key].length; section++) {
        const hit = search(block.props[key][section].blocks, id, { block, index: section });
        if (hit) return hit;
      }
    }
  }
  return null;
}

// -> { block, siblings, index, parent: null | { block, col }, slide, slideIndex }
export function findBlock(deck, blockId) {
  for (let slideIndex = 0; slideIndex < deck.slides.length; slideIndex++) {
    const slide = deck.slides[slideIndex];
    const hit = search(slide.blocks, blockId, null);
    if (hit) return { ...hit, slide, slideIndex };
  }
  return null;
}

// ---- tree helpers ---------------------------------------------------------

// Runs fn on whichever sibling array holds blockId (a slide's blocks or one
// section of a container) and rebuilds only the path above it.
function editSiblings(blocks, blockId, fn) {
  if (blocks.some((b) => b.id === blockId)) return fn(blocks);
  let changed = false;
  const out = blocks.map((b) => {
    const key = sectionKey(b);
    if (!key) return b;
    let sectionChanged = false;
    const sections = b.props[key].map((section) => {
      const next = editSiblings(section.blocks, blockId, fn);
      if (next === section.blocks) return section;
      sectionChanged = true;
      return { ...section, blocks: next };
    });
    if (!sectionChanged) return b;
    changed = true;
    return { ...b, props: { ...b.props, [key]: sections } };
  });
  return changed ? out : blocks;
}

function replaceSlide(deck, slideId, fn) {
  const i = deck.slides.findIndex((s) => s.id === slideId);
  if (i < 0) return deck;
  const next = fn(deck.slides[i]);
  if (next === deck.slides[i]) return deck;
  const slides = deck.slides.slice();
  slides[i] = next;
  return { ...deck, slides };
}

function editBlockSiblings(deck, blockId, fn) {
  const hit = findBlock(deck, blockId);
  if (!hit) return deck;
  return replaceSlide(deck, hit.slide.id, (slide) => {
    const blocks = editSiblings(slide.blocks, blockId, fn);
    return blocks === slide.blocks ? slide : { ...slide, blocks };
  });
}

function reid(block) {
  block.id = uid('b_');
  const key = sectionKey(block);
  if (key) {
    for (const section of block.props[key]) section.blocks.forEach(reid);
  }
  return block;
}

export function cloneBlock(block) {
  return reid(structuredClone(block));
}

export function cloneSlide(slide) {
  const copy = structuredClone(slide);
  copy.id = uid('s_');
  copy.blocks.forEach(reid);
  return copy;
}

// Props of this block that hold an image (hotspots: one; before/after: two).
export function imageKeys(block) {
  return (getBlock(block.type)?.fields ?? []).filter((f) => f.type === 'image').map((f) => f.key);
}

export function defaultSlot(layout) {
  return (layout.slots.find((s) => s.id === 'body' || s.id === 'main') ?? layout.slots[0]).id;
}

// ---- deck-level -----------------------------------------------------------

export function setTitle(deck, title) {
  return deck.meta.title === title ? deck : { ...deck, meta: { ...deck.meta, title } };
}

export function setTheme(deck, id) {
  return deck.theme.id === id && !Object.keys(deck.theme.overrides).length
    ? deck
    : { ...deck, theme: { id, overrides: {} } };
}

// Replace the colour/font overrides on the current theme (the theme builder).
export function setThemeOverrides(deck, overrides) {
  return same(deck.theme.overrides, overrides) ? deck : { ...deck, theme: { ...deck.theme, overrides } };
}

export function setBrand(deck, patch) {
  const next = { ...deck.brand, ...patch };
  return same(next, deck.brand) ? deck : { ...deck, brand: next };
}

export function setAspect(deck, aspect) {
  return deck.aspect === aspect ? deck : { ...deck, aspect };
}

export function setAutoplay(deck, patch) {
  const next = { ...deck.autoplay, ...patch };
  return same(next, deck.autoplay) ? deck : { ...deck, autoplay: next };
}

export function setCourse(deck, patch) {
  const next = { on: false, certificate: true, ...deck.course, ...patch };
  return same(next, deck.course) ? deck : { ...deck, course: next };
}

export function setDeckTransition(deck, transition) {
  return deck.transition === transition ? deck : { ...deck, transition };
}

// ---- slides ---------------------------------------------------------------

export function insertSlide(deck, index, slide) {
  if (deck.slides.length >= MAX_SLIDES) return deck;
  const at = Math.min(Math.max(index, 0), deck.slides.length);
  const slides = deck.slides.slice();
  slides.splice(at, 0, slide);
  return { ...deck, slides };
}

export function deleteSlide(deck, slideId) {
  if (deck.slides.length <= 1) return deck;
  const slides = deck.slides.filter((s) => s.id !== slideId);
  return slides.length === deck.slides.length ? deck : { ...deck, slides };
}

export function moveSlide(deck, from, to) {
  const last = deck.slides.length - 1;
  if (from < 0 || from > last) return deck;
  const target = Math.min(Math.max(to, 0), last);
  if (target === from) return deck;
  const slides = deck.slides.slice();
  const [moved] = slides.splice(from, 1);
  slides.splice(target, 0, moved);
  return { ...deck, slides };
}

// Blocks whose slot does not exist in the new layout move to its main slot.
export function setSlideLayout(deck, slideId, layoutId) {
  const layout = getLayout(layoutId);
  if (!layout) return deck;
  return replaceSlide(deck, slideId, (slide) => {
    if (slide.layout === layout.id) return slide;
    if (layout.free) return slide; // use convertToFree: it needs measured frames
    const slots = new Set(layout.slots.map((s) => s.id));
    const fallback = defaultSlot(layout);
    const blocks = slide.blocks.map(({ frame, locked, hidden, ...b }) => (slots.has(b.slot) ? b : { ...b, slot: fallback }));
    return { ...slide, layout: layout.id, blocks };
  });
}

// A slide's own background: { color?, image?, dim? } or null for the theme's.
export function setSlideBackground(deck, slideId, background) {
  return replaceSlide(deck, slideId, (slide) => {
    if (same(slide.background ?? null, background ?? null)) return slide;
    const { background: _old, ...rest } = slide;
    return background ? { ...rest, background } : rest;
  });
}

// patch keys: notes, transition (null or '' clears it back to the deck default)
export function patchSlide(deck, slideId, patch) {
  return replaceSlide(deck, slideId, (slide) => {
    const next = { ...slide };
    for (const [key, value] of Object.entries(patch)) {
      const clearing = !value && (key === 'transition' || key === 'timer' || key === 'showTimer');
      if (clearing) {
        delete next[key];
        if (key === 'timer') delete next.showTimer; // nothing left to show
      } else {
        next[key] = value;
      }
    }
    return same(next, slide) ? slide : next;
  });
}

// ---- blocks ---------------------------------------------------------------

// target: { slot }                    end of that slot on the slide
//         { afterBlockId }            right after another block, in its container
//         { containerOf, index }      end of one section (column, tab, ...) of a container block
export function insertBlock(deck, slideId, target, block) {
  if (target.afterBlockId) {
    const hit = findBlock(deck, target.afterBlockId);
    if (!hit) return deck;
    const nested = hit.parent !== null;
    const placed = nested ? withoutSlot(block) : { ...block, slot: hit.block.slot };
    if (nested || !getLayout(hit.slide.layout)?.free) delete placed.frame;
    return editBlockSiblings(deck, target.afterBlockId, (sibs) => {
      const out = sibs.slice();
      out.splice(sibs.findIndex((b) => b.id === target.afterBlockId) + 1, 0, placed);
      return out;
    });
  }
  if (target.containerOf) {
    const placed = withoutSlot(block);
    return updateBlock(deck, target.containerOf, (container) => {
      const key = sectionKey(container);
      if (!key || !container.props[key][target.index]) return container;
      const sections = container.props[key].map((s, i) => (i === target.index ? { ...s, blocks: [...s.blocks, placed] } : s));
      return { ...container, props: { ...container.props, [key]: sections } };
    });
  }
  return replaceSlide(deck, slideId, (slide) => {
    const placed = { ...block, slot: target.slot };
    if (getLayout(slide.layout)?.free) placed.frame ??= defaultFrame(block.type, slide);
    else delete placed.frame;
    let at = slide.blocks.length;
    for (let i = slide.blocks.length - 1; i >= 0; i--) {
      if (slide.blocks[i].slot === target.slot) {
        at = i + 1;
        break;
      }
    }
    const blocks = slide.blocks.slice();
    blocks.splice(at, 0, placed);
    return { ...slide, blocks };
  });
}

function withoutSlot(block) {
  const { slot, ...rest } = block;
  return rest;
}

export function updateBlock(deck, blockId, fn) {
  return editBlockSiblings(deck, blockId, (sibs) => {
    const i = sibs.findIndex((b) => b.id === blockId);
    const next = fn(sibs[i]);
    if (next === sibs[i]) return sibs;
    const out = sibs.slice();
    out[i] = next;
    return out;
  });
}

export function patchBlockProps(deck, blockId, patch) {
  return updateBlock(deck, blockId, (block) => {
    const unchanged = Object.keys(patch).every((k) => same(block.props[k], patch[k]));
    return unchanged ? block : { ...block, props: { ...block.props, ...patch } };
  });
}

export function setBlockReveal(deck, blockId, step) {
  const n = Number.isInteger(step) ? Math.min(Math.max(step, 0), 99) : 0;
  return updateBlock(deck, blockId, (block) => {
    if ((block.reveal || 0) === n) return block;
    const { reveal, ...rest } = block;
    return n > 0 ? { ...rest, reveal: n } : rest;
  });
}

export function removeBlock(deck, blockId) {
  return editBlockSiblings(deck, blockId, (sibs) => sibs.filter((b) => b.id !== blockId));
}

export function removeBlocks(deck, ids) {
  let next = deck;
  for (const id of ids) next = removeBlock(next, id);
  return next;
}

export function duplicateBlock(deck, blockId) {
  const hit = findBlock(deck, blockId);
  if (!hit) return deck;
  const copy = cloneBlock(hit.block);
  if (copy.frame) copy.frame = { ...copy.frame, x: copy.frame.x + DUP_OFFSET, y: copy.frame.y + DUP_OFFSET };
  return insertBlock(deck, hit.slide.id, { afterBlockId: blockId }, copy);
}

// dir -1 moves up, +1 moves down, among blocks sharing the same slot (or the
// same column).
export function moveBlock(deck, blockId, dir) {
  const hit = findBlock(deck, blockId);
  if (!hit) return deck;
  const { siblings, index, block, parent } = hit;
  let j = index + dir;
  if (parent === null) {
    while (j >= 0 && j < siblings.length && siblings[j].slot !== block.slot) j += dir;
  }
  if (j < 0 || j >= siblings.length) return deck;
  return editBlockSiblings(deck, blockId, (sibs) => {
    const out = sibs.slice();
    [out[index], out[j]] = [out[j], out[index]];
    return out;
  });
}

// Top-level blocks only: nested blocks have no slot.
export function moveBlockToSlot(deck, blockId, slotId) {
  const hit = findBlock(deck, blockId);
  if (!hit || hit.parent !== null || hit.block.slot === slotId) return deck;
  const layout = getLayout(hit.slide.layout);
  if (!layout?.slots.some((s) => s.id === slotId)) return deck;
  const moved = { ...hit.block, slot: slotId };
  return replaceSlide(deck, hit.slide.id, (slide) => {
    const blocks = slide.blocks.filter((b) => b.id !== blockId);
    let at = blocks.length;
    for (let i = blocks.length - 1; i >= 0; i--) {
      if (blocks[i].slot === slotId) {
        at = i + 1;
        break;
      }
    }
    blocks.splice(at, 0, moved);
    return { ...slide, blocks };
  });
}

// ---- container sections (columns, tabs, accordion items) ---------------------

export function addSection(deck, blockId) {
  return updateBlock(deck, blockId, (block) => {
    const spec = getBlock(block.type)?.container;
    if (!spec || block.props[spec.key].length >= spec.max) return block;
    return { ...block, props: { ...block.props, [spec.key]: [...block.props[spec.key], spec.item()] } };
  });
}

export function removeSection(deck, blockId, index) {
  return updateBlock(deck, blockId, (block) => {
    const spec = getBlock(block.type)?.container;
    const sections = spec && block.props[spec.key];
    if (!spec || sections.length <= spec.min || !sections[index]) return block;
    return { ...block, props: { ...block.props, [spec.key]: sections.filter((_, i) => i !== index) } };
  });
}

export function moveSection(deck, blockId, index, dir) {
  return updateBlock(deck, blockId, (block) => {
    const spec = getBlock(block.type)?.container;
    const sections = spec && block.props[spec.key];
    const j = index + dir;
    if (!spec || !sections[index] || j < 0 || j >= sections.length) return block;
    const next = sections.slice();
    [next[index], next[j]] = [next[j], next[index]];
    return { ...block, props: { ...block.props, [spec.key]: next } };
  });
}

// Set one field of one section (a tab's title, for instance).
export function patchSection(deck, blockId, index, patch) {
  return updateBlock(deck, blockId, (block) => {
    const key = sectionKey(block);
    const section = key && block.props[key][index];
    if (!section || Object.keys(patch).every((k) => same(section[k], patch[k]))) return block;
    const next = block.props[key].map((s, i) => (i === index ? { ...s, ...patch } : s));
    return { ...block, props: { ...block.props, [key]: next } };
  });
}

// ---- free-form slides -----------------------------------------------------

export const SLIDE_W = 1920;
export const SLIDE_H = 1080;
export const DUP_OFFSET = 40;

const WIDE = new Set(['heading', 'text', 'list', 'quote', 'divider', 'columns', 'chart', 'timeline', 'tabs', 'accordion', 'compare', 'matching', 'ordering', 'code', 'code-sandbox', 'calculator', 'fill-blank', 'reflection', 'reveal-answer', 'quiz', 'poll', 'quiz-results', 'diagram']);
const SMALL = { shape: [360, 360], icon: [200, 200], button: [420, 110] };

// Where a newly inserted block lands on a free-form slide: sensible size per type,
// stepped diagonally so a run of inserts does not pile up on one spot.
export function defaultFrame(type, slide, size) {
  const [w, h] = size ?? SMALL[type] ?? (WIDE.has(type) ? [1280, 0] : [960, 540]);
  const n = slide.blocks.length % 8;
  const x = Math.max(0, Math.round((SLIDE_W - w) / 2) + (n - 4) * 24);
  const y = Math.max(0, Math.round((h ? (SLIDE_H - h) / 2 : 300) + (n - 4) * 24));
  return h ? { x, y, w, h } : { x, y, w };
}

const sameFrame = (a, b) => a && b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h && (a.r ?? 0) === (b.r ?? 0);

// Scale a group's children when the group itself is resized.
function scaledGroup(block, sx, sy) {
  const scaleList = (blocks) => blocks.map((c) => {
    const next = { ...c, frame: c.frame ? scaleChildFrame(c.frame, sx, sy) : c.frame };
    return next;
  });
  return { ...block, props: { ...block.props, items: block.props.items.map((s) => ({ ...s, blocks: scaleList(s.blocks) })) } };
}

// frames: { [blockId]: {x, y, w, h?, r?} }. One pass, so a drag of many blocks is one step.
export function setFrames(deck, frames) {
  const ids = new Set(Object.keys(frames));
  if (!ids.size) return deck;
  let changed = false;
  const slides = deck.slides.map((slide) => {
    if (!slide.blocks.some((b) => ids.has(b.id))) return slide;
    const blocks = slide.blocks.map((b) => {
      const f = frames[b.id];
      if (!f || !b.frame) return b;
      const merged = { ...b.frame, ...f };
      if (!merged.r) delete merged.r;
      if (sameFrame(b.frame, merged)) return b;
      changed = true;
      let next = { ...b, frame: merged };
      if (b.type === 'group' && b.frame.w && (merged.w !== b.frame.w || (merged.h && b.frame.h && merged.h !== b.frame.h))) {
        next = scaledGroup(next, merged.w / b.frame.w, merged.h && b.frame.h ? merged.h / b.frame.h : 1);
      }
      return next;
    });
    return { ...slide, blocks };
  });
  return changed ? { ...deck, slides } : deck;
}

// patch: { locked?: bool, hidden?: bool } applied to top-level blocks by id.
export function setBlockFlags(deck, ids, patch) {
  const set = new Set(ids);
  let changed = false;
  const slides = deck.slides.map((slide) => {
    if (!slide.blocks.some((b) => set.has(b.id))) return slide;
    const blocks = slide.blocks.map((b) => {
      if (!set.has(b.id)) return b;
      const next = { ...b };
      for (const key of ['locked', 'hidden']) {
        if (!(key in patch)) continue;
        if (patch[key]) next[key] = true;
        else delete next[key];
      }
      if (JSON.stringify(next) === JSON.stringify(b)) return b;
      changed = true;
      return next;
    });
    return { ...slide, blocks };
  });
  return changed ? { ...deck, slides } : deck;
}

// Free-form z-order is array order. where: front | back | forward | backward.
export function arrangeBlocks(deck, slideId, ids, where) {
  const set = new Set(ids);
  return replaceSlide(deck, slideId, (slide) => {
    const list = slide.blocks;
    let out;
    if (where === 'front') out = [...list.filter((b) => !set.has(b.id)), ...list.filter((b) => set.has(b.id))];
    else if (where === 'back') out = [...list.filter((b) => set.has(b.id)), ...list.filter((b) => !set.has(b.id))];
    else {
      out = list.slice();
      const step = where === 'forward' ? 1 : -1;
      const order = step > 0 ? [...out.keys()].reverse() : [...out.keys()];
      for (const i of order) {
        const j = i + step;
        if (!set.has(out[i].id) || j < 0 || j >= out.length || set.has(out[j].id)) continue;
        [out[i], out[j]] = [out[j], out[i]];
      }
    }
    return out.every((b, i) => b === list[i]) ? slide : { ...slide, blocks: out };
  });
}

// Insert several blocks at once (paste). Frames are kept and shifted by `offset`.
export function insertBlocks(deck, slideId, blocks, { offset = 0 } = {}) {
  let next = deck;
  for (const block of blocks) {
    const copy = { ...block };
    if (copy.frame && offset) copy.frame = { ...copy.frame, x: copy.frame.x + offset, y: copy.frame.y + offset };
    const slide = findSlide(next, slideId)?.slide;
    const layout = slide && getLayout(slide.layout);
    if (!layout) return deck;
    next = insertBlock(next, slideId, { slot: copy.slot && layout.slots.some((s) => s.id === copy.slot) ? copy.slot : defaultSlot(layout) }, copy);
  }
  return next;
}

// Turn a slide into a free-form one. `frames` are the blocks' measured rectangles (the
// canvas reads them off the screen, so the slide looks the same afterwards).
export function convertToFree(deck, slideId, frames) {
  return replaceSlide(deck, slideId, (slide) => {
    if (getLayout(slide.layout)?.free) return slide;
    const blocks = slide.blocks.map((b, i) => {
      const { slot, ...rest } = b;
      return { ...rest, slot: 'free', frame: frames[b.id] ?? defaultFrame(b.type, { blocks: slide.blocks.slice(0, i) }) };
    });
    return { ...slide, layout: 'free', blocks };
  });
}

// patch: { color?, fill? }; an empty string clears that override.
export function setBlockStyle(deck, ids, patch) {
  const set = new Set(ids);
  let changed = false;
  const slides = deck.slides.map((slide) => {
    if (!slide.blocks.some((b) => set.has(b.id))) return slide;
    const blocks = slide.blocks.map((b) => {
      if (!set.has(b.id)) return b;
      const style = { ...b.style };
      for (const [k, v] of Object.entries(patch)) {
        if (v) style[k] = v;
        else delete style[k];
      }
      const next = { ...b };
      if (Object.keys(style).length) next.style = style;
      else delete next.style;
      if (JSON.stringify(next.style) === JSON.stringify(b.style)) return b;
      changed = true;
      return next;
    });
    return { ...slide, blocks };
  });
  return changed ? { ...deck, slides } : deck;
}

// Move one top-level block to an exact position in the slide's block order.
export function moveBlockTo(deck, slideId, blockId, toIndex) {
  return replaceSlide(deck, slideId, (slide) => {
    const from = slide.blocks.findIndex((b) => b.id === blockId);
    if (from < 0) return slide;
    const to = Math.min(Math.max(toIndex, 0), slide.blocks.length - 1);
    if (to === from) return slide;
    const blocks = slide.blocks.slice();
    const [moved] = blocks.splice(from, 1);
    blocks.splice(to, 0, moved);
    return { ...slide, blocks };
  });
}

// ---- groups ------------------------------------------------------------------

// boxes: { [blockId]: {x, y, w, h} } measured by the canvas (auto-height blocks need it).
export function groupBlocks(deck, slideId, ids, boxes) {
  const hit = findSlide(deck, slideId);
  if (!hit) return deck;
  const members = hit.slide.blocks.filter((b) => ids.includes(b.id) && b.frame && boxes[b.id]);
  if (members.length < 2) return deck;
  const x0 = Math.min(...members.map((b) => boxes[b.id].x));
  const y0 = Math.min(...members.map((b) => boxes[b.id].y));
  const x1 = Math.max(...members.map((b) => boxes[b.id].x + boxes[b.id].w));
  const y1 = Math.max(...members.map((b) => boxes[b.id].y + boxes[b.id].h));
  const children = members.map((b) => {
    const { slot, ...rest } = b;
    return { ...rest, frame: { ...b.frame, x: b.frame.x - x0, y: b.frame.y - y0 } };
  });
  const group = { ...createBlock('group', { props: { items: [{ blocks: children }] } }), slot: 'free', frame: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } };
  const top = Math.max(...members.map((b) => hit.slide.blocks.indexOf(b)));
  return replaceSlide(deck, slideId, (slide) => {
    const ids2 = new Set(members.map((b) => b.id));
    const blocks = [];
    slide.blocks.forEach((b, i) => {
      if (i === top) blocks.push(group);
      if (!ids2.has(b.id)) blocks.push(b);
    });
    return { ...slide, blocks };
  });
}

export function ungroupBlock(deck, slideId, groupId) {
  return replaceSlide(deck, slideId, (slide) => {
    const g = slide.blocks.find((b) => b.id === groupId && b.type === 'group');
    if (!g) return slide;
    const children = (g.props.items[0]?.blocks ?? []).map((c) => ({
      ...c, slot: 'free', frame: c.frame ? { ...c.frame, x: c.frame.x + g.frame.x, y: c.frame.y + g.frame.y } : { x: g.frame.x, y: g.frame.y, w: g.frame.w },
    }));
    const i = slide.blocks.indexOf(g);
    const blocks = slide.blocks.slice();
    blocks.splice(i, 1, ...children);
    return { ...slide, blocks };
  });
}

// ---- several slides at once -------------------------------------------------------

// Never empties the deck: at least one slide is kept.
export function deleteSlides(deck, ids) {
  const drop = new Set(ids);
  const slides = deck.slides.filter((s) => !drop.has(s.id));
  if (slides.length === deck.slides.length) return deck;
  return slides.length ? { ...deck, slides } : deck;
}

// Move the chosen slides (kept in their current order) so the first lands at `toIndex`,
// counted among the slides that are not moving.
export function moveSlides(deck, ids, toIndex) {
  const pick = new Set(ids);
  const moving = deck.slides.filter((s) => pick.has(s.id));
  if (!moving.length) return deck;
  const rest = deck.slides.filter((s) => !pick.has(s.id));
  const at = Math.min(Math.max(toIndex, 0), rest.length);
  const slides = [...rest.slice(0, at), ...moving, ...rest.slice(at)];
  return slides.every((s, i) => s === deck.slides[i]) ? deck : { ...deck, slides };
}

// Copies of the chosen slides go right after the last of them.
export function duplicateSlides(deck, ids) {
  const pick = new Set(ids);
  const originals = deck.slides.filter((s) => pick.has(s.id));
  if (!originals.length || deck.slides.length + originals.length > MAX_SLIDES) return { deck, copies: [] };
  const copies = originals.map(cloneSlide);
  const last = deck.slides.indexOf(originals.at(-1));
  const slides = deck.slides.slice();
  slides.splice(last + 1, 0, ...copies);
  return { deck: { ...deck, slides }, copies };
}

// patch: { anim?: name | '', animDelay?: ms }
export function setBlockAnimation(deck, blockId, patch) {
  return updateBlock(deck, blockId, (block) => {
    const next = { ...block };
    if ('anim' in patch) {
      if (patch.anim) next.anim = patch.anim;
      else { delete next.anim; delete next.animDelay; }
    }
    if ('animDelay' in patch && next.anim) {
      const d = Math.min(5000, Math.max(0, Math.round(patch.animDelay / 100) * 100));
      if (d) next.animDelay = d;
      else delete next.animDelay;
    }
    return JSON.stringify(next) === JSON.stringify(block) ? block : next;
  });
}
