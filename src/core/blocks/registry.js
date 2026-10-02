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
