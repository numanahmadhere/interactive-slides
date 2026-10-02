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
import { listThemes } from '../core/theme.js';
import { ASPECTS, TRANSITIONS, slideTitle } from '../core/schema.js';
import { safeImageUrl } from '../core/sanitize.js';
import * as ops from './ops.js';
import { button, field, segmented, toggle, select, textInput, numberInput, listEditor } from './ui.js';

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
      onClick: (e, el) => this.editor.openBlockMenu(el, { afterBlockId: id }, { exclude: this.editor.excludedInside(hit.parent?.block) }),
    }));
    return [settings, placement];
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
        onChange: (value) => this.#rebuilding(ops.setSlideLayout(this.editor.deck, id, value)),
      })),
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
