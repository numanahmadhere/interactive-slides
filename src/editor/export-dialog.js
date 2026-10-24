// The Export dialog: one row per format, a notes switch, and an embed-code helper.

import { h } from '../core/dom.js';
import { embedCode } from '../export/embed.js';
import { button, openDialog, select, textInput, toggle, toast } from './ui.js';

export function openExportDialog(editor) {
  const exporter = editor.exporter;
  let includeNotes = false;
  let scale = 1;
  const status = h('div', { class: 'ed-dialog-status', role: 'status', 'aria-live': 'polite' });
  const buttons = [];

  const setStatus = (text, kind = '') => {
    status.textContent = text;
    status.dataset.kind = kind;
  };
  // Runs one export with every button disabled and the outcome reported inline.
  const run = (label, fn) => async () => {
    for (const b of buttons) b.disabled = true;
    setStatus(`${label}...`);
    try {
      const note = await fn((i, n) => setStatus(`${label}: slide ${Math.min(i + 1, n)} of ${n}...`));
      setStatus(note || 'Done.', note ? '' : '');
    } catch (err) {
      console.error(err);
      setStatus(err.message || 'That export failed.', 'error');
      toast('Export failed. Details are in the console.', { kind: 'error' });
    } finally {
      for (const b of buttons) b.disabled = false;
    }
  };
  const action = (label, fn, variant = '') => {
    const b = button({ label, variant, onClick: fn });
    buttons.push(b);
    return b;
  };
  const row = (title, desc, ...actions) => h('div', { class: 'ed-xrow' },
    h('div', { class: 'ed-xrow__title', text: title }), h('div', { class: 'ed-xrow__desc', text: desc }),
    h('div', { class: 'ed-xrow__actions' }, ...actions));

  // Embed code, revealed on demand.
  const embedBox = h('div', { class: 'ed-xrow__extra', hidden: true });
  const urlInput = textInput({ placeholder: 'https://yoursite.com/my-deck.html', spellcheck: false, onInput: () => update() });
  const codeOut = textInput({ multiline: true, rows: 4, spellcheck: false, onInput: () => {} });
  codeOut.readOnly = true;
  codeOut.classList.add('ed-input--mono');
  const copyBtn = button({ label: 'Copy', onClick: async () => {
    try {
      await navigator.clipboard.writeText(codeOut.value);
      setStatus('Embed code copied.');
    } catch {
      codeOut.select();
    }
  } });
  copyBtn.disabled = true;
  function update() {
    const code = embedCode({ url: urlInput.value, title: editor.deck.meta.title, aspect: editor.deck.aspect });
    codeOut.value = code ?? '';
    copyBtn.disabled = !code;
  }
  embedBox.append(
    h('p', { class: 'ed-hint', text: 'Download the web page, upload it to your own hosting, then paste its address here.' }),
    urlInput, h('div', { style: 'height:8px' }), codeOut, h('div', { style: 'margin-top:8px' }, copyBtn));
  const embedRow = row('Embed code', 'An iframe snippet for a page you host yourself.',
    button({ label: 'Show', onClick: (e, el) => { embedBox.hidden = !embedBox.hidden; el.querySelector('span').textContent = embedBox.hidden ? 'Show' : 'Hide'; if (!embedBox.hidden) urlInput.focus(); } }));
  embedRow.append(embedBox);

  const sizeSelect = select({ options: [{ value: 1, label: 'Standard size' }, { value: 2, label: 'Double size' }], value: 1, onChange: (v) => { scale = Number(v); } });
  sizeSelect.setAttribute('aria-label', 'Image size');

  const content = h('div', null,
    toggle({ label: 'Include speaker notes (web page and PowerPoint)', value: false, onChange: (v) => { includeNotes = v; } }),
    row('Web page (HTML)', 'One file that plays anywhere with every interaction working. Share it or host it.',
      action('Download', run('Building the page', async () => exporter.html({ includeNotes })), 'primary')),
    row('PDF', 'One slide per page with everything shown. Opens your browser\'s print dialog.',
      action('Open', run('Preparing the PDF', async () => (await exporter.pdf() ? 'Choose "Save as PDF" in the print dialog.' : (() => { throw new Error('The print window was blocked. Allow pop-ups for this page and try again.'); })())))),
    row('Images (PNG)', 'Every slide as a picture, in one zip, or just the slide you are on.',
      h('div', { class: 'ed-xrow__actions' }, sizeSelect,
        action('Zip', run('Rendering', (progress) => exporter.pngZip({ scale, onProgress: progress }))),
        action('This slide', run('Rendering', () => exporter.pngCurrent({ scale }))))),
    row('PowerPoint (PPTX)', 'Slide pictures with editable text on top. Interactions become still pictures.',
      action('Download', run('Building the deck', (progress) => exporter.pptx({ includeNotes, onProgress: progress })))),
    row('Deck file (JSON)', 'Reopen and keep editing later, here or on another machine. Images included.',
      action('Download', run('Saving', () => exporter.json()))),
    embedRow,
    status);
  openDialog({ title: 'Export', content, wide: true });
}
