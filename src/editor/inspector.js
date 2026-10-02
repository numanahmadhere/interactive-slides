// Right-hand settings panel. Block settings are generated from each block
// type's `fields` metadata, so a new block type shows up here for free; images
// and columns get small custom panels.
//
// The panel is rebuilt when the selection or the model changes from elsewhere.
// Edits made here commit with source "inspector" and do not rebuild it, so a
// text field never loses focus while you type.

import { h } from '../core/dom.js';
import { getBlock } from '../core/blocks/index.js';
import { getLayout, listLayouts } from '../core/layouts.js';
import { listThemes } from '../core/theme.js';
import { ASPECTS, TRANSITIONS } from '../core/schema.js';
import { safeImageUrl } from '../core/sanitize.js';
import * as ops from './ops.js';
import { button, field, segmented, toggle, select, textInput, numberInput } from './ui.js';

const TRANSITION_LABELS = { fade: 'Fade', slide: 'Slide', zoom: 'Zoom', none: 'None' };
const TABS = [['block', 'Block'], ['slide', 'Slide'], ['deck', 'Deck']];

const section = (title, ...children) =>
  h('div', { class: 'ed-section' }, title ? h('h3', { class: 'ed-section__title', text: title }) : null, ...children);
const empty = (text) => h('p', { class: 'ed-empty', text });

export class Inspector {
  constructor(host, editor) {
    this.host = host;
    this.editor = editor;
    this.tab = 'slide';

    this.tabEls = new Map();
    const tabs = h('div', { class: 'ed-tabs', role: 'tablist', 'aria-label': 'Inspector' });
    for (const [id, label] of TABS) {
      const t = h('button', { class: 'ed-tab', type: 'button', role: 'tab', text: label, id: `ed-tab-${id}` });
      t.addEventListener('click', () => {
        this.tab = id;
        this.sync({ rebuild: true });
      });
      this.tabEls.set(id, t);
      tabs.append(t);
    }
    tabs.addEventListener('keydown', (e) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      const enabled = TABS.map(([id]) => id).filter((id) => !this.tabEls.get(id).disabled);
      const next = enabled[(enabled.indexOf(this.tab) + (e.key === 'ArrowRight' ? 1 : enabled.length - 1)) % enabled.length];
      e.preventDefault();
      this.tab = next;
      this.sync({ rebuild: true });
      this.tabEls.get(next).focus();
    });

    this.body = h('div', { class: 'ed-insp__body', role: 'tabpanel' });
    host.append(tabs, this.body);
  }

  sync({ rebuild = true, selectionChanged = false } = {}) {
    const { blockId } = this.editor.selection;
    if (selectionChanged) {
      if (blockId) this.tab = 'block';
      else if (this.tab === 'block') this.tab = 'slide';
    }
    if (!blockId && this.tab === 'block') this.tab = 'slide';

    for (const [id, el] of this.tabEls) {
      el.disabled = id === 'block' && !blockId;
      el.setAttribute('aria-selected', String(id === this.tab));
      el.tabIndex = id === this.tab ? 0 : -1;
    }
    this.body.setAttribute('aria-labelledby', `ed-tab-${this.tab}`);
    if (rebuild) this.#build();
  }

  #build() {
    const scroll = this.body.scrollTop;
    const nodes = this.tab === 'block' ? this.#blockTab() : this.tab === 'slide' ? this.#slideTab() : this.#deckTab();
    this.body.replaceChildren(...nodes);
    this.body.scrollTop = scroll;
  }

  // Commit that keeps this panel as it is (the control already shows the value).
  #live(next, key) {
    this.editor.commit(next, { source: 'inspector', coalesce: key });
  }

  // Commit that changes what the panel should show, so it is rebuilt.
  #rebuilding(next) {
    this.editor.commit(next, { source: 'inspector' });
    this.#build();
  }

  // ---- block tab ---------------------------------------------------------

  #blockTab() {
    const { deck, selection } = this.editor;
    const hit = ops.findBlock(deck, selection.blockId);
    if (!hit) return [empty('Select a block on the slide to change its settings.')];
    const { block } = hit;
    const def = getBlock(block.type);
    const id = block.id;

    const canUp = ops.moveBlock(deck, id, -1) !== deck;
    const canDown = ops.moveBlock(deck, id, 1) !== deck;
    const actions = h('div', { class: 'ed-actions' },
      button({ icon: 'up', label: 'Move up', iconOnly: true, disabled: !canUp, onClick: () => this.editor.moveBlock(id, -1) }),
      button({ icon: 'down', label: 'Move down', iconOnly: true, disabled: !canDown, onClick: () => this.editor.moveBlock(id, 1) }),
      button({ icon: 'copy', label: 'Duplicate block', iconOnly: true, onClick: () => this.editor.duplicateBlock(id) }),
      button({ icon: 'trash', label: 'Delete block', iconOnly: true, variant: 'danger', onClick: () => this.editor.deleteBlock(id) }),
    );

    const settings = section(def?.label ?? block.type, actions);
    if (def?.edit?.length) {
      settings.append(h('p', { class: 'ed-hint', text: 'Click the text on the slide to edit it. Press Enter to start typing.' }));
    }
    for (const f of def?.fields ?? []) settings.append(this.#fieldControl(block, f));

    const placement = section('Placement');
    placement.append(field(
      'Appears at step',
      numberInput({ value: block.reveal || 0, onInput: (n) => this.#live(ops.setBlockReveal(this.editor.deck, id, n), `insp:${id}:reveal`) }),
      '0 shows it with the slide. 1 reveals it on the first click, 2 on the second, and so on.',
    ));
    if (hit.parent === null) {
      const layout = getLayout(hit.slide.layout);
      if (layout.slots.length > 1) {
        placement.append(field('Slot', select({
          options: layout.slots.map((s) => ({ value: s.id, label: s.label })),
          value: block.slot,
          onChange: (slot) => this.#rebuilding(ops.moveBlockToSlot(this.editor.deck, id, slot)),
        })));
      }
    }
    placement.append(button({
      icon: 'plus', label: 'Add block below', variant: 'wide',
      onClick: (e, el) => this.editor.openBlockMenu(el, { afterBlockId: id }),
    }));
    return [settings, placement];
  }

  #fieldControl(block, f) {
    const id = block.id;
    const key = `insp:${id}:${f.key}`;
    const set = (value) => this.#live(ops.patchBlockProps(this.editor.deck, id, { [f.key]: value }), key);
    const value = block.props[f.key];

    switch (f.type) {
      case 'segmented': return field(f.label, segmented({ options: f.options, value, onChange: set }));
      case 'select': return field(f.label, select({ options: f.options, value, onChange: set }));
      case 'toggle': return toggle({ label: f.label, value, onChange: set });
      case 'text': return field(f.label, textInput({ value, placeholder: f.placeholder, onInput: set }));
      case 'image': return field(f.label, this.#imageControl(block));
      case 'columns': return this.#columnsControl(block);
      default: return h('div');
    }
  }

  #imageControl(block) {
    const id = block.id;
    const src = block.props.src;
    const url = safeImageUrl(this.editor.assets.resolve(src));
    const preview = h('div', { class: 'ed-image-preview' });
    if (url) preview.append(h('img', { src: url, alt: '', style: 'max-width:100%;max-height:100%;object-fit:contain' }));
    else preview.textContent = 'No image';

    const actions = h('div', { class: 'ed-image-actions' },
      button({ icon: 'upload', label: url ? 'Replace' : 'Upload image', onClick: () => this.editor.pickImage(id) }),
      src ? button({ icon: 'trash', label: 'Remove', onClick: () => this.#rebuilding(ops.patchBlockProps(this.editor.deck, id, { src: '' })) }) : null,
    );
    const link = textInput({
      value: src.startsWith('asset:') ? '' : src,
      placeholder: 'Or paste an image link',
      spellcheck: false,
      onInput: (v) => this.#live(ops.patchBlockProps(this.editor.deck, id, { src: v.trim() }), `insp:${id}:src`),
    });
    return h('div', null, preview, actions, link);
  }

  #columnsControl(block) {
    const id = block.id;
    const cols = block.props.cols;
    const wrap = h('div');
    cols.forEach((col, i) => {
      const addBtn = button({
        icon: 'plus', label: 'Add block', variant: 'wide',
        onClick: (e, el) => this.editor.openBlockMenu(el, { columnOf: id, col: i }, { exclude: ['columns'] }),
      });
      wrap.append(h('div', { class: 'ed-col-card' },
        h('div', { class: 'ed-col-card__head' },
          h('span', { text: `Column ${i + 1}` }),
          button({
            icon: 'trash', label: `Remove column ${i + 1}`, iconOnly: true, variant: 'ghost',
            disabled: cols.length <= ops.MIN_COLUMNS,
            onClick: () => this.#rebuilding(ops.removeColumn(this.editor.deck, id, i)),
          })),
        h('p', { class: 'ed-hint', text: col.blocks.length === 1 ? '1 block' : `${col.blocks.length} blocks` }),
        addBtn));
    });
    wrap.append(button({
      icon: 'plus', label: 'Add column', variant: 'wide', disabled: cols.length >= ops.MAX_COLUMNS,
      onClick: () => this.#rebuilding(ops.addColumn(this.editor.deck, id)),
    }));
    return wrap;
  }

  // ---- slide tab ---------------------------------------------------------

  #slideTab() {
    const { deck, slide, slideIndex, selection } = this.editor;
    const layout = getLayout(slide.layout);
    const id = slide.id;

    const actions = h('div', { class: 'ed-actions' },
      button({ icon: 'up', label: 'Move slide up', iconOnly: true, disabled: slideIndex === 0, onClick: () => this.editor.moveSlide(slideIndex, slideIndex - 1) }),
      button({ icon: 'down', label: 'Move slide down', iconOnly: true, disabled: slideIndex === deck.slides.length - 1, onClick: () => this.editor.moveSlide(slideIndex, slideIndex + 1) }),
      button({ icon: 'copy', label: 'Duplicate slide', iconOnly: true, onClick: () => this.editor.duplicateSlide(id) }),
      button({ icon: 'trash', label: 'Delete slide', iconOnly: true, variant: 'danger', disabled: deck.slides.length <= 1, onClick: () => this.editor.deleteSlide(id) }),
    );

    const setup = section(`Slide ${slideIndex + 1}`, actions);
    setup.append(
      field('Layout', select({
        options: listLayouts().map((l) => ({ value: l.id, label: l.name })),
        value: slide.layout,
        onChange: (value) => this.#rebuilding(ops.setSlideLayout(this.editor.deck, id, value)),
      })),
      field('Transition', select({
        options: [{ value: '', label: `Deck default (${TRANSITION_LABELS[deck.transition]})` }, ...TRANSITIONS.map((t) => ({ value: t, label: TRANSITION_LABELS[t] }))],
        value: slide.transition ?? '',
        onChange: (value) => this.#live(ops.patchSlide(this.editor.deck, id, { transition: value }), `insp:${id}:transition`),
      })),
      field('Speaker notes', textInput({
        value: slide.notes,
        multiline: true,
        rows: 5,
        placeholder: 'Notes only you see while presenting',
        onInput: (value) => this.#live(ops.patchSlide(this.editor.deck, id, { notes: value }), `insp:${id}:notes`),
      })),
    );

    const content = section('Add content');
    for (const slot of layout.slots) {
      const count = slide.blocks.filter((b) => b.slot === slot.id).length;
      const row = h('div', { class: 'ed-row' },
        h('span', { class: 'ed-row__label', text: `${slot.label}${count ? ` (${count})` : ''}`, style: selection.slotId === slot.id ? 'font-weight:600' : '' }),
        button({ icon: 'plus', label: `Add to ${slot.label}`, iconOnly: true, onClick: (e, el) => this.editor.openBlockMenu(el, { slot: slot.id }) }));
      content.append(row);
    }
    return [setup, content];
  }

  // ---- deck tab ----------------------------------------------------------

  #deckTab() {
    const { deck } = this.editor;
    const themes = h('div', { class: 'ed-themes' });
    for (const t of listThemes()) {
      const b = h('button', { class: 'ed-theme', type: 'button', 'aria-pressed': String(deck.theme.id === t.id) },
        h('span', { class: 'ed-theme__swatch' },
          ...[t.tokens.bg, t.tokens.accent, t.tokens.fg].map((c) => h('span', { style: `background:${c}` }))),
        h('span', { text: t.name }));
      b.addEventListener('click', () => this.#rebuilding(ops.setTheme(this.editor.deck, t.id)));
      themes.append(b);
    }

    return [
      section('Theme', themes),
      section('Format',
        field('Aspect ratio', segmented({
          options: Object.keys(ASPECTS).map((a) => ({ value: a, label: a })),
          value: deck.aspect,
          onChange: (a) => this.#live(ops.setAspect(this.editor.deck, a), 'deck:aspect'),
        })),
        field('Default transition', select({
          options: TRANSITIONS.map((t) => ({ value: t, label: TRANSITION_LABELS[t] })),
          value: deck.transition,
          onChange: (t) => this.#rebuilding(ops.setDeckTransition(this.editor.deck, t)),
        })),
        h('p', { class: 'ed-hint', text: `${deck.slides.length} ${deck.slides.length === 1 ? 'slide' : 'slides'}` }),
      ),
    ];
  }
}
