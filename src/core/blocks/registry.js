// Block types register themselves here. A definition looks like:
//   type, label, group, defaults(), normalize(props, ctx), render(block, ctx)
// plus optional:
//   steps(block)      raw reveal steps beyond block.reveal
//   fields            settings the editor's inspector shows for the block
//   edit              text fields that can be typed into directly on the slide
//   container         { key, min, max, titled?, revealChildren?, item() } for blocks
//                     that hold other blocks in sections (columns, tabs, accordion)
//   mount(el, block, ctx)  behaviour for the live presentation; may return a
//                     function that cleans up. mountInEdit also runs it in the
//                     editor (for purely visual toggles like switching tabs).

import { uid, isObject, str, clamp } from '../util.js';
import { isStyleColor } from '../theme.js';

const defs = new Map();

export const MAX_BLOCKS_PER_LIST = 100;
export const MAX_NESTING = 3;

export function registerBlock(def) {
  defs.set(def.type, def);
  return def;
}

export function getBlock(type) {
  return defs.get(type);
}

export function listBlocks() {
  return [...defs.values()];
}

export function createBlock(type, { props, reveal } = {}) {
  const def = defs.get(type);
  if (!def) throw new Error(`Unknown block type "${type}"`);
  const block = { id: uid('b_'), type, props: { ...def.defaults(), ...props } };
  if (reveal > 0) block.reveal = reveal;
  return block;
}

// ---- containers -------------------------------------------------------------

export function sectionKey(block) {
  return defs.get(block.type)?.container?.key;
}

// The block's sections ([{ blocks, title? }, ...]) or null if it holds none.
export function sectionsOf(block) {
  const key = sectionKey(block);
  return key ? block.props[key] : null;
}

export function normalizeSections(rawList, spec, { state, path, depth }) {
  const raw = Array.isArray(rawList) ? rawList.slice(0, spec.max) : [];
  const out = raw.map((s, i) => {
    const section = isObject(s) ? s : {};
    const clean = {};
    if (spec.titled) clean.title = str(section.title, '', 120);
    clean.blocks = normalizeBlocks(section.blocks, state, `${path}.${spec.key}[${i}]`, depth + 1);
    return clean;
  });
  while (out.length < spec.min) out.push(spec.item());
  return out;
}

// Visits every block, including those nested in containers.
export function walkBlocks(blocks, fn) {
  for (const block of blocks) {
    fn(block);
    for (const section of sectionsOf(block) ?? []) walkBlocks(section.blocks, fn);
  }
}

// fn(block, slide) for every block in the deck.
export function walkDeck(deck, fn) {
  for (const slide of deck.slides) walkBlocks(slide.blocks, (block) => fn(block, slide));
}

// ---- normalisation ----------------------------------------------------------

// A free-form block's place on the 1920-wide canvas. h is optional (auto height).
export const FRAME_LIMITS = { min: 8, max: 6000 };
export function normalizeFrame(raw) {
  if (!isObject(raw)) return null;
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
  const x = num(raw.x);
  const y = num(raw.y);
  const w = num(raw.w);
  if (x === null || y === null || w === null) return null;
  const r2 = (v) => Math.round(v * 100) / 100;
  const frame = {
    x: r2(clamp(x, -FRAME_LIMITS.max, FRAME_LIMITS.max)),
    y: r2(clamp(y, -FRAME_LIMITS.max, FRAME_LIMITS.max)),
    w: r2(clamp(w, FRAME_LIMITS.min, FRAME_LIMITS.max)),
  };
  const h = num(raw.h);
  if (h !== null && h > 0) frame.h = r2(clamp(h, FRAME_LIMITS.min, FRAME_LIMITS.max));
  const r = num(raw.r);
  if (r !== null && r % 360 !== 0) frame.r = r2(((r % 360) + 360) % 360);
  return frame;
}

// Optional look overrides for one block: text colour and fill, each a theme token or hex.
function normalizeStyle(raw) {
  if (!isObject(raw)) return null;
  const style = {};
  if (isStyleColor(raw.color)) style.color = raw.color;
  if (isStyleColor(raw.fill)) style.fill = raw.fill;
  return Object.keys(style).length ? style : null;
}

// state: { warn(msg), seen: Set<string> } shared across one normalizeDeck run.
export function normalizeBlock(raw, state, path, depth = 0) {
  if (!isObject(raw)) {
    state.warn(`${path}: not an object, dropped`);
    return null;
  }
  const type = str(raw.type, '', 40);
  let id = str(raw.id, '', 64);
  if (!id || state.seen.has(id)) id = uid('b_');
  state.seen.add(id);

  const block = { id, type };
  if (typeof raw.slot === 'string') block.slot = raw.slot.slice(0, 40);
  const reveal = Number.isInteger(raw.reveal) ? clamp(raw.reveal, 0, 99) : 0;
  if (reveal > 0) block.reveal = reveal;

  const frame = normalizeFrame(raw.frame);
  if (frame) block.frame = frame;
  const style = normalizeStyle(raw.style);
  if (style) block.style = style;
  if (raw.locked === true) block.locked = true;
  if (raw.hidden === true) block.hidden = true;

  const props = isObject(raw.props) ? raw.props : {};
  const def = defs.get(type);
  if (!def) {
    state.warn(`${path}: unknown block type "${type}", kept as-is`);
    block.props = props;
    return block;
  }
  block.props = def.normalize({ ...def.defaults(), ...props }, { state, path, depth });
  return block;
}

export function normalizeBlocks(rawList, state, path, depth = 0) {
  if (!Array.isArray(rawList)) return [];
  if (depth >= MAX_NESTING) {
    state.warn(`${path}: nesting too deep, dropped`);
    return [];
  }
  if (rawList.length > MAX_BLOCKS_PER_LIST) {
    state.warn(`${path}: more than ${MAX_BLOCKS_PER_LIST} blocks, extras dropped`);
  }
  const out = [];
  rawList.slice(0, MAX_BLOCKS_PER_LIST).forEach((raw, i) => {
    const block = normalizeBlock(raw, state, `${path}[${i}]`, depth);
    if (block) out.push(block);
  });
  return out;
}

// Raw step numbers a block contributes (before de-duplication into ordinals).
export function blockSteps(block) {
  const def = defs.get(block.type);
  if (def?.steps) return def.steps(block);
  return block.reveal ? [block.reveal] : [];
}
