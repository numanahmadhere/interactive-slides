// A reference of every shortcut, opened from File > Keyboard shortcuts or with "?".

import { h } from '../core/dom.js';
import { openDialog } from './ui.js';

const MOD = /Mac|iPhone|iPad/.test(navigator.platform ?? '') ? 'Cmd' : 'Ctrl';

const SECTIONS = [
  ['Adding', [
    ['/', 'Search and add any block'],
    ['Double-click empty canvas', 'Add text where you clicked'],
    [`${MOD}+V`, 'Paste blocks, text, links or pictures'],
  ]],
  ['Moving and sizing', [
    ['Drag', 'Move (Shift keeps to one direction, Alt turns snapping off)'],
    ['Arrow keys', 'Nudge by 2 px (Shift: 20 px)'],
    ['Corner handles', 'Resize (Shift keeps proportions on text, flips it on pictures)'],
    ['Round handle', 'Rotate (Shift: 15 degree steps)'],
    ['Drag on empty canvas', 'Select several (Shift adds)'],
    [`${MOD}+A`, 'Select every block'],
  ]],
  ['Arranging', [
    [`${MOD}+G`, 'Group'], [`${MOD}+Shift+G`, 'Ungroup'],
    [`${MOD}+]  /  ${MOD}+[`, 'Bring forward / send backward (add Shift for front / back)'],
    [`${MOD}+D`, 'Duplicate'], ['Delete', 'Delete'],
  ]],
  ['Editing', [
    ['Enter or F2', 'Type into the selected block'],
    ['Escape', 'Stop typing, or clear the selection'],
    [`${MOD}+Z  /  ${MOD}+Shift+Z`, 'Undo / redo'],
    [`${MOD}+H`, 'Find and replace'],
  ]],
  ['View and slides', [
    [`${MOD}+ +  /  ${MOD}+ -  /  ${MOD}+0`, 'Zoom in / out / fit to window'],
    ['Page Up / Page Down', 'Previous / next slide'],
    ['Shift+click or Ctrl+click a slide', 'Select several slides'],
    [`${MOD}+Enter`, 'Present from this slide'],
  ]],
];

export function openShortcuts() {
  const body = h('div', { class: 'ed-keys' });
  for (const [title, rows] of SECTIONS) {
    const dl = h('dl', { class: 'ed-keys__list' });
    for (const [keys, what] of rows) dl.append(h('dt', {}, h('kbd', { text: keys })), h('dd', { text: what }));
    body.append(h('section', { class: 'ed-keys__group' }, h('h3', { class: 'ed-keys__title', text: title }), dl));
  }
  return openDialog({ title: 'Keyboard shortcuts', content: body, wide: true });
}
