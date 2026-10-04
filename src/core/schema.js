// The deck model. A deck is plain JSON:
//   { version, meta, theme: {id, overrides}, aspect, transition, slides: [...] }
//   slide: { id, layout, blocks: [{id, type, slot, props, reveal?}], notes, transition? }
// normalizeDeck() is the single gate for anything that did not come from the
// editor itself (imports, localStorage, sample data): it repairs what it can,
// reports what it repaired, and never returns a deck the renderer cannot draw.

import { uid, isObject, str, oneOf, stripTags, clamp } from './util.js';
import { getLayout } from './layouts.js';
import { normalizeBlocks, createBlock, blockSteps } from './blocks/index.js';
import { normalizeThemeRef, DEFAULT_THEME, isColor } from './theme.js';

export const DECK_VERSION = 1;
export const MAX_SLIDES = 500;
export const ASPECTS = {
  '16:9': { width: 1920, height: 1080 },
  '4:3': { width: 1440, height: 1080 },
};
export const TRANSITIONS = ['fade', 'slide', 'zoom', 'none'];
export const LOGO_POSITIONS = ['bottom-right', 'bottom-left', 'top-right', 'top-left'];

export class DeckError extends Error {}

export function createSlide(layoutId = 'content') {
  const layout = getLayout(layoutId);
  if (!layout) throw new DeckError(`Unknown layout "${layoutId}"`);
  return {
    id: uid('s_'),
    layout: layout.id,
    blocks: layout.starter().map((b) => ({
      ...createBlock(b.type, { props: b.props }),
      slot: b.slot,
      ...(b.frame ? { frame: b.frame } : {}),
    })),
    notes: '',
  };
}

export function createDeck({ title = 'Untitled deck', theme = DEFAULT_THEME, aspect = '16:9' } = {}) {
  const now = new Date().toISOString();
  return {
    version: DECK_VERSION,
    meta: { title, author: '', createdAt: now, updatedAt: now },
    theme: { id: theme, overrides: {} },
    aspect,
    transition: 'fade',
    autoplay: { seconds: 0, loop: true },
    brand: { logo: '', position: 'bottom-right', size: 'md' },
    slides: [createSlide('title')],
  };
}

function normalizeSlide(raw, index, state) {
  const path = `slides[${index}]`;
  if (!isObject(raw)) {
    state.warn(`${path}: not an object, dropped`);
    return null;
  }
  let id = str(raw.id, '', 64);
  if (!id || state.seen.has(id)) id = uid('s_');
  state.seen.add(id);

  let layout = getLayout(raw.layout);
  if (!layout) {
    state.warn(`${path}: unknown layout "${raw.layout}", using blank`);
    layout = getLayout('blank');
  }
  const slotIds = layout.slots.map((s) => s.id);
  const fallbackSlot = (layout.slots.find((s) => s.id === 'body' || s.id === 'main') ?? layout.slots[0]).id;

  const blocks = normalizeBlocks(raw.blocks, state, `${path}.blocks`);
  for (const block of blocks) {
    if (!slotIds.includes(block.slot)) {
      if (block.slot) state.warn(`${path}: slot "${block.slot}" not in layout "${layout.id}", moved to "${fallbackSlot}"`);
      block.slot = fallbackSlot;
    }
    if (layout.free) block.frame ??= { x: 128, y: 128, w: 800 };
    else delete block.frame;
  }

  const slide = { id, layout: layout.id, blocks, notes: str(raw.notes, '', 20000) };
  if (TRANSITIONS.includes(raw.transition)) slide.transition = raw.transition;
  const background = normalizeBackground(raw.background);
  if (background) slide.background = background;
  // Countdown for the speaker (and optionally shown on screen), in seconds.
  const timer = Number.isFinite(Number(raw.timer)) ? clamp(Math.round(Number(raw.timer)), 0, 86400) : 0;
  if (timer > 0) {
    slide.timer = timer;
    if (raw.showTimer === true) slide.showTimer = true;
  }
  return slide;
}

// A slide's own background: a colour, a picture (dimmed so text stays readable), or both.
function normalizeBackground(raw) {
  if (!isObject(raw)) return null;
  const color = isColor(raw.color) ? String(raw.color) : '';
  const image = str(raw.image, '', 3_000_000);
  if (!color && !image) return null;
  const bg = {};
  if (color) bg.color = color;
  if (image) {
    bg.image = image;
    bg.dim = Number.isFinite(Number(raw.dim)) ? clamp(Math.round(Number(raw.dim)), 0, 80) : 40;
  }
  return bg;
}

function normalizeBrand(raw) {
  const b = isObject(raw) ? raw : {};
  return {
    logo: str(b.logo, '', 3_000_000),
    position: oneOf(b.position, LOGO_POSITIONS, 'bottom-right'),
    size: oneOf(b.size, ['sm', 'md', 'lg'], 'md'),
  };
}

// Kiosk mode: advance every `seconds` (0 turns it off); `loop` restarts at the end.
function normalizeAutoplay(raw) {
  const a = isObject(raw) ? raw : {};
  const seconds = Number.isFinite(Number(a.seconds)) ? clamp(Math.round(Number(a.seconds)), 0, 3600) : 0;
  return { seconds, loop: a.loop !== false };
}

export function normalizeDeck(raw) {
  const warnings = [];
  const state = { warn: (m) => warnings.push(m), seen: new Set() };
  if (!isObject(raw)) throw new DeckError('Deck must be a JSON object');

  if (Number.isInteger(raw.version) && raw.version > DECK_VERSION) {
    warnings.push(`deck version ${raw.version} is newer than supported (${DECK_VERSION}); some content may be lost`);
  }

  const metaIn = isObject(raw.meta) ? raw.meta : {};
  const now = new Date().toISOString();
  const meta = {
    title: str(metaIn.title, 'Untitled deck', 200) || 'Untitled deck',
    author: str(metaIn.author, '', 200),
    createdAt: str(metaIn.createdAt, now, 40),
    updatedAt: str(metaIn.updatedAt, now, 40),
  };

  if (Array.isArray(raw.slides) && raw.slides.length > MAX_SLIDES) {
    warnings.push(`more than ${MAX_SLIDES} slides, extras dropped`);
  }
  const slides = [];
  (Array.isArray(raw.slides) ? raw.slides.slice(0, MAX_SLIDES) : []).forEach((s, i) => {
    const slide = normalizeSlide(s, i, state);
    if (slide) slides.push(slide);
  });
  if (!slides.length) {
    warnings.push('deck had no slides, added a title slide');
    slides.push(createSlide('title'));
  }

  const deck = {
    version: DECK_VERSION,
    meta,
    theme: normalizeThemeRef(raw.theme, (m) => warnings.push(m)),
    aspect: oneOf(raw.aspect, Object.keys(ASPECTS), '16:9'),
    transition: oneOf(raw.transition, TRANSITIONS, 'fade'),
    autoplay: normalizeAutoplay(raw.autoplay),
    brand: normalizeBrand(raw.brand),
    slides,
  };
  return { deck, warnings };
}

export function slideTitle(slide, index = 0) {
  const heading = slide.blocks.find((b) => b.type === 'heading' && b.props.text);
  return (heading && stripTags(heading.props.text)) || `Slide ${index + 1}`;
}

// Sorted distinct raw step numbers a slide reveals at. The navigator only
// cares how many there are; the player uses the values to decide what to show.
export function slideStepValues(slide) {
  const all = slide.blocks.flatMap(blockSteps);
  return [...new Set(all)].sort((a, b) => a - b);
}
