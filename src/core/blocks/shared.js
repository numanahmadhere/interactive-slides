// Helpers shared by the interactive blocks.

import { isObject } from '../util.js';

let counter = 0;

// DOM ids must be unique across the page, and the same block can be on screen
// twice (canvas and thumbnail), so ids are generated per render, not per block.
export const uniqueId = (prefix) => `${prefix}-${++counter}`;

// The block's live state: kept in the presentation session when there is one
// (so it survives leaving and returning to the slide), fresh otherwise.
export function stateOf(ctx, block, init) {
  return ctx.session ? ctx.session.get(block.id, init) : init();
}

// Map a raw array through item(raw, index) -> clean | null, capped at max.
export function cleanList(raw, max, item) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const entry of raw.slice(0, max)) {
    const clean = isObject(entry) ? item(entry, out.length) : null;
    if (clean) out.push(clean);
  }
  return out;
}

export function pad(list, min, make) {
  while (list.length < min) list.push(make());
  return list;
}

export const round1 = (n) => Math.round(n * 10) / 10;
