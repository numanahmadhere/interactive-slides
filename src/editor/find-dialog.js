// Find and replace: live match counts per slide, click a result to jump to it,
// and one undoable "Replace all".

import { h } from '../core/dom.js';
import { button, openDialog, textInput, toast, toggle } from './ui.js';
import { findMatches, replaceAll } from './search.js';

export function openFindDialog(editor) {
  const opts = { query: '', caseSensitive: false, wholeWord: false, includeNotes: false };
  let replacement = '';

  const findInput = textInput({ placeholder: 'Find', spellcheck: false, onInput: (v) => { opts.query = v; update(); } });
  findInput.setAttribute('aria-label', 'Find');
  const replaceInput = textInput({ placeholder: 'Replace with', spellcheck: false, onInput: (v) => { replacement = v; } });
  replaceInput.setAttribute('aria-label', 'Replace with');

  const summary = h('div', { class: 'ed-find__summary', role: 'status', 'aria-live': 'polite' });
  const results = h('ul', { class: 'ed-find__list' });
  const replaceBtn = button({ label: 'Replace all', variant: 'primary', onClick: () => {
    editor.canvas.finishEdit();
    const { deck, count } = replaceAll(editor.deck, opts, replacement);
    if (!count) return;
    editor.commit(deck, { source: 'find' });
    toast(`Replaced ${count} ${count === 1 ? 'match' : 'matches'}. Undo brings them back.`);
    update();
  } });
  replaceBtn.disabled = true;

  function update() {
    const { total, slides } = findMatches(editor.deck, opts);
    replaceBtn.disabled = total === 0;
    results.replaceChildren();
    if (!opts.query) summary.textContent = 'Type something to find.';
    else if (!total) summary.textContent = 'No matches.';
    else summary.textContent = `${total} ${total === 1 ? 'match' : 'matches'} on ${slides.length} ${slides.length === 1 ? 'slide' : 'slides'}.`;
    for (const s of slides) {
      const open = button({ label: `Slide ${s.index + 1}`, variant: 'ghost', onClick: () => editor.select({ slideId: s.id }) });
      results.append(h('li', { class: 'ed-find__row' },
        open,
        h('span', { class: 'ed-find__count', text: String(s.count) }),
        h('span', { class: 'ed-find__snip' }, ...s.snippets.flatMap((sn, i) => [
          i ? h('span', { class: 'ed-find__sep', text: ' | ' }) : '',
          sn.before, h('mark', { text: sn.match }), sn.after,
        ]))));
    }
  }
  const opt = (label, key) => toggle({ label, value: opts[key], onChange: (v) => { opts[key] = v; update(); } });

  const content = h('div', { class: 'ed-find' },
    h('div', { class: 'ed-find__fields' }, findInput, replaceInput),
    opt('Match case', 'caseSensitive'), opt('Whole word', 'wholeWord'), opt('Include speaker notes', 'includeNotes'),
    summary, results,
    h('div', { class: 'ed-find__actions' }, replaceBtn),
    h('p', { class: 'ed-hint', text: 'Searches headings, text, lists, quiz questions and answers, and other slide text. Links, image addresses and code are left alone.' }));
  const dialog = openDialog({ title: 'Find and replace', content });
  update();
  findInput.focus();
  return dialog;
}
