// Right-hand settings panel. Block settings are generated from each block
// type's `fields` metadata, so a new block type shows up here for free; images
// and columns get small custom panels.
//
// The panel is rebuilt when the selection or the model changes from elsewhere.
// Edits made here commit with source "inspector" and do not rebuild it, so a
// text field never loses focus while you type.

import { h } from '../core/dom.js';
import { getBlock, listBlocks } from '../core/blocks/index.js';
import { getLayout, listLayouts } from '../core/layouts.js';
import { listThemes, THEMES, buildThemeTokens } from '../core/theme.js';
import { ICONS, ICON_NAMES } from '../core/icon-set.js';
import { svgIcon } from '../core/dom.js';
import { ASPECTS, TRANSITIONS, slideTitle } from '../core/schema.js';
import { safeImageUrl } from '../core/sanitize.js';
import * as ops from './ops.js';
import { button, field, segmented, toggle, select, textInput, numberInput, listEditor, colorInput } from './ui.js';

const TRANSITION_LABELS = { fade: 'Fade', slide: 'Slide', zoom: 'Zoom', none: 'None' };
const TABS = [['block', 'Block'], ['slide', 'Slide'], ['deck', 'Deck']];

const section = (title, ...children) =>
  h('div', { class: 'ed-section' }, title ? h('h2', { class: 'ed-section__title', text: title }) : null, ...children.filter(Boolean));
const empty = (text) => h('p', { class: 'ed-empty', text });

export class Inspector {
  constructor(host, editor) {
    this.host = host;
    this.editor = editor;
    this.tab = 'slide';
    this.bgMode = new Map(); // slide id -> 'theme' | 'color' | 'image' while choosing

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
    const blockId = this.editor.selectedIds.length > 0;
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
    if (this.editor.selectedIds.length > 1) return [this.#multiPanel()];
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
    const problem = def?.check?.(block.props, deck);
    if (problem) settings.append(h('p', { class: 'ed-hint ed-hint--warn', role: 'alert', text: problem }));
    if (def?.edit?.length) {
      settings.append(h('p', { class: 'ed-hint', text: 'Click the text on the slide to edit it. Press Enter to start typing.' }));
    }
    for (const f of def?.fields ?? []) {
      if (f.when && !f.when.in.includes(block.props[f.when.key])) continue;
      settings.append(this.#fieldControl(block, f, def));
    }

    const placement = section('Placement');
    if (hit.parent === null && getLayout(hit.slide.layout).free) placement.append(...this.#framePanel(block));
    const parentSpec = hit.parent && getBlock(hit.parent.block.type)?.container;
    if (!hit.parent || parentSpec?.revealChildren) {
      placement.append(field(
        'Appears at step',
        numberInput({ value: block.reveal || 0, onInput: (n) => this.#live(ops.setBlockReveal(this.editor.deck, id, n), `insp:${id}:reveal`) }),
        '0 shows it with the slide. 1 reveals it on the first click, 2 on the second, and so on.',
      ));
    }
    if (hit.parent === null) {
      const layout = getLayout(hit.slide.layout);
      if (layout.slots.length > 1 && !layout.free) {
        placement.append(field('Slot', select({
          options: layout.slots.map((s) => ({ value: s.id, label: s.label })),
          value: block.slot,
          onChange: (slot) => this.#rebuilding(ops.moveBlockToSlot(this.editor.deck, id, slot)),
        })));
      }
    }
    placement.append(button({
      icon: 'plus', label: 'Add block below', variant: 'wide',
      onClick: (e, el) => this.editor.openBlockMenu(el, { afterBlockId: id }, { exclude: this.editor.excludedInside(hit.parent?.block) }),
    }));
    return [settings, placement];
  }

  // Position and size as numbers, layer order, lock and hide: the precise side of dragging.
  #framePanel(block) {
    const ed = this.editor;
    const id = block.id;
    const f = block.frame;
    const box = ed.canvas.free.boxOf(block);
    const num = (label, key, value, min, max) => field(label, numberInput({
      value: Math.round(value), min, max,
      onInput: (n) => ed.setFrameField(id, { [key]: n }),
    }));
    const row = h('div', { class: 'ed-grid2' },
      num('X', 'x', f.x, -6000, 6000), num('Y', 'y', f.y, -6000, 6000),
      num('Width', 'w', f.w, 8, 6000), f.h ? num('Height', 'h', box.h, 8, 6000) : null);
    const layers = h('div', { class: 'ed-actions' },
      button({ icon: 'front', label: 'Bring to front', iconOnly: true, onClick: () => ed.arrangeSelection('front') }),
      button({ icon: 'up', label: 'Bring forward', iconOnly: true, onClick: () => ed.arrangeSelection('forward') }),
      button({ icon: 'down', label: 'Send backward', iconOnly: true, onClick: () => ed.arrangeSelection('backward') }),
      button({ icon: 'back', label: 'Send to back', iconOnly: true, onClick: () => ed.arrangeSelection('back') }),
      button({ icon: block.locked ? 'unlock' : 'lock', label: block.locked ? 'Unlock' : 'Lock position', iconOnly: true, onClick: () => ed.setLocked(!block.locked) }),
      button({ icon: block.hidden ? 'eye' : 'eye-off', label: block.hidden ? 'Show block' : 'Hide block', iconOnly: true, onClick: () => ed.setHidden(!block.hidden) }),
    );
    return [row, field('Order and lock', layers)];
  }

  // Several blocks selected: line them up, spread them out, make them the same size.
  #multiPanel() {
    const ed = this.editor;
    const n = ed.selectedIds.length;
    const row = (...buttons) => h('div', { class: 'ed-actions' }, ...buttons);
    const a = (mode, iconName, label) => button({ icon: iconName, label, iconOnly: true, onClick: () => ed.alignSelection(mode) });
    return section(`${n} blocks selected`,
      field('Align', row(
        a('left', 'align-left', 'Align left'), a('center', 'align-center', 'Align centres'), a('right', 'align-right', 'Align right'),
        a('top', 'align-top', 'Align top'), a('middle', 'align-middle', 'Align middles'), a('bottom', 'align-bottom', 'Align bottom'))),
      field('Spread', row(
        button({ icon: 'dist-h', label: 'Space evenly across', iconOnly: true, disabled: n < 3, onClick: () => ed.distributeSelection('x') }),
        button({ icon: 'dist-v', label: 'Space evenly down', iconOnly: true, disabled: n < 3, onClick: () => ed.distributeSelection('y') }))),
      field('Match size', row(
        button({ label: 'Width', variant: 'sm', onClick: () => ed.matchSelection('w') }),
        button({ label: 'Height', variant: 'sm', onClick: () => ed.matchSelection('h') }),
        button({ label: 'Both', variant: 'sm', onClick: () => ed.matchSelection('both') }))),
      field('Order and lock', row(
        button({ icon: 'front', label: 'Bring to front', iconOnly: true, onClick: () => ed.arrangeSelection('front') }),
        button({ icon: 'back', label: 'Send to back', iconOnly: true, onClick: () => ed.arrangeSelection('back') }),
        button({ icon: 'lock', label: 'Lock position', iconOnly: true, onClick: () => ed.setLocked(true) }),
        button({ icon: 'copy', label: 'Duplicate', iconOnly: true, onClick: () => ed.duplicateSelection() }),
        button({ icon: 'trash', label: 'Delete', iconOnly: true, variant: 'danger', onClick: () => ed.deleteSelection() }))),
      h('p', { class: 'ed-hint', text: 'Arrow keys nudge the selection. Hold Shift to move further.' }));
  }

  #fieldControl(block, f, def) {
    const id = block.id;
    const key = `insp:${id}:${f.key ?? f.type}`;
    // Fields that other fields depend on (button action -> slide picker) rebuild the panel.
    const dependent = (def?.fields ?? []).some((x) => x.when);
    const patch = (value) => ops.patchBlockProps(this.editor.deck, id, { [f.key]: value });
    const typing = (value) => this.#live(patch(value), key);
    const choice = (value) => (dependent ? this.#rebuilding(patch(value)) : this.#live(patch(value), key));
    const value = block.props[f.key];

    switch (f.type) {
      case 'segmented': return field(f.label, segmented({ options: f.options, value, onChange: choice }));
      case 'select': return field(f.label, select({ options: f.options, value, onChange: choice }));
      case 'toggle': return toggle({ label: f.label, value, onChange: choice });
      case 'text': return field(f.label, textInput({ value, placeholder: f.placeholder, onInput: typing }));
      case 'textarea': {
        const input = textInput({ value, multiline: true, rows: f.rows ?? 3, placeholder: f.placeholder, onInput: typing, spellcheck: !f.mono });
        if (f.mono) input.classList.add('ed-input--mono');
        return field(f.label, input);
      }
      case 'number': return field(f.label, numberInput({ value, min: f.min, max: f.max, onInput: typing }));
      case 'slide': return field(f.label, this.#slidePicker(value, choice));
      case 'hint': return h('p', { class: 'ed-hint', text: f.text });
      case 'icon': {
        const grid = h('div', { class: 'ed-icons', role: 'radiogroup', 'aria-label': f.label });
        const buttons = ICON_NAMES.map((name) => {
          const b = h('button', { type: 'button', class: 'ed-icons__btn', role: 'radio', title: name, 'aria-label': name, 'aria-checked': String(name === value) }, svgIcon(ICONS[name], { size: 22 }));
          b.addEventListener('click', () => {
            for (const other of buttons) other.setAttribute('aria-checked', String(other === b));
            typing(name);
          });
          return b;
        });
        grid.append(...buttons);
        return field(f.label, grid);
      }
      case 'action':
        return button({
          label: f.label, variant: 'wide',
          onClick: () => this.#rebuilding(ops.patchBlockProps(this.editor.deck, id, f.run(block.props))),
        });
      case 'list':
        return field(f.label, listEditor({
          items: value, fields: f.fields, itemLabel: f.itemLabel, addLabel: f.add, min: f.min, max: f.max, makeItem: f.item,
          onText: (items) => this.#live(patch(items), key),
          onStructure: (items) => this.#rebuilding(patch(items)),
        }));
      case 'strings': // a list of plain strings, edited one per card
        return field(f.label, listEditor({
          items: value.map((t) => ({ t })), fields: [{ key: 't', label: f.itemLabel, type: 'text' }], itemLabel: f.itemLabel, addLabel: f.add,
          min: f.min, max: f.max, makeItem: () => ({ t: f.item() }),
          onText: (items) => this.#live(patch(items.map((i) => i.t)), key),
          onStructure: (items) => this.#rebuilding(patch(items.map((i) => i.t))),
        }));
      case 'image': return field(f.label, this.#imageControl(block, f.key));
      case 'sections': return this.#sectionsControl(block, f);
      default: return h('div');
    }
  }

  #slidePicker(value, onChange) {
    const { slides } = this.editor.deck;
    const options = [{ value: '', label: 'Choose a slide...' }, ...slides.map((s, i) => ({ value: s.id, label: `${i + 1}. ${slideTitle(s, i)}` }))];
    if (value && !slides.some((s) => s.id === value)) options.push({ value, label: '(deleted slide)' });
    return select({ options, value, onChange });
  }

  #imageControl(block, key) {
    const id = block.id;
    const src = block.props[key] ?? '';
    const url = safeImageUrl(this.editor.assets.resolve(src));
    const preview = h('div', { class: 'ed-image-preview' });
    if (url) preview.append(h('img', { src: url, alt: '', style: 'max-width:100%;max-height:100%;object-fit:contain' }));
    else preview.textContent = 'No image';

    const actions = h('div', { class: 'ed-image-actions' },
      button({ icon: 'upload', label: url ? 'Replace' : 'Upload image', onClick: () => this.editor.pickImage(id, key) }),
      src ? button({ icon: 'trash', label: 'Remove', onClick: () => this.#rebuilding(ops.patchBlockProps(this.editor.deck, id, { [key]: '' })) }) : null,
    );
    const link = textInput({
      value: src.startsWith('asset:') || src.startsWith('data:') ? '' : src,
      placeholder: src.startsWith('data:') ? 'Embedded image. Paste a link to replace it' : 'Or paste an image link',
      spellcheck: false,
      onInput: (v) => this.#live(ops.patchBlockProps(this.editor.deck, id, { [key]: v.trim() }), `insp:${id}:${key}`),
    });
    return h('div', null, preview, actions, link);
  }

  // Columns, tabs and accordion items: cards with an optional title, the
  // blocks each holds, and an "add block" menu per section.
  #sectionsControl(block, f) {
    const id = block.id;
    const spec = getBlock(block.type).container;
    const sections = block.props[spec.key];
    const noun = f.noun ?? 'Section';
    const exclude = this.editor.excludedInside(block);
    const wrap = h('div');

    sections.forEach((sec, i) => {
      const tools = h('div', { class: 'ed-list__tools' });
      if (spec.titled) {
        tools.append(
          button({ icon: 'up', label: `Move ${noun.toLowerCase()} up`, iconOnly: true, variant: 'ghost', disabled: i === 0, onClick: () => this.#rebuilding(ops.moveSection(this.editor.deck, id, i, -1)) }),
          button({ icon: 'down', label: `Move ${noun.toLowerCase()} down`, iconOnly: true, variant: 'ghost', disabled: i === sections.length - 1, onClick: () => this.#rebuilding(ops.moveSection(this.editor.deck, id, i, 1)) }),
        );
      }
      tools.append(button({
        icon: 'trash', label: `Remove ${noun.toLowerCase()} ${i + 1}`, iconOnly: true, variant: 'ghost',
        disabled: sections.length <= spec.min,
        onClick: () => this.#rebuilding(ops.removeSection(this.editor.deck, id, i)),
      }));

      const card = h('div', { class: 'ed-col-card' },
        h('div', { class: 'ed-col-card__head' }, h('span', { text: `${noun} ${i + 1}` }), tools));
      if (spec.titled) {
        card.append(field(f.titleLabel ?? 'Title', textInput({
          value: sec.title,
          onInput: (v) => this.#live(ops.patchSection(this.editor.deck, id, i, { title: v }), `insp:${id}:title${i}`),
        })));
      }
      card.append(
        h('p', { class: 'ed-hint', text: sec.blocks.length === 1 ? '1 block' : `${sec.blocks.length} blocks` }),
        button({
          icon: 'plus', label: 'Add block', variant: 'wide',
          onClick: (e, el) => this.editor.openBlockMenu(el, { containerOf: id, index: i }, { exclude }),
        }));
      wrap.append(card);
    });

    wrap.append(button({
      icon: 'plus', label: `Add ${noun.toLowerCase()}`, variant: 'wide', disabled: sections.length >= spec.max,
      onClick: () => this.#rebuilding(ops.addSection(this.editor.deck, id)),
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
        onChange: (value) => {
          if (value === 'free') this.editor.convertSlideToFree();
          else this.#rebuilding(ops.setSlideLayout(this.editor.deck, id, value));
        },
      }), layout.free ? 'Drag blocks anywhere. Choosing another layout snaps them into its columns.' : 'Fixed layouts keep blocks in columns. Choose Free-form to place them anywhere.'),
      field('Transition', select({
        options: [{ value: '', label: `Deck default (${TRANSITION_LABELS[deck.transition]})` }, ...TRANSITIONS.map((t) => ({ value: t, label: TRANSITION_LABELS[t] }))],
        value: slide.transition ?? '',
        onChange: (value) => this.#live(ops.patchSlide(this.editor.deck, id, { transition: value }), `insp:${id}:transition`),
      })),
      field('Countdown timer (seconds)', numberInput({
        value: slide.timer || 0, min: 0, max: 86400,
        onInput: (n) => this.#live(ops.patchSlide(this.editor.deck, id, { timer: n }), `insp:${id}:timer`),
      }), '0 turns it off. The speaker sees it in the presenter view and it sets the pace for auto-play.'),
      field('Speaker notes', textInput({
        value: slide.notes,
        multiline: true,
        rows: 5,
        placeholder: 'Notes only you see while presenting',
        onInput: (value) => this.#live(ops.patchSlide(this.editor.deck, id, { notes: value }), `insp:${id}:notes`),
      })),
    );

    if (slide.timer) {
      setup.append(toggle({
        label: 'Show the countdown on screen', value: !!slide.showTimer,
        onChange: (v) => this.#live(ops.patchSlide(this.editor.deck, id, { showTimer: v }), `insp:${id}:showTimer`),
      }));
    }

    const background = this.#backgroundSection(slide);
    const content = section('Add content');
    for (const slot of layout.slots) {
      const count = slide.blocks.filter((b) => b.slot === slot.id).length;
      const row = h('div', { class: 'ed-row' },
        h('span', { class: 'ed-row__label', text: `${slot.label}${count ? ` (${count})` : ''}`, style: selection.slotId === slot.id ? 'font-weight:600' : '' }),
        button({ icon: 'plus', label: `Add to ${slot.label}`, iconOnly: true, onClick: (e, el) => this.editor.openBlockMenu(el, { slot: slot.id }) }));
      content.append(row);
    }
    return [setup, background, content];
  }


  // ---- backgrounds, custom colours, logo ---------------------------------

  #backgroundSection(slide) {
    const { deck } = this.editor;
    const id = slide.id;
    const bg = slide.background;
    // "Image" with no picture yet is only a draft choice, so it wins over a colour the slide still has.
    const draft = this.bgMode.get(id);
    const mode = bg?.image ? 'image' : draft === 'image' ? 'image' : bg?.color ? 'color' : draft ?? 'theme';
    const set = (next) => this.#rebuilding(ops.setSlideBackground(this.editor.deck, id, next));
    const themeBg = THEMES[deck.theme.id]?.tokens.bg ?? '#0F1117';

    const box = section('Background');
    box.append(field('Style', segmented({
      options: [{ value: 'theme', label: 'Theme' }, { value: 'color', label: 'Colour' }, { value: 'image', label: 'Image' }],
      value: mode,
      onChange: (m) => {
        this.bgMode.set(id, m);
        if (m === 'theme') set(null);
        else if (m === 'color') set({ color: bg?.color ?? deck.theme.overrides.bg ?? themeBg });
        else this.#build(); // wait for a picture before changing the slide
      },
    })));
    if (mode === 'color') {
      box.append(field('Colour', colorInput({
        value: bg?.color ?? themeBg, label: 'Slide background colour',
        onInput: (v) => this.#live(ops.setSlideBackground(this.editor.deck, id, { color: v }), `insp:${id}:bgcolor`),
      }), 'Text switches to light or dark to stay readable.'));
    }
    if (mode === 'image') {
      const url = bg?.image ? safeImageUrl(this.editor.assets.resolve(bg.image)) : null;
      const preview = h('div', { class: 'ed-image-preview' });
      if (url) preview.append(h('img', { src: url, alt: '', style: 'max-width:100%;max-height:100%;object-fit:cover' }));
      else preview.textContent = 'No image yet';
      box.append(preview, h('div', { class: 'ed-image-actions' },
        button({ icon: 'upload', label: url ? 'Replace' : 'Upload image', onClick: () => this.editor.chooseImage((ref) => set({ image: ref, dim: bg?.dim ?? 40 })) }),
        url ? button({ icon: 'trash', label: 'Remove', onClick: () => { this.bgMode.set(id, 'theme'); set(null); } }) : null));
      if (url) {
        box.append(field('Darken image (%)', numberInput({
          value: bg.dim ?? 40, min: 0, max: 80,
          onInput: (n) => this.#live(ops.setSlideBackground(this.editor.deck, id, { ...this.editor.slide.background, dim: n }), `insp:${id}:dim`),
        }), 'A darker picture keeps the white text readable.'));
      }
    }
    return box;
  }

  #colorsSection() {
    const { deck } = this.editor;
    const base = THEMES[deck.theme.id].tokens;
    const current = { ...base, ...deck.theme.overrides };
    const fonts = { fontSans: deck.theme.overrides.fontSans, fontMono: deck.theme.overrides.fontMono };
    const keepFonts = () => Object.fromEntries(Object.entries(this.editor.deck.theme.overrides).filter(([k]) => k.startsWith('font')));
    const draft = { accent: current.accent, bg: current.bg };
    const apply = () => {
      const tokens = buildThemeTokens(draft);
      if (!tokens) return;
      this.#live(ops.setThemeOverrides(this.editor.deck, { ...keepFonts(), ...tokens }), 'deck:colors');
      resetBtn.hidden = false;
    };
    const custom = Object.keys(deck.theme.overrides).some((k) => !k.startsWith('font'));
    // Shown as soon as a colour is customised, without rebuilding the panel under an open colour picker.
    const resetBtn = button({ label: 'Back to theme colours', variant: 'wide', onClick: () => {
      const { fontSans, fontMono } = this.editor.deck.theme.overrides;
      this.#rebuilding(ops.setThemeOverrides(this.editor.deck, Object.fromEntries(Object.entries({ fontSans, fontMono }).filter(([, v]) => v))));
    } });
    resetBtn.hidden = !custom;

    const FONTS = [
      { value: '', label: 'Theme font (Inter)' },
      { value: "Georgia, 'Times New Roman', serif", label: 'Serif (Georgia)' },
      { value: "system-ui, -apple-system, 'Segoe UI', sans-serif", label: 'System font' },
      { value: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace", label: 'Monospace' },
    ];
    return section('Custom colours and font',
      h('div', { class: 'ed-colors' },
        field('Background', colorInput({ value: draft.bg, label: 'Background colour', onInput: (v) => { draft.bg = v; apply(); } })),
        field('Accent', colorInput({ value: draft.accent, label: 'Accent colour', onInput: (v) => { draft.accent = v; apply(); } }))),
      h('p', { class: 'ed-hint', text: 'Text, panels and borders are worked out from these two so everything stays readable.' }),
      field('Font', select({
        options: FONTS, value: fonts.fontSans ?? '',
        onChange: (v) => {
          const { fontSans, ...rest } = this.editor.deck.theme.overrides;
          this.#rebuilding(ops.setThemeOverrides(this.editor.deck, v ? { ...rest, fontSans: v } : rest));
        },
      })),
      resetBtn);
  }

  #logoSection() {
    const { deck } = this.editor;
    const { logo, position, size } = deck.brand;
    const url = logo ? safeImageUrl(this.editor.assets.resolve(logo)) : null;
    const preview = h('div', { class: 'ed-logo-preview' });
    if (url) preview.append(h('img', { src: url, alt: '' }));
    else preview.textContent = 'No logo';
    const set = (patch) => this.#rebuilding(ops.setBrand(this.editor.deck, patch));
    return section('Logo',
      preview,
      h('div', { class: 'ed-image-actions' },
        button({ icon: 'upload', label: url ? 'Replace' : 'Upload logo', onClick: () => this.editor.chooseImage((ref) => set({ logo: ref })) }),
        url ? button({ icon: 'trash', label: 'Remove', onClick: () => set({ logo: '' }) }) : null),
      url ? field('Corner', select({
        options: [{ value: 'bottom-right', label: 'Bottom right' }, { value: 'bottom-left', label: 'Bottom left' }, { value: 'top-right', label: 'Top right' }, { value: 'top-left', label: 'Top left' }],
        value: position, onChange: (v) => set({ position: v }),
      })) : null,
      url ? field('Size', segmented({ options: [{ value: 'sm', label: 'Small' }, { value: 'md', label: 'Medium' }, { value: 'lg', label: 'Large' }], value: size, onChange: (v) => this.#live(ops.setBrand(this.editor.deck, { size: v }), 'deck:logosize') })) : null);
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
      this.#colorsSection(),
      this.#logoSection(),
      section('Auto-play',
        field('Move on every (seconds)', numberInput({
          value: deck.autoplay.seconds, min: 0, max: 3600,
          onInput: (n) => this.#live(ops.setAutoplay(this.editor.deck, { seconds: n }), 'deck:autoplay'),
        }), '0 turns it off. For kiosks and looping displays. A slide with its own countdown uses that instead. Press A to pause.'),
        toggle({ label: 'Start over at the end', value: deck.autoplay.loop, onChange: (v) => this.#live(ops.setAutoplay(this.editor.deck, { loop: v }), 'deck:autoplay-loop') }),
      ),
    ];
  }
}
