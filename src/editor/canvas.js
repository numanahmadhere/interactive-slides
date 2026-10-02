// The editing surface: the current slide rendered in "edit" mode inside a
// scaled stage, plus selection, click-to-edit text and a floating format bar.
//
// Text editing uses contenteditable on the real rendered element. Every input
// event commits the new value to the store (coalesced into one undo step) but
// the canvas does not re-render while you type, so the caret is never lost; it
// re-renders once when editing ends.

import { h } from '../core/dom.js';
import { renderSlide, activateSlide } from '../core/render.js';
import { applyTheme } from '../core/theme.js';
import { ASPECTS } from '../core/schema.js';
import { getBlock } from '../core/blocks/index.js';
import { getLayout } from '../core/layouts.js';
import { sanitizeInline, safeLinkUrl } from '../core/sanitize.js';
import { escapeHtml } from '../core/util.js';
import * as ops from './ops.js';
import { button } from './ui.js';

const STAGE_MARGIN = 40;

const PLAINTEXT = (() => {
  try {
    const probe = document.createElement('div');
    probe.contentEditable = 'plaintext-only';
    return probe.contentEditable === 'plaintext-only';
  } catch {
    return false;
  }
})();

function caretRangeAt(x, y) {
  if (document.caretRangeFromPoint) return document.caretRangeFromPoint(x, y);
  const pos = document.caretPositionFromPoint?.(x, y);
  if (!pos) return null;
  const range = document.createRange();
  range.setStart(pos.offsetNode, pos.offset);
  range.collapse(true);
  return range;
}

// Clean up what contenteditable leaves behind: entities, trailing breaks.
function cleanRich(html) {
  return sanitizeInline(html)
    .replace(/&nbsp;/g, ' ')
    .replace(/(?:<br>\s*)+$/i, '');
}

export class CanvasView {
  constructor(host, editor) {
    this.host = host;
    this.editor = editor;
    this.stage = h('div', { class: 'ed-stage' });
    this.dropzone = h('div', { class: 'ed-dropzone', text: 'Drop an image to add it' });
    this.fmt = this.#buildFormatBar();
    host.append(this.stage, this.fmt.el, this.dropzone);

    this.rendered = null;
    this.disposeSlide = null;
    this.overflowTimer = 0;
    this.editing = null;
    this.hovered = null;
    this.scale = 1;
    this.onSelectionChange = () => this.#syncFormatState();

    this.#bind();
    this.resizeObserver = new ResizeObserver(() => this.#fit());
    this.resizeObserver.observe(host);
  }

  get isEditing() {
    return this.editing !== null;
  }

  blockEl(blockId) {
    return this.stage.querySelector(`.sp-block[data-block="${CSS.escape(blockId)}"]`);
  }

  // ---- rendering ---------------------------------------------------------

  sync({ source } = {}) {
    const { deck, slide, slideIndex } = this.editor;
    if (!slide) return;
    const r = this.rendered;
    const assets = this.editor.assets.version;

    if (source === 'canvas-edit' && r && r.slide.id === slide.id) {
      this.rendered = { ...r, slide, deck, assets };
      this.#scheduleOverflowCheck();
      return;
    }
    const stale = !r || r.slide !== slide || r.theme !== deck.theme || r.aspect !== deck.aspect || r.assets !== assets;
    if (stale) {
      if (this.editing) this.#endEditing({ render: false });
      this.#render(deck, slide, slideIndex);
    }
    this.#applySelection();
  }

  #render(deck, slide, index) {
    const { width, height } = ASPECTS[deck.aspect];
    this.stage.style.width = `${width}px`;
    this.stage.style.height = `${height}px`;
    applyTheme(this.stage, deck.theme);

    this.disposeSlide?.();
    const el = renderSlide(deck, slide, {
      mode: 'edit',
      resolveAsset: this.editor.assets.resolve,
      index,
      session: this.editor.session,
      edit: { patch: (blockId, props, opts) => this.#patchFromBlock(blockId, props, opts?.final) },
    });
    this.#decorate(el, deck, slide);
    this.stage.replaceChildren(el);
    this.disposeSlide = activateSlide(el); // visual behaviours (tabs, flip cards, marker dragging)
    this.hovered = null;
    this.#scheduleOverflowCheck();
    this.rendered = { slide, deck, theme: deck.theme, aspect: deck.aspect, assets: this.editor.assets.version };
    this.#fit();
  }

  // Editor-only affordances layered onto the rendered slide.
  #decorate(slideEl, deck, slide) {
    const layout = getLayout(slide.layout);
    for (const slotEl of slideEl.querySelectorAll(':scope > .sp-slot')) {
      if (slotEl.querySelector('.sp-block')) continue;
      const slot = layout.slots.find((s) => s.id === slotEl.dataset.slot);
      slotEl.append(h('div', { class: 'ed-slot-empty', text: `Add ${slot.label.toLowerCase()}` }));
    }
    // Empty sections of columns, tabs and accordions get a click target too.
    for (const sectionEl of slideEl.querySelectorAll('[data-section]')) {
      if (sectionEl.querySelector(':scope > .sp-block')) continue;
      sectionEl.append(h('div', {
        class: 'ed-slot-empty ed-section-empty',
        text: 'Click to add a block',
        'data-container': sectionEl.closest('.sp-block').dataset.block,
        'data-index': sectionEl.dataset.section,
      }));
    }
    for (const blockEl of slideEl.querySelectorAll('.sp-block')) {
      const hit = ops.findBlock(deck, blockEl.dataset.block);
      for (const field of (hit && getBlock(hit.block.type)?.edit) ?? []) {
        const target = this.#fieldEl(blockEl, field);
        if (!target) continue;
        target.dataset.placeholder = field.placeholder;
        target.dataset.field = field.prop;
      }
    }
  }

  // Content that runs past its slot or off the slide is clipped when presenting,
  // so mark it here where it can still be fixed.
  #scheduleOverflowCheck() {
    clearTimeout(this.overflowTimer);
    this.overflowTimer = setTimeout(() => this.#flagOverflow(), 150);
  }

  #flagOverflow() {
    const slide = this.stage.querySelector('.sp-slide');
    if (!slide) return;
    const edge = slide.getBoundingClientRect();
    // Text metrics can push a box a few pixels past its slot; only real spill counts.
    const slack = 24;
    for (const slot of slide.querySelectorAll(':scope > .sp-slot')) {
      const box = slot.getBoundingClientRect();
      const over = slot.scrollHeight - slot.clientHeight > slack
        || box.bottom > edge.bottom + slack * this.scale
        || box.right > edge.right + slack * this.scale;
      slot.classList.toggle('ed-overflow', over);
    }
  }

  #fieldEl(blockEl, field) {
    return field.selector ? blockEl.querySelector(field.selector) : blockEl.firstElementChild;
  }

  #applySelection() {
    for (const n of this.stage.querySelectorAll('.ed-selected, .ed-slot-selected')) {
      n.classList.remove('ed-selected', 'ed-slot-selected');
    }
    const { blockId, slotId } = this.editor.selection;
    if (blockId) this.blockEl(blockId)?.classList.add('ed-selected');
    else if (slotId) this.stage.querySelector(`.sp-slot[data-slot="${CSS.escape(slotId)}"]`)?.classList.add('ed-slot-selected');
  }

  #fit() {
    const deck = this.editor.deck;
    if (!deck) return;
    const { width, height } = ASPECTS[deck.aspect];
    const rect = this.host.getBoundingClientRect();
    const scale = Math.max(
      0.05,
      Math.min((rect.width - STAGE_MARGIN * 2) / width, (rect.height - STAGE_MARGIN * 2) / height),
    );
    this.scale = scale;
    this.stage.style.transform = `translate(-50%, -50%) scale(${scale})`;
    if (this.editing) this.#positionFormatBar();
  }

  // ---- pointer input -----------------------------------------------------

  #bind() {
    this.stage.addEventListener('pointerdown', (e) => this.#onPointerDown(e));
    this.stage.addEventListener('pointermove', (e) => this.#setHover(e.target.closest?.('.sp-block') ?? null));
    this.stage.addEventListener('pointerleave', () => this.#setHover(null));
    this.stage.addEventListener('dblclick', (e) => this.#onDoubleClick(e));
    this.host.addEventListener('pointerdown', (e) => {
      if (e.target !== this.host) return;
      if (this.editing) this.finishEdit();
      this.editor.select({});
    });

    this.host.addEventListener('dragover', (e) => {
      if (![...(e.dataTransfer?.types ?? [])].includes('Files')) return;
      e.preventDefault();
      this.host.classList.add('is-dropping');
    });
    this.host.addEventListener('dragleave', (e) => {
      if (e.target === this.host || !this.host.contains(e.relatedTarget)) this.host.classList.remove('is-dropping');
    });
    this.host.addEventListener('drop', (e) => this.#onDrop(e));
  }

  #onPointerDown(e) {
    if (e.button !== 0) return;
    const target = e.target;
    if (this.editing) {
      if (this.editing.el.contains(target)) return; // caret placement inside the text
      this.finishEdit();
    }
    const emptySection = target.closest('.ed-section-empty');
    if (emptySection) {
      const container = ops.findBlock(this.editor.deck, emptySection.dataset.container)?.block;
      this.editor.select({ blockId: emptySection.dataset.container });
      this.editor.openBlockMenu(
        { x: e.clientX, y: e.clientY },
        { containerOf: emptySection.dataset.container, index: Number(emptySection.dataset.index) },
        { exclude: this.editor.excludedInside(container) },
      );
      return;
    }
    const blockEl = target.closest('.sp-block');
    if (blockEl) {
      const id = blockEl.dataset.block;
      const wasSelected = this.editor.selection.blockId === id;
      this.editor.select({ blockId: id });
      if (wasSelected && this.#isEditable(id)) this.startEdit(id, { event: e });
      return;
    }
    const slotEl = target.closest('.sp-slot');
    if (slotEl) {
      const slot = slotEl.dataset.slot;
      this.editor.select({ slotId: slot });
      if (target.closest('.ed-slot-empty')) {
        this.editor.openBlockMenu({ x: e.clientX, y: e.clientY }, { slot });
      }
      return;
    }
    this.editor.select({});
  }

  #onDoubleClick(e) {
    const blockEl = e.target.closest('.sp-block');
    if (!blockEl) return;
    const hit = ops.findBlock(this.editor.deck, blockEl.dataset.block);
    const keys = hit ? ops.imageKeys(hit.block) : [];
    if (keys.length === 1) this.editor.pickImage(hit.block.id, keys[0]);
  }

  // Adjustments made on the slide itself (dragging a hotspot marker). Updates
  // are coalesced into one undo step and do not re-render while dragging.
  #patchFromBlock(blockId, props, final) {
    const next = ops.patchBlockProps(this.editor.deck, blockId, props);
    this.editor.commit(next, { source: final ? 'canvas-final' : 'canvas-edit', coalesce: `drag:${blockId}` });
    if (!final) return;
    this.editor.store.endCoalesce();
    // The last move already stored the final values, so the commit above may
    // have been a no-op; refresh the panel and the slide regardless.
    this.rendered = null;
    this.editor.refresh();
  }

  #setHover(blockEl) {
    if (this.hovered === blockEl) return;
    this.hovered?.classList.remove('ed-hover');
    this.hovered = blockEl;
    blockEl?.classList.add('ed-hover');
  }

  #onDrop(e) {
    this.host.classList.remove('is-dropping');
    const files = [...(e.dataTransfer?.files ?? [])].filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    e.preventDefault();
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const blockEl = under?.closest('.sp-block');
    const slotEl = under?.closest('.sp-slot');
    const hit = blockEl && ops.findBlock(this.editor.deck, blockEl.dataset.block);
    this.editor.addImageFiles(files, {
      blockId: hit && ops.imageKeys(hit.block).length ? hit.block.id : undefined,
      slot: slotEl?.dataset.slot,
    });
  }

  // ---- inline editing ----------------------------------------------------

  #isEditable(blockId) {
    const hit = ops.findBlock(this.editor.deck, blockId);
    return !!getBlock(hit?.block.type)?.edit?.length;
  }

  startEdit(blockId, { event, selectAll = false } = {}) {
    if (this.editing?.blockId === blockId) return;
    if (this.editing) this.finishEdit();
    const hit = ops.findBlock(this.editor.deck, blockId);
    const def = hit && getBlock(hit.block.type);
    const blockEl = this.blockEl(blockId);
    if (!def?.edit?.length || !blockEl) return;

    let field = def.edit[0];
    let el = this.#fieldEl(blockEl, field);
    if (event) {
      for (const f of def.edit) {
        const candidate = this.#fieldEl(blockEl, f);
        if (candidate?.contains(event.target)) {
          field = f;
          el = candidate;
          break;
        }
      }
    }
    if (!el) return;
    if (field.kind === 'list' && !el.querySelector('li')) el.append(h('li'));

    const plain = field.kind === 'code' || field.kind === 'plain';
    el.contentEditable = plain && PLAINTEXT ? 'plaintext-only' : 'true';
    el.spellcheck = field.kind !== 'code';
    el.setAttribute('role', 'textbox');
    el.classList.add('is-editing');

    const session = {
      blockId,
      field,
      el,
      kind: field.kind,
      coalesce: `edit:${blockId}:${field.prop}`,
      listeners: [],
    };
    this.editing = session;
    const on = (type, fn) => {
      el.addEventListener(type, fn);
      session.listeners.push([type, fn]);
    };
    on('input', () => this.#commitEditing());
    on('keydown', (e) => this.#onEditKey(e));
    on('paste', (e) => this.#onPaste(e));
    on('drop', (e) => this.#onTextDrop(e));
    on('focusout', (e) => {
      if (this.editing !== session || this.fmt.el.contains(e.relatedTarget)) return;
      this.finishEdit();
    });
    document.addEventListener('selectionchange', this.onSelectionChange);

    el.focus({ preventScroll: true });
    this.#placeCaret(el, { event, selectAll });
    this.#showFormatBar();
  }

  #placeCaret(el, { event, selectAll }) {
    const range = document.createRange();
    const at = !selectAll && event ? caretRangeAt(event.clientX, event.clientY) : null;
    if (at && el.contains(at.startContainer)) {
      range.setStart(at.startContainer, at.startOffset);
      range.collapse(true);
    } else {
      range.selectNodeContents(el);
      if (!selectAll) range.collapse(false);
    }
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  #readValue(session, { final = false } = {}) {
    const { el, kind } = session;
    if (kind === 'code' || kind === 'plain') {
      const text = el.textContent ?? '';
      // plaintext-only editing leaves one trailing newline behind when finished
      return final && kind === 'code' ? text.replace(/\n$/, '') : text;
    }
    if (kind === 'list') {
      const items = [...el.children].filter((c) => c.tagName === 'LI').map((li) => cleanRich(li.innerHTML));
      return final ? items.filter((s) => s.trim() !== '') : items;
    }
    return cleanRich(el.innerHTML);
  }

  #commitEditing(source = 'canvas-edit') {
    const s = this.editing;
    if (!s) return;
    const next = ops.patchBlockProps(this.editor.deck, s.blockId, { [s.field.prop]: this.#readValue(s) });
    this.editor.commit(next, { source, coalesce: s.coalesce });
    this.#positionFormatBar();
  }

  finishEdit() {
    this.#endEditing({ render: true });
  }

  #endEditing({ render }) {
    const s = this.editing;
    if (!s) return;
    this.editing = null;
    for (const [type, fn] of s.listeners) s.el.removeEventListener(type, fn);
    document.removeEventListener('selectionchange', this.onSelectionChange);

    const final = this.#readValue(s, { final: true });
    const next = ops.patchBlockProps(this.editor.deck, s.blockId, { [s.field.prop]: final });
    this.editor.commit(next, { source: 'canvas-final', coalesce: s.coalesce });
    this.editor.store.endCoalesce();

    this.#hideFormatBar();
    window.getSelection()?.removeAllRanges();
    if (render) {
      this.rendered = null; // drop contenteditable and show normalised content
      this.sync();
    }
  }

  #onEditKey(e) {
    const s = this.editing;
    if (!s) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.finishEdit();
      return;
    }
    const mod = e.metaKey || e.ctrlKey;
    const richKind = s.kind === 'rich' || s.kind === 'list';
    if (mod && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === 'k' && richKind) {
        e.preventDefault();
        this.#openLinkInput();
      } else if (k === 'b' || k === 'i') {
        e.preventDefault(); // handled here so every browser produces the same <b>/<i>
        if (richKind) {
          document.execCommand(k === 'b' ? 'bold' : 'italic');
          this.#syncFormatState();
        }
      }
      return;
    }

    if (e.key === 'Enter' && !e.isComposing) {
      if (s.kind === 'rich') {
        e.preventDefault();
        document.execCommand('insertLineBreak');
      } else if (s.kind === 'plain') {
        e.preventDefault();
        this.finishEdit();
      } else if (s.kind === 'code' && !PLAINTEXT) {
        e.preventDefault();
        document.execCommand('insertText', false, '\n');
      } else if (s.kind === 'list') {
        const li = this.#currentLi(s);
        if (li && li.textContent.trim() === '') {
          e.preventDefault();
          if (s.el.querySelectorAll('li').length > 1) li.remove();
          this.finishEdit(); // Enter on an empty item ends the list
        }
      }
      return;
    }
    if (e.key === 'Tab' && s.kind === 'code') {
      e.preventDefault();
      document.execCommand('insertText', false, '  ');
      return;
    }
    if (e.key === 'Backspace' && s.kind === 'list') {
      // Backspace at the very start of the first item would unwrap the list.
      const sel = window.getSelection();
      const li = this.#currentLi(s);
      if (sel.isCollapsed && li && li === s.el.querySelector('li')) {
        const range = document.createRange();
        range.selectNodeContents(li);
        range.setEnd(sel.anchorNode, sel.anchorOffset);
        if (range.toString().length === 0) e.preventDefault();
      }
    }
  }

  #currentLi(session) {
    const node = window.getSelection().anchorNode;
    const el = node instanceof Element ? node : node?.parentElement;
    const li = el?.closest('li');
    return li && session.el.contains(li) ? li : null;
  }

  // Pasted or dropped formatting is dropped on purpose: plain text only. Letting
  // the browser insert dragged HTML would also run any handlers it carries.
  #onPaste(e) {
    e.preventDefault();
    this.#insertPlain(e.clipboardData?.getData('text/plain'));
  }

  #onTextDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    this.#insertPlain(e.dataTransfer?.getData('text/plain'));
  }

  #insertPlain(raw) {
    const s = this.editing;
    if (!s) return;
    const text = (raw ?? '').replace(/\r\n?/g, '\n');
    if (!text) return;
    if (s.kind === 'code' || s.kind === 'plain') {
      document.execCommand('insertText', false, s.kind === 'plain' ? text.replace(/\n+/g, ' ') : text);
      return;
    }
    text.split('\n').forEach((line, i) => {
      if (i > 0) document.execCommand(s.kind === 'list' ? 'insertParagraph' : 'insertLineBreak');
      if (line) document.execCommand('insertText', false, line);
    });
  }

  // ---- format bar --------------------------------------------------------

  #buildFormatBar() {
    const el = h('div', { class: 'ed-fmt', role: 'toolbar', 'aria-label': 'Text formatting', hidden: true });
    const keepSelection = (b) => b.addEventListener('pointerdown', (e) => e.preventDefault());
    const make = (iconName, label, run, pressedCommand) => {
      const b = button({ icon: iconName, label, iconOnly: true, variant: 'ghost', onClick: () => { run(); this.#syncFormatState(); } });
      b.dataset.command = pressedCommand ?? '';
      keepSelection(b);
      return b;
    };
    const bold = make('bold', 'Bold', () => document.execCommand('bold'), 'bold');
    const italic = make('italic', 'Italic', () => document.execCommand('italic'), 'italic');
    const code = make('code', 'Inline code', () => this.#wrapInlineCode());
    const link = make('link', 'Link (Ctrl+K)', () => this.#openLinkInput());
    const clear = make('clear', 'Clear formatting', () => {
      document.execCommand('removeFormat');
      document.execCommand('unlink');
    });

    const buttons = h('div', { class: 'ed-fmt__row', style: 'display:flex;gap:2px;align-items:center' },
      bold, italic, code, h('span', { class: 'ed-fmt__sep' }), link, clear);

    const input = h('input', { class: 'ed-input', type: 'text', placeholder: 'Paste or type a link', 'aria-label': 'Link address' });
    const linkRow = h('div', { class: 'ed-fmt__row', style: 'display:none;gap:6px;align-items:center' }, input,
      button({ label: 'Apply', variant: 'primary', onClick: () => this.#applyLink() }));
    keepSelection(linkRow.lastElementChild);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.#applyLink();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.#closeLinkInput(true);
      }
    });
    el.append(buttons, linkRow);
    return { el, buttons, linkRow, input, bold, italic, savedRange: null };
  }

  #showFormatBar() {
    const s = this.editing;
    if (!s || (s.kind !== 'rich' && s.kind !== 'list')) return;
    this.fmt.el.hidden = false;
    this.#closeLinkInput(false);
    this.#positionFormatBar();
    this.#syncFormatState();
  }

  #hideFormatBar() {
    this.fmt.el.hidden = true;
    this.#closeLinkInput(false);
  }

  #positionFormatBar() {
    const s = this.editing;
    if (!s || this.fmt.el.hidden) return;
    const target = s.el.getBoundingClientRect();
    const host = this.host.getBoundingClientRect();
    const width = this.fmt.el.offsetWidth;
    const height = this.fmt.el.offsetHeight;
    let top = target.top - host.top - height - 14;
    if (top < 6) top = target.bottom - host.top + 14;
    const left = Math.min(Math.max(target.left - host.left, 6), Math.max(6, host.width - width - 6));
    this.fmt.el.style.top = `${top}px`;
    this.fmt.el.style.left = `${left}px`;
  }

  #syncFormatState() {
    if (!this.editing || this.fmt.el.hidden) return;
    for (const b of [this.fmt.bold, this.fmt.italic]) {
      let on = false;
      try {
        on = document.queryCommandState(b.dataset.command);
      } catch { /* unsupported */ }
      b.setAttribute('aria-pressed', String(on));
    }
  }

  #wrapInlineCode() {
    const text = window.getSelection().toString();
    if (text) document.execCommand('insertHTML', false, `<code>${escapeHtml(text)}</code>`);
  }

  #openLinkInput() {
    if (!this.editing) return;
    const sel = window.getSelection();
    this.fmt.savedRange = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
    this.fmt.buttons.style.display = 'none';
    this.fmt.linkRow.style.display = 'flex';
    const anchor = (sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode?.parentElement)?.closest('a');
    this.fmt.input.value = anchor?.getAttribute('href') ?? '';
    this.fmt.input.focus();
    this.fmt.input.select();
  }

  #closeLinkInput(refocus) {
    this.fmt.buttons.style.display = 'flex';
    this.fmt.linkRow.style.display = 'none';
    if (refocus && this.editing) {
      this.editing.el.focus({ preventScroll: true });
      this.#restoreRange();
    }
  }

  #restoreRange() {
    const range = this.fmt.savedRange;
    if (!range) return;
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  #applyLink() {
    let url = this.fmt.input.value.trim();
    if (url && !/^[a-z][a-z0-9+.-]*:|^[#/]/i.test(url)) {
      url = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(url) ? `mailto:${url}` : `https://${url}`;
    }
    const safe = url ? safeLinkUrl(url) : '';
    this.#closeLinkInput(true);
    if (safe === null) {
      this.editor.toast('That link is not allowed.', { kind: 'error' });
      return;
    }
    if (!safe) {
      document.execCommand('unlink');
    } else if (window.getSelection().isCollapsed) {
      document.execCommand('insertHTML', false, `<a href="${escapeHtml(safe)}">${escapeHtml(safe)}</a>`);
    } else {
      document.execCommand('createLink', false, safe);
    }
    this.#commitEditing();
  }
}
