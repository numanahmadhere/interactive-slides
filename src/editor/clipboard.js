// Copy and paste of blocks, within a deck, between decks, and between tabs. Blocks go
// to the system clipboard as JSON under a private type, and also to localStorage so a
// paste in another tab (where custom clipboard types may not survive) still finds them.
// Whatever comes back is run through the same normaliser as an imported deck.

import { normalizeBlocks } from '../core/blocks/index.js';
import { escapeHtml } from '../core/util.js';
import { cloneBlock } from './ops.js';

export const CLIP_TYPE = 'application/x-densight-blocks';
const KEY = 'densight:clipboard';

const plainText = (html) => String(html ?? '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();

// A readable stand-in for apps that only take text.
export function textOf(blocks) {
  return blocks
    .map((b) => plainText(b.props?.text ?? b.props?.items?.join?.('\n') ?? b.props?.question ?? ''))
    .filter(Boolean)
    .join('\n');
}

export function serialize(blocks) {
  return JSON.stringify({ kind: 'densight-blocks', version: 1, blocks });
}

// -> array of fresh blocks (new ids), or null when the data is not ours.
export function parse(json) {
  let data;
  try {
    data = JSON.parse(json);
  } catch {
    return null;
  }
  if (data?.kind !== 'densight-blocks' || !Array.isArray(data.blocks)) return null;
  const state = { warn() {}, seen: new Set() };
  const blocks = normalizeBlocks(data.blocks, state, 'clipboard');
  return blocks.length ? blocks.map(cloneBlock) : null;
}

export function remember(blocks) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ json: serialize(blocks), text: textOf(blocks) }));
  } catch { /* storage full or blocked: the system clipboard still works */ }
}

function remembered() {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? 'null');
  } catch {
    return null;
  }
}

// Put blocks on the clipboard during a copy or cut event.
export function writeBlocks(event, blocks) {
  const text = textOf(blocks);
  event.clipboardData.setData(CLIP_TYPE, serialize(blocks));
  event.clipboardData.setData('text/plain', text);
  remember(blocks);
}

const IMAGE_URL = /^https?:\/\/\S+\.(?:png|jpe?g|gif|webp|avif|svg)(?:\?\S*)?$/i;
const ANY_URL = /^https?:\/\/\S+$/i;

// What a paste event holds: { blocks } of ours, { files }, or { text, kind }.
export function readPaste(event) {
  const data = event.clipboardData;
  if (!data) return null;
  const ours = data.getData(CLIP_TYPE);
  if (ours) {
    const blocks = parse(ours);
    if (blocks) return { blocks };
  }
  const files = [...(data.files ?? [])].filter((f) => f.type.startsWith('image/'));
  if (files.length) return { files };
  const text = data.getData('text/plain');
  const last = remembered();
  if (last && text && text === last.text) {
    const blocks = parse(last.json);
    if (blocks) return { blocks };
  }
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (IMAGE_URL.test(trimmed)) return { imageUrl: trimmed };
  if (ANY_URL.test(trimmed)) return { link: trimmed };
  return { text: trimmed };
}

export const textHtml = (text) => escapeHtml(text).replace(/\n/g, '<br>');
