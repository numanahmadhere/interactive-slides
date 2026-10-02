// Pure deck operations used by the editor. Each takes a deck and returns a new
// one, sharing every object that did not change; that is what keeps undo
// history cheap (snapshots are just references) and lets views skip work for
// slides whose object identity is unchanged. A no-op returns the same deck.

import { uid } from '../core/util.js';
import { getLayout } from '../core/layouts.js';
import { MAX_SLIDES } from '../core/schema.js';
import { getBlock, sectionKey } from '../core/blocks/index.js';

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

export function setAspect(deck, aspect) {
  return deck.aspect === aspect ? deck : { ...deck, aspect };
}

export function setAutoplay(deck, patch) {
  const next = { ...deck.autoplay, ...patch };
  return same(next, deck.autoplay) ? deck : { ...deck, autoplay: next };
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
    const slots = new Set(layout.slots.map((s) => s.id));
    const fallback = defaultSlot(layout);
    const blocks = slide.blocks.map((b) => (slots.has(b.slot) ? b : { ...b, slot: fallback }));
    return { ...slide, layout: layout.id, blocks };
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

export function duplicateBlock(deck, blockId) {
  const hit = findBlock(deck, blockId);
  if (!hit) return deck;
  return insertBlock(deck, hit.slide.id, { afterBlockId: blockId }, cloneBlock(hit.block));
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
