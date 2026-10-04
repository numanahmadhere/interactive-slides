// Small form controls, popover menus and toasts shared by the editor panels.

import { h } from '../core/dom.js';
import { icon } from './icons.js';

let counter = 0;
const nextId = () => `ed-f${++counter}`;

export function button({ label, icon: iconName, onClick, variant = '', title, disabled = false, iconOnly = false }) {
  const el = h('button', {
    type: 'button',
    class: `ed-btn${variant ? ` ed-btn--${variant}` : ''}${iconOnly ? ' ed-btn--icon' : ''}`,
    title: title ?? (iconOnly ? label : undefined),
    'aria-label': iconOnly ? label : undefined,
  });
  if (iconName) el.append(icon(iconName, 16));
  if (label && !iconOnly) el.append(h('span', { text: label }));
  el.disabled = disabled;
  el.addEventListener('click', (e) => onClick?.(e, el));
  return el;
}

export function field(label, control, hint) {
  const id = nextId();
  const wrap = h('div', { class: 'ed-field' });
  const labelEl = h('label', { class: 'ed-label', text: label });
  if (control.matches?.('input, select, textarea, button')) {
    control.id = id;
    labelEl.htmlFor = id;
  } else {
    control.setAttribute('role', control.getAttribute('role') ?? 'group');
    control.setAttribute('aria-label', label);
  }
  wrap.append(labelEl, control);
  if (hint) wrap.append(h('div', { class: 'ed-hint', text: hint }));
  return wrap;
}

export function segmented({ options, value, onChange }) {
  const el = h('div', { class: 'ed-seg', role: 'radiogroup' });
  const buttons = options.map((opt) => {
    const b = h('button', { type: 'button', role: 'radio', class: 'ed-seg__btn', text: opt.label });
    b.dataset.value = String(opt.value);
    b.addEventListener('click', () => {
      sync(opt.value);
      onChange(opt.value);
    });
    el.append(b);
    return [opt.value, b];
  });
  const sync = (v) => {
    for (const [val, b] of buttons) {
      b.setAttribute('aria-checked', String(val === v));
      b.tabIndex = val === v ? 0 : -1;
    }
  };
  sync(value);
  el.addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    const i = buttons.findIndex(([, b]) => b.getAttribute('aria-checked') === 'true');
    const next = buttons[(i + (e.key === 'ArrowRight' ? 1 : buttons.length - 1)) % buttons.length];
    e.preventDefault();
    next[1].focus();
    next[1].click();
  });
  return el;
}

export function toggle({ label, value, onChange }) {
  const row = h('div', { class: 'ed-toggle' });
  const sw = h('button', { type: 'button', role: 'switch', class: 'ed-switch', 'aria-checked': String(!!value) });
  const text = h('span', { class: 'ed-toggle__label', text: label });
  sw.setAttribute('aria-label', label);
  const flip = () => {
    const next = sw.getAttribute('aria-checked') !== 'true';
    sw.setAttribute('aria-checked', String(next));
    onChange(next);
  };
  sw.addEventListener('click', flip);
  text.addEventListener('click', flip);
  row.append(text, sw);
  return row;
}

export function select({ options, value, onChange }) {
  const el = h('select', { class: 'ed-input' });
  for (const opt of options) {
    const o = h('option', { value: String(opt.value), text: opt.label });
    o.selected = String(opt.value) === String(value);
    el.append(o);
  }
  el.addEventListener('change', () => {
    const picked = options.find((o) => String(o.value) === el.value);
    onChange(picked ? picked.value : el.value);
  });
  return el;
}

export function textInput({ value = '', onInput, placeholder, multiline = false, rows = 4, spellcheck = true }) {
  const el = multiline ? h('textarea', { class: 'ed-input', rows }) : h('input', { class: 'ed-input', type: 'text' });
  el.value = value;
  if (placeholder) el.placeholder = placeholder;
  el.spellcheck = spellcheck;
  el.addEventListener('input', () => onInput(el.value));
  return el;
}

export function numberInput({ value = 0, min = 0, max = 99, onInput }) {
  const el = h('input', { class: 'ed-input ed-input--num', type: 'number', min, max, step: 1 });
  el.value = String(value);
  el.addEventListener('input', () => {
    const n = Number.parseInt(el.value, 10);
    if (Number.isFinite(n)) onInput(Math.min(max, Math.max(min, n)));
  });
  return el;
}

// ---- menus ----------------------------------------------------------------

let openMenuHandle = null;

// items: [{ label, value, hint? } | { heading }]. Anchor is an element or { x, y }.
export function openMenu({ anchor, items, onPick, label = 'Menu' }) {
  openMenuHandle?.close();
  const menu = h('div', { class: 'ed-menu', role: 'menu', 'aria-label': label });
  const buttons = [];
  for (const item of items) {
    if (item.heading) {
      menu.append(h('div', { class: 'ed-menu__heading', role: 'presentation', text: item.heading }));
      continue;
    }
    const b = h('button', { type: 'button', role: 'menuitem', class: 'ed-menu__item' },
      h('span', { text: item.label }),
      item.hint ? h('span', { class: 'ed-menu__hint', text: item.hint }) : null);
    b.addEventListener('click', () => {
      close();
      onPick(item.value, item);
    });
    menu.append(b);
    buttons.push(b);
  }
  document.body.append(menu);

  const rect = anchor instanceof Element
    ? anchor.getBoundingClientRect()
    : { left: anchor.x, right: anchor.x, top: anchor.y, bottom: anchor.y };
  const width = menu.offsetWidth;
  const height = menu.offsetHeight;
  menu.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - width - 8))}px`;
  const below = rect.bottom + 6;
  menu.style.top = `${below + height > innerHeight - 8 ? Math.max(8, rect.top - height - 6) : below}px`;

  const onKey = (e) => {
    const i = buttons.indexOf(document.activeElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      buttons[(i + 1) % buttons.length].focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      buttons[(i - 1 + buttons.length) % buttons.length].focus();
    } else if (e.key === 'Tab') {
      close();
    }
  };
  const onOutside = (e) => {
    if (!menu.contains(e.target)) close();
  };
  menu.addEventListener('keydown', onKey);
  const armOutsideClick = setTimeout(() => document.addEventListener('pointerdown', onOutside, true), 0);

  function close() {
    if (openMenuHandle?.menu !== menu) return;
    openMenuHandle = null;
    clearTimeout(armOutsideClick);
    document.removeEventListener('pointerdown', onOutside, true);
    menu.remove();
    if (anchor instanceof Element && anchor.isConnected) anchor.focus({ preventScroll: true });
  }

  openMenuHandle = { menu, close };
  buttons[0]?.focus();
  return close;
}

export function closeMenu() {
  openMenuHandle?.close();
}

// ---- toasts ---------------------------------------------------------------

let toastHost = null;

export function toast(message, { kind = 'info', timeout = 3500 } = {}) {
  if (!toastHost) {
    toastHost = h('div', { class: 'ed-toasts', role: 'status', 'aria-live': 'polite' });
    document.body.append(toastHost);
  }
  const el = h('div', { class: `ed-toast ed-toast--${kind}`, text: message });
  toastHost.append(el);
  setTimeout(() => el.remove(), timeout);
}

// ---- editable lists (quiz choices, hotspots, flip cards, ...) ---------------

// fields: [{ key, label, type: 'text' | 'textarea' | 'number' | 'toggle', min?, max? }]
// onText(items) fires while typing and must not rebuild the panel;
// onStructure(items) fires on add, remove and reorder, which should.
export function listEditor({ items, fields, itemLabel, addLabel, min = 0, max = 99, makeItem, onText, onStructure }) {
  const wrap = h('div', { class: 'ed-list' });
  const current = items.map((item) => ({ ...item }));
  const snapshot = () => current.map((item) => ({ ...item }));

  const tool = (iconName, label, disabled, run) => button({ icon: iconName, label, iconOnly: true, variant: 'ghost', disabled, onClick: run });

  current.forEach((item, i) => {
    const swap = (j) => {
      const next = snapshot();
      [next[i], next[j]] = [next[j], next[i]];
      onStructure(next);
    };
    const head = h('div', { class: 'ed-col-card__head' },
      h('span', { text: `${itemLabel} ${i + 1}` }),
      h('div', { class: 'ed-list__tools' },
        tool('up', `Move ${itemLabel.toLowerCase()} up`, i === 0, () => swap(i - 1)),
        tool('down', `Move ${itemLabel.toLowerCase()} down`, i === current.length - 1, () => swap(i + 1)),
        tool('trash', `Remove ${itemLabel.toLowerCase()}`, current.length <= min, () => onStructure(snapshot().filter((_, n) => n !== i)))));

    const card = h('div', { class: 'ed-col-card' }, head);
    for (const f of fields) {
      const set = (value) => {
        current[i][f.key] = value;
        onText(snapshot());
      };
      if (f.type === 'toggle') card.append(toggle({ label: f.label, value: !!item[f.key], onChange: set }));
      else if (f.type === 'select') card.append(field(f.label, select({ options: f.options, value: item[f.key], onChange: set })));
      else if (f.type === 'number') card.append(field(f.label, numberInput({ value: item[f.key] ?? 0, min: f.min ?? 0, max: f.max ?? 100, onInput: set })));
      else card.append(field(f.label, textInput({ value: item[f.key] ?? '', multiline: f.type === 'textarea', rows: 3, onInput: set })));
    }
    wrap.append(card);
  });

  wrap.append(button({
    icon: 'plus', label: addLabel, variant: 'wide', disabled: current.length >= max,
    onClick: () => onStructure([...snapshot(), makeItem()]),
  }));
  return wrap;
}

// ---- dialogs ----------------------------------------------------------------

// A modal dialog: focus is trapped inside, Escape and a click outside close it,
// and focus goes back to whatever opened it. Returns { el, body, close }.
export function openDialog({ title, content, onClose, wide = false }) {
  const opener = document.activeElement;
  const titleId = nextId();
  const closeBtn = h('button', { type: 'button', class: 'ed-btn ed-btn--ghost ed-btn--icon', 'aria-label': 'Close' });
  closeBtn.append(icon('close', 16));
  const body = h('div', { class: 'ed-dialog__body' });
  if (content) body.append(content);
  const dialog = h('div', { class: `ed-dialog${wide ? ' ed-dialog--wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
    h('div', { class: 'ed-dialog__head' }, h('h2', { class: 'ed-dialog__title', id: titleId, text: title }), closeBtn), body);
  const backdrop = h('div', { class: 'ed-dialog-backdrop' }, dialog);
  document.body.append(backdrop);

  const focusable = () => [...dialog.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
    .filter((el) => !el.disabled && !el.hidden && el.offsetParent !== null);
  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === 'Tab') {
      const items = focusable();
      if (!items.length) return;
      const first = items[0];
      const last = items.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };
  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey, true);
    backdrop.remove();
    if (opener instanceof Element && opener.isConnected) opener.focus({ preventScroll: true });
    onClose?.();
  }
  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('pointerdown', (e) => {
    if (e.target === backdrop) close();
  });
  document.addEventListener('keydown', onKey, true);
  (focusable().find((el) => el !== closeBtn) ?? closeBtn).focus();
  return { el: dialog, body, close };
}

// A native colour picker with a label for assistive tech. onInput gets "#rrggbb".
export function colorInput({ value = '#000000', onInput, label }) {
  const el = h('input', { class: 'ed-color', type: 'color', 'aria-label': label });
  el.value = /^#[0-9a-f]{6}$/i.test(value) ? value : '#000000';
  el.addEventListener('input', () => onInput(el.value.toUpperCase()));
  return el;
}

// ---- popovers --------------------------------------------------------------------

let current = null;

export function closePopover() {
  current?.close();
}

export function openPopover({ anchor, content, label, className = '', onClose, focus }) {
  closePopover();
  const el = h('div', { class: `ed-pop ${className}`, role: 'dialog', 'aria-label': label }, content);
  document.body.append(el);
  const place = () => {
    const pad = 12;
    const r = anchor instanceof Element ? anchor.getBoundingClientRect() : { left: anchor.x, right: anchor.x, top: anchor.y, bottom: anchor.y, width: 0 };
    const w = el.offsetWidth;
    const hgt = el.offsetHeight;
    let left = Math.min(Math.max(pad, r.left), window.innerWidth - w - pad);
    let top = r.bottom + 8;
    if (top + hgt > window.innerHeight - pad) top = Math.max(pad, Math.min(r.top - hgt - 8, window.innerHeight - hgt - pad));
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  };
  place();
  const handle = {
    el,
    close() {
      if (current !== handle) return;
      current = null;
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', onKey, true);
      el.remove();
      onClose?.();
    },
    place,
  };
  const outside = (e) => {
    if (!el.contains(e.target) && !(anchor instanceof Element && anchor.contains(e.target))) handle.close();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      handle.close();
      if (anchor instanceof Element) anchor.focus?.();
    }
  };
  document.addEventListener('pointerdown', outside, true);
  document.addEventListener('keydown', onKey, true);
  current = handle;
  focus?.focus();
  return handle;
}


// ---- colour swatches ---------------------------------------------------------

const RECENT_KEY = 'densight:recent-colors';
const HEX = /^#[0-9a-f]{6}$/i;

export function recentColors() {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(list) ? list.filter((c) => HEX.test(c)).slice(0, 8) : [];
  } catch {
    return [];
  }
}

function rememberColor(hex) {
  if (!HEX.test(hex)) return;
  try {
    const next = [hex.toUpperCase(), ...recentColors().filter((c) => c.toUpperCase() !== hex.toUpperCase())].slice(0, 8);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch { /* recents are a convenience */ }
}

// A swatch button that opens the theme's colours, recent custom colours and a free picker.
// `swatches` is [{ value, label, css }] where value is what gets stored (a token or hex).
export function colorPicker({ label, value, swatches, onPick, allowReset = true, resetLabel = 'Theme default' }) {
  const css = (v) => swatches.find((s) => s.value === v)?.css ?? v;
  const btn = h('button', { type: 'button', class: 'ed-swatch-btn', 'aria-label': `${label}: ${value ? swatches.find((s) => s.value === value)?.label ?? value : resetLabel}`, title: label, 'aria-haspopup': 'dialog' });
  const chip = h('span', { class: `ed-swatch${value ? '' : ' is-auto'}` });
  if (value) chip.style.background = css(value);
  btn.append(chip, h('span', { class: 'ed-swatch-btn__label', text: label }));
  btn.addEventListener('click', () => {
    const pick = (v) => {
      if (v && HEX.test(v)) rememberColor(v);
      handle.close();
      onPick(v);
    };
    const grid = h('div', { class: 'ed-swatches', role: 'group', 'aria-label': 'Theme colours' });
    for (const s of swatches) {
      const b = h('button', { type: 'button', class: 'ed-swatch ed-swatch--pick', title: s.label, 'aria-label': s.label, 'aria-pressed': String(s.value === value) });
      b.style.background = s.css;
      b.addEventListener('click', () => pick(s.value));
      grid.append(b);
    }
    const recents = recentColors();
    const recentRow = recents.length ? h('div', { class: 'ed-swatches', role: 'group', 'aria-label': 'Recent colours' }, ...recents.map((c) => {
      const b = h('button', { type: 'button', class: 'ed-swatch ed-swatch--pick', title: c, 'aria-label': c });
      b.style.background = c;
      b.addEventListener('click', () => pick(c));
      return b;
    })) : null;
    const custom = colorInput({ value: HEX.test(value ?? '') ? value : '#2020E8', label: 'Custom colour', onInput: () => {} });
    custom.addEventListener('change', () => pick(custom.value.toUpperCase()));
    const content = h('div', { class: 'ed-colorpop' },
      h('div', { class: 'ed-colorpop__title', text: label }),
      grid,
      recentRow ? h('div', { class: 'ed-colorpop__sub', text: 'Recent' }) : null, recentRow,
      h('div', { class: 'ed-colorpop__custom' }, h('span', { text: 'Custom' }), custom),
      allowReset ? button({ label: resetLabel, variant: 'wide', onClick: () => pick('') }) : null);
    const handle = openPopover({ anchor: btn, content, label, className: 'ed-pop--color', focus: grid.querySelector('button') });
  });
  return btn;
}
