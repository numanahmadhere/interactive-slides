// Block types register themselves here. A definition looks like:
//   type, label, defaults(), normalize(props, ctx), render(block, ctx)
// and optionally steps(block) when a block reveals in more than one step.
// Adding an interactive block later means adding one module that registers.

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
