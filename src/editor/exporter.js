// Turns the working deck into files. Every format starts from a copy of the deck
// with uploaded images swapped for data URIs, so the result stands alone.

import { slugify } from '../core/util.js';
import { js as PLAYER_JS, css as PLAYER_CSS } from 'player-runtime';
import { buildStandaloneHtml } from '../export/html.js';
import { openPrintView } from '../export/print.js';
import { slideToPng, slidesToZip, slideFileName } from '../export/png.js';
import { buildPptx } from '../export/pptx.js';

const BIG_FILE = 25 * 1024 * 1024;

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
}

export class Exporter {
  constructor(editor) {
    this.editor = editor;
  }

  get name() {
    return slugify(this.editor.deck.meta.title);
  }

  async #deck() {
    const deck = await this.editor.assets.inline(this.editor.deck);
    deck.meta = { ...deck.meta, updatedAt: new Date().toISOString() };
    return deck;
  }

  // Each format has a *Blob method that builds the file and a method that also
  // downloads it, so the files can be inspected without the download.

  async jsonBlob() {
    return new Blob([JSON.stringify(await this.#deck(), null, 2)], { type: 'application/json' });
  }

  async json() {
    downloadBlob(await this.jsonBlob(), `${this.name}.deck.json`);
  }

  async htmlBlob({ includeNotes = false } = {}) {
    const html = buildStandaloneHtml(await this.#deck(), { js: PLAYER_JS, css: PLAYER_CSS, includeNotes });
    return new Blob([html], { type: 'text/html' });
  }

  async html(options) {
    const blob = await this.htmlBlob(options);
    downloadBlob(blob, `${this.name}.html`);
    return blob.size > BIG_FILE ? 'The file is large because of the images in it. It will still work, but may be slow to share.' : null;
  }

  // Resolves to false if the browser blocked the window.
  async pdf(options = {}) {
    const win = await openPrintView(await this.#deck(), options);
    return !!win;
  }

  async pngBlob(index, { scale = 1 } = {}) {
    return slideToPng(await this.#deck(), index, { scale });
  }

  async pngCurrent(options) {
    const deck = this.editor.deck;
    const index = this.editor.slideIndex;
    downloadBlob(await this.pngBlob(index, options), `${this.name}-${slideFileName(deck, index)}`);
  }

  async pngZipBlob({ scale = 1, onProgress } = {}) {
    return slidesToZip(await this.#deck(), { scale, onProgress });
  }

  async pngZip(options) {
    downloadBlob(await this.pngZipBlob(options), `${this.name}-slides.zip`);
  }

  async pptxBlob({ includeNotes = false, onProgress } = {}) {
    return buildPptx(await this.#deck(), { includeNotes, onProgress });
  }

  async pptx(options) {
    downloadBlob(await this.pptxBlob(options), `${this.name}.pptx`);
  }
}
