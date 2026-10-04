// The small toolbar that floats above the selected block. What it offers depends on the
// block: text blocks get size, alignment and colour; shapes and buttons a fill; every
// block gets duplicate, lock, layer order and delete. Settings come from the same
// field metadata as the inspector, so new block types appear here without extra code.

import { h } from '../core/dom.js';
import { getBlock } from '../core/blocks/index.js';
import { getLayout } from '../core/layouts.js';
import { STYLE_TOKENS, themeVars, tokenVar } from '../core/theme.js';
import * as ops from './ops.js';
import { button, segmented, colorPicker, openMenu } from './ui.js';

const QUICK_KEYS = ['level', 'size', 'align', 'fit'];
const TEXT_COLOR = new Set(['heading', 'text', 'list', 'quote', 'button', 'icon', 'code', 'timeline', 'compare']);
const FILL_COLOR = new Set(['shape', 'button', 'icon']);
const LABELS = { fg: 'Text', muted: 'Muted', accent: 'Accent', accentText: 'Accent text', good: 'Green', bad: 'Red', bg: 'Background', surface: 'Panel' };

export function themeSwatches(deck) {
  const vars = themeVars(deck.theme);
  return STYLE_TOKENS.map((token) => ({
    value: token,
    label: LABELS[token] ?? token,
    css: vars[`--sp-${token.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`] ?? tokenVar(token),
  }));
}

export class BlockToolbar {
  constructor(canvas, editor) {
    this.canvas = canvas;
    this.editor = editor;
    this.el = h('div', { class: 'ed-ftb', role: 'toolbar', 'aria-label': 'Block tools', hidden: true });
    // Keep the selection while a button is pressed.
    this.el.addEventListener('pointerdown', (e) => {
      if (!e.target.closest('input, select, textarea')) e.preventDefault();
    });
    canvas.host.append(this.el);
  }

  hide() {
    this.el.hidden = true;
  }

  // Rebuild and place; called whenever the selection, the deck or the zoom changes.
  update() {
    const ed = this.editor;
    const ids = ed.selectedIds;
    if (!ids.length || this.canvas.isEditing || this.canvas.gesturing) {
      this.hide();
      return;
    }
    const nodes = ids.length === 1 ? this.#single(ids[0]) : this.#multi(ids);
    if (!nodes.length) {
      this.hide();
      return;
    }
    this.el.replaceChildren(...nodes);
    this.el.hidden = false;
    this.#place();
  }

  #place() {
    const host = this.canvas.host.getBoundingClientRect();
    const anchor = this.canvas.stage.querySelector('.ed-selbox') ?? this.canvas.stage.querySelector('.ed-selected');
    if (!anchor) {
      this.hide();
      return;
    }
    const r = anchor.getBoundingClientRect();
    const w = this.el.offsetWidth;
    const hgt = this.el.offsetHeight;
    let top = r.top - host.top - hgt - 12;
    if (top < 56) top = r.bottom - host.top + 14; // no room above: go below
    top = Math.min(Math.max(8, top), host.height - hgt - 8);
    const left = Math.min(Math.max(8, r.left - host.left + r.width / 2 - w / 2), host.width - w - 8);
    this.el.style.left = `${left}px`;
    this.el.style.top = `${top}px`;
  }

  #sep() {
    return h('span', { class: 'ed-ftb__sep', role: 'separator' });
  }

  #single(id) {
    const ed = this.editor;
    const hit = ops.findBlock(ed.deck, id);
    if (!hit) return [];
    const { block } = hit;
    const def = getBlock(block.type);
    const free = getLayout(hit.slide.layout).free && hit.parent === null;
    const nodes = [];

    for (const f of (def?.fields ?? []).filter((x) => x.type === 'segmented' && QUICK_KEYS.includes(x.key)).slice(0, 2)) {
      nodes.push(segmented({
        options: f.options, value: block.props[f.key],
        onChange: (v) => ed.commit(ops.patchBlockProps(ed.deck, id, { [f.key]: v }), { coalesce: `ftb:${id}:${f.key}` }),
      }));
    }
    const swatches = themeSwatches(ed.deck);
    if (TEXT_COLOR.has(block.type)) {
      nodes.push(colorPicker({
        label: 'Text', value: block.style?.color ?? '', swatches,
        onPick: (v) => ed.commit(ops.setBlockStyle(ed.deck, [id], { color: v })),
      }));
    }
    if (FILL_COLOR.has(block.type)) {
      nodes.push(colorPicker({
        label: 'Fill', value: block.style?.fill ?? '', swatches,
        onPick: (v) => ed.commit(ops.setBlockStyle(ed.deck, [id], { fill: v })),
      }));
    }
    if (block.type === 'image') {
      nodes.push(button({ icon: 'image', label: 'Replace image', variant: 'ghost', onClick: () => ed.pickImage(id, 'src') }));
      if (ed.canCrop?.(id)) nodes.push(button({ label: 'Crop', variant: 'ghost', onClick: () => ed.startCrop(id) }));
    }
    if (nodes.length) nodes.push(this.#sep());
    nodes.push(...this.#common([id], free, block));
    return nodes;
  }

  #multi(ids) {
    const ed = this.editor;
    const nodes = [h('span', { class: 'ed-ftb__count', text: `${ids.length} selected` }), this.#sep()];
    const free = ed.isFree;
    if (free) {
      nodes.push(button({ icon: 'align-left', label: 'Align left', iconOnly: true, variant: 'ghost', onClick: () => ed.alignSelection('left') }));
      nodes.push(button({ icon: 'align-center', label: 'Align centres', iconOnly: true, variant: 'ghost', onClick: () => ed.alignSelection('center') }));
      nodes.push(button({ icon: 'align-top', label: 'Align top', iconOnly: true, variant: 'ghost', onClick: () => ed.alignSelection('top') }));
      nodes.push(button({ icon: 'align-middle', label: 'Align middles', iconOnly: true, variant: 'ghost', onClick: () => ed.alignSelection('middle') }));
      if (ed.groupSelection) nodes.push(button({ label: 'Group', variant: 'ghost', onClick: () => ed.groupSelection() }));
      nodes.push(this.#sep());
    }
    nodes.push(...this.#common(ids, free, null));
    return nodes;
  }

  #common(ids, free, block) {
    const ed = this.editor;
    const nodes = [];
    nodes.push(button({ icon: 'copy', label: 'Duplicate', iconOnly: true, variant: 'ghost', onClick: () => ed.duplicateSelection() }));
    if (free) {
      const locked = block ? !!block.locked : false;
      nodes.push(button({ icon: locked ? 'unlock' : 'lock', label: locked ? 'Unlock position' : 'Lock position', iconOnly: true, variant: 'ghost', onClick: () => ed.setLocked(!locked) }));
      nodes.push(button({
        icon: 'front', label: 'Layer order', iconOnly: true, variant: 'ghost',
        onClick: (e, el) => openMenu({
          anchor: el, label: 'Layer order',
          items: [{ label: 'Bring to front', value: 'front' }, { label: 'Bring forward', value: 'forward' }, { label: 'Send backward', value: 'backward' }, { label: 'Send to back', value: 'back' }],
          onPick: (v) => ed.arrangeSelection(v),
        }),
      }));
    }
    nodes.push(button({ icon: 'trash', label: 'Delete', iconOnly: true, variant: 'ghost', onClick: () => ed.deleteSelection() }));
    return nodes;
  }
}
