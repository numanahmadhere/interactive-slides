// Getting content onto a slide quickly: a searchable Insert panel whose cards show the
// real block as it will look, a "/" command palette, and a picture-based layout
// chooser for new slides. Cards can be clicked or dragged onto the canvas.

import { h } from '../core/dom.js';
import { listBlocks, createBlock } from '../core/blocks/index.js';
import { listLayouts } from '../core/layouts.js';
import { renderSlide } from '../core/render.js';
import { applyTheme } from '../core/theme.js';
import { createSlide, ASPECTS } from '../core/schema.js';
import { defaultFrame } from './ops.js';
import { openPopover } from './ui.js';
import { TEMPLATES } from '../library/templates.js';

export const INSERT_MIME = 'application/x-densight-insert';

// Words people search by that are not in the label.
const SYNONYMS = {
  heading: 'title headline header',
  text: 'paragraph body write words',
  list: 'bullets points numbered',
  image: 'photo picture upload logo',
  code: 'snippet programming',
  quote: 'testimonial citation',
  divider: 'line rule separator',
  columns: 'side by side layout grid',
  embed: 'video youtube website iframe',
  button: 'link call to action navigate',
  quiz: 'question test multiple choice answer score',
  'quiz-results': 'leaderboard score results',
  poll: 'vote survey live audience question',
  tabs: 'switch sections',
  accordion: 'faq expand collapse',
  hotspots: 'annotate image markers',
  'flip-cards': 'flashcards cards flip',
  'reveal-answer': 'answer hidden click to show',
  compare: 'before after slider',
  matching: 'match pairs drag',
  ordering: 'sort sequence rank',
  timeline: 'steps history process',
  'fill-blank': 'cloze gap sentence',
  reflection: 'open question think',
  chart: 'graph bar line pie data',
  calculator: 'formula number input',
  'code-sandbox': 'run code playground',
  shape: 'rectangle circle box arrow line',
  icon: 'symbol glyph',
  diagram: 'flow chart boxes arrows process',
};

export const QUICK_TYPES = ['text', 'image', 'shape', 'quiz', 'poll'];

export const insertable = () => listBlocks().filter((d) => !d.internal);

export function searchBlocks(query, defs = insertable()) {
  const words = String(query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return defs;
  const scored = [];
  for (const def of defs) {
    const label = def.label.toLowerCase();
    const hay = `${label} ${def.group ?? ''} ${def.type} ${SYNONYMS[def.type] ?? ''}`.toLowerCase();
    if (!words.every((w) => hay.includes(w))) continue;
    // Label matches first, then prefix matches.
    const score = (label.startsWith(words[0]) ? 0 : label.includes(words[0]) ? 1 : 2);
    scored.push([score, def]);
  }
  return scored.sort((a, b) => a[0] - b[0]).map(([, d]) => d);
}

// ---- previews --------------------------------------------------------------------

// A real rendering of a one-block slide, scaled into `width` px.
// `region` is how many slide pixels wide the card shows (the whole slide when omitted).
export function stageThumb(editor, slide, width, region, deckOverride) {
  const deck = deckOverride ?? editor.deck;
  const { width: w, height: hgt } = ASPECTS[deck.aspect];
  const shown = region ?? w;
  const box = h('div', { class: 'ed-pv', 'aria-hidden': 'true', inert: true });
  box.style.aspectRatio = `${w} / ${hgt}`;
  const stage = h('div', { class: 'ed-pv__stage' });
  stage.style.cssText = `width:${w}px;height:${hgt}px;transform:scale(${width / shown});`;
  applyTheme(stage, deck.theme);
  stage.append(renderSlide(deck, slide, { mode: 'thumb', resolveAsset: editor.assets.resolve }));
  box.append(stage);
  return box;
}

function blockPreview(editor, type, width) {
  const slide = { id: 'pv', layout: 'free', blocks: [], notes: '' };
  try {
    const block = createBlock(type);
    const frame = defaultFrame(type, slide);
    // Zoomed in on the top-left of the slide, so the block fills the card.
    const w = Math.min(frame.w, 860);
    slide.blocks = [{ ...block, slot: 'free', frame: { x: 48, y: type === 'divider' ? 240 : 48, w, ...(frame.h ? { h: Math.min(frame.h, 440) } : {}) } }];
  } catch {
    return h('div', { class: 'ed-pv' });
  }
  return stageThumb(editor, slide, width, 960);
}

function layoutPreview(editor, layoutId, width) {
  const slide = createSlide(layoutId);
  return stageThumb(editor, slide, width);
}

// ---- the Insert panel ----------------------------------------------------------------

export function openInsertPanel(editor, anchor) {
  const search = h('input', { class: 'ed-input ed-pop__search', type: 'search', placeholder: 'Search blocks: quiz, chart, photo...', 'aria-label': 'Search blocks', autocomplete: 'off' });
  const results = h('div', { class: 'ed-insert__results' });
  const empty = h('p', { class: 'ed-empty', text: 'Nothing matches that. Try "text", "image" or "quiz".', hidden: true });

  const add = (type, at) => {
    handle.close();
    editor.addBlockQuick(type, at);
  };

  const render = () => {
    const found = searchBlocks(search.value);
    results.replaceChildren();
    empty.hidden = found.length > 0;
    let group = null;
    let grid = null;
    for (const def of found) {
      if (def.group !== group || !grid) {
        group = def.group;
        if (!search.value.trim()) results.append(h('h3', { class: 'ed-insert__group', text: group }));
        grid = h('div', { class: 'ed-insert__grid' });
        results.append(grid);
      }
      const card = h('button', { type: 'button', class: 'ed-card', draggable: 'true', title: `Add ${def.label}`, 'data-type': def.type },
        blockPreview(editor, def.type, 168),
        h('span', { class: 'ed-card__label', text: def.label }));
      card.addEventListener('click', () => add(def.type));
      card.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData(INSERT_MIME, def.type);
        e.dataTransfer.setData('text/plain', def.label);
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setDragImage(card.firstElementChild, 40, 24);
        requestAnimationFrame(() => handle.el.classList.add('is-dragging'));
      });
      card.addEventListener('dragend', () => handle.close());
      grid.append(card);
    }
  };
  search.addEventListener('input', render);
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const first = results.querySelector('.ed-card');
      if (first) {
        e.preventDefault();
        add(first.dataset.type);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      results.querySelector('.ed-card')?.focus();
    }
  });
  results.addEventListener('keydown', (e) => {
    const cards = [...results.querySelectorAll('.ed-card')];
    const i = cards.indexOf(document.activeElement);
    if (i < 0) return;
    const delta = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 2, ArrowUp: -2 }[e.key];
    if (!delta) return;
    e.preventDefault();
    const next = cards[i + delta];
    if (next) next.focus();
    else if (i + delta < 0) search.focus();
  });

  const content = h('div', { class: 'ed-insert' },
    h('div', { class: 'ed-pop__head' }, h('h2', { class: 'ed-pop__title', text: 'Add to slide' }), search),
    h('div', { class: 'ed-insert__scroll' }, results, empty),
    h('p', { class: 'ed-pop__foot', text: 'Click to add, or drag a card onto the slide.' }));
  const handle = openPopover({ anchor, content, label: 'Add to slide', className: 'ed-pop--insert', focus: search });
  render();
  handle.place();
  return handle;
}

// ---- "/" command palette ----------------------------------------------------------------

export function openPalette(editor, anchor) {
  const input = h('input', { class: 'ed-input ed-pop__search', type: 'text', role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'ed-palette-list', 'aria-label': 'Add a block', placeholder: 'Add a block: type text, quiz, chart...', autocomplete: 'off' });
  const list = h('div', { class: 'ed-palette__list', role: 'listbox', id: 'ed-palette-list' });
  let active = 0;
  let items = [];
  const paint = () => {
    list.replaceChildren();
    items = searchBlocks(input.value).slice(0, 8);
    active = Math.min(active, Math.max(0, items.length - 1));
    items.forEach((def, i) => {
      const row = h('div', { class: 'ed-palette__row', role: 'option', id: `ed-pal-${i}`, 'aria-selected': String(i === active) },
        h('span', { class: 'ed-palette__name', text: def.label }),
        h('span', { class: 'ed-palette__group', text: def.group }));
      row.addEventListener('pointerdown', (e) => { e.preventDefault(); pick(def.type); });
      list.append(row);
    });
    if (!items.length) list.append(h('p', { class: 'ed-empty', text: 'No matching block.' }));
    input.setAttribute('aria-activedescendant', items.length ? `ed-pal-${active}` : '');
  };
  const pick = (type) => {
    handle.close();
    editor.addBlockQuick(type);
  };
  input.addEventListener('input', () => { active = 0; paint(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); active = (active + 1) % Math.max(1, items.length); paint(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = (active + items.length - 1) % Math.max(1, items.length); paint(); }
    else if (e.key === 'Enter' && items[active]) { e.preventDefault(); pick(items[active].type); }
  });
  const handle = openPopover({
    anchor, label: 'Add a block', className: 'ed-pop--palette',
    content: h('div', { class: 'ed-palette' }, input, list),
    focus: input,
  });
  paint();
  handle.place();
  return handle;
}

// ---- new-slide layout chooser ------------------------------------------------------------

export function openLayoutPicker(editor, anchor, onPick) {
  const grid = h('div', { class: 'ed-layouts' });
  const card = (key, label, preview, title) => {
    const el = h('button', { type: 'button', class: 'ed-card', title }, preview, h('span', { class: 'ed-card__label', text: label }));
    el.addEventListener('click', () => {
      handle.close();
      onPick(key);
    });
    return el;
  };
  let group = null;
  for (const t of TEMPLATES) {
    if (t.group !== group) {
      group = t.group;
      grid.append(h('h3', { class: 'ed-insert__group ed-layouts__heading', text: group === 'Basics' ? 'Templates' : group }));
    }
    grid.append(card(`t:${t.id}`, t.name, stageThumb(editor, t.make(), 148), t.name));
  }
  grid.append(h('h3', { class: 'ed-insert__group ed-layouts__heading', text: 'Fixed layouts' }));
  for (const layout of listLayouts()) {
    if (layout.free) continue;
    grid.append(card(layout.id, layout.name, layoutPreview(editor, layout.id, 148), layout.name));
  }
  const content = h('div', { class: 'ed-insert' },
    h('div', { class: 'ed-pop__head' }, h('h2', { class: 'ed-pop__title', text: 'New slide' })),
    h('div', { class: 'ed-insert__scroll' }, grid),
    h('p', { class: 'ed-pop__foot', text: 'Templates are free-form: everything on them can be moved, restyled or deleted.' }));
  const handle = openPopover({ anchor, content, label: 'New slide', className: 'ed-pop--layouts', focus: grid.querySelector('.ed-card') });
  handle.place();
  return handle;
}
