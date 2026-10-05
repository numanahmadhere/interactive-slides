// Version history: snapshots of this deck kept on this device. Restoring one is a normal edit,
// so Undo brings the current version back.

import { h } from '../core/dom.js';
import { normalizeDeck } from '../core/schema.js';
import { button, openDialog, textInput, toast } from './ui.js';

export function when(at, now = Date.now()) {
  const mins = Math.round((now - at) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const d = new Date(at);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const day = (t) => new Date(t).setHours(0, 0, 0, 0);
  const days = Math.round((day(now) - day(at)) / 86400000);
  if (days <= 0) return `Today, ${time}`;
  if (days === 1) return `Yesterday, ${time}`;
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`;
}

export async function openHistoryDialog(editor) {
  await editor.flushSave();
  const status = h('div', { class: 'ed-dialog-status', role: 'status', 'aria-live': 'polite' });
  const list = h('ul', { class: 'ed-hist__list' });
  const nameInput = textInput({ placeholder: 'Name this version (optional)', spellcheck: false });
  nameInput.setAttribute('aria-label', 'Version name');
  nameInput.maxLength = 60;

  const snapshot = (label) => editor.persist.saveVersion(editor.deckId, editor.deck, label);

  async function render() {
    const versions = await editor.persist.listVersions(editor.deckId);
    list.replaceChildren(...(versions.length
      ? versions.map((v) => h('li', { class: 'ed-hist__row' },
        h('div', { class: 'ed-hist__meta' },
          h('b', { text: v.label || when(v.at) }),
          h('span', { text: `${v.label ? `${when(v.at)} · ` : ''}${v.slideCount} ${v.slideCount === 1 ? 'slide' : 'slides'}` })),
        button({ label: 'Restore', onClick: () => restore(v) }),
        button({ label: 'Delete', variant: 'ghost', onClick: async () => { await editor.persist.deleteVersion(v.id); render(); } })))
      : [h('li', { class: 'ed-hist__empty', text: 'No versions yet. One is saved automatically as you work, at most every ten minutes, and you can save one yourself above.' })]));
  }

  async function restore(v) {
    editor.canvas.finishEdit();
    const { deck } = normalizeDeck(v.deck);
    await snapshot('Before restoring');
    if (!editor.commit(deck, { source: 'history' })) return;
    editor.select({ slideId: deck.slides[0].id });
    dlg.close();
    toast('Version restored. Undo (Ctrl+Z) brings back what you had.', { timeout: 6000 });
  }

  const saveBtn = button({ label: 'Save version', variant: 'primary', onClick: async () => {
    await snapshot(nameInput.value.trim());
    nameInput.value = '';
    status.textContent = 'Version saved.';
    render();
  } });
  const note = editor.persist.mode === 'memory' ? h('p', { class: 'ed-hint ed-hint--warn', text: 'This browser is not keeping data between visits, so versions last only until you close the page.' }) : null;

  const dlg = openDialog({ title: 'Version history', content: h('div', { class: 'ed-hist' },
    h('p', { class: 'ed-hint', text: 'Snapshots of this deck, kept on this device. Restoring is undoable.' }),
    h('div', { class: 'ed-hist__save' }, nameInput, saveBtn),
    status, note, list) });
  render();
  return dlg;
}
