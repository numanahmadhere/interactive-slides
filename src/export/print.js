// PDF export: every slide laid out one per page in a new window, then handed to
// the browser's print dialog ("Save as PDF"). The browser does the PDF
// writing, so text stays selectable and fonts are the embedded ones.

import { renderSlide, activateSlide } from '../core/render.js';
import { applyTheme } from '../core/theme.js';
import { ASPECTS } from '../core/schema.js';
import { escapeHtml } from '../core/util.js';
import { slideCss } from './css.js';

export function printCss({ width, height }) {
  return `
@page { size: ${width}px ${height}px; margin: 0; }
* { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; font-family: system-ui, sans-serif; }
.pp-toolbar { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; gap: 12px; padding: 12px 20px; background: #12151d; color: #e8eaf2; font: 14px system-ui; }
.pp-toolbar button { padding: 8px 16px; border: 0; border-radius: 8px; background: #2020e8; color: #fff; font: 600 14px system-ui; cursor: pointer; }
.pp-toolbar button.pp-secondary { background: #2b3246; }
.pp-toolbar span { color: #a3a9bd; }
.pp-page { position: relative; width: ${width}px; height: ${height}px; overflow: hidden; break-after: page; page-break-after: always; }
.pp-page:last-child { break-after: auto; page-break-after: auto; }
@media screen {
  body { background: #0a0c12; }
  .pp-pages { display: grid; justify-items: center; gap: 20px; padding: 20px; }
  .pp-page { zoom: 0.42; box-shadow: 0 0 0 1px #2a3146, 0 12px 32px rgb(0 0 0 / 0.5); }
}
@media print { .pp-toolbar { display: none; } .pp-pages { display: block; } }`;
}

// Resolves to the new window, or null if the browser blocked it.
export async function openPrintView(deck, { resolveAsset, win, autoPrint = true } = {}) {
  const w = win ?? window.open('', '_blank', 'popup=yes,width=1100,height=800');
  if (!w) return null;
  const size = ASPECTS[deck.aspect];
  const doc = w.document;
  doc.open();
  doc.write(`<!doctype html><html lang="${escapeHtml(deck.lang || 'en')}"${deck.direction === 'rtl' ? ' dir="rtl"' : ''}><head><meta charset="utf-8"><title>${escapeHtml(deck.meta.title)}</title></head><body></body></html>`);
  doc.close();

  const style = doc.createElement('style');
  style.textContent = `${slideCss(document)}\n${printCss(size)}`;
  doc.head.append(style);

  const toolbar = doc.createElement('div');
  toolbar.className = 'pp-toolbar';
  const printBtn = doc.createElement('button');
  printBtn.textContent = 'Print or save as PDF';
  const closeBtn = doc.createElement('button');
  closeBtn.className = 'pp-secondary';
  closeBtn.textContent = 'Close';
  const hint = doc.createElement('span');
  hint.textContent = 'In the print dialog choose "Save as PDF", set margins to None and turn on background graphics.';
  toolbar.append(printBtn, closeBtn, hint);

  const pages = doc.createElement('div');
  pages.className = 'pp-pages';
  const disposers = [];
  deck.slides.forEach((slide, i) => {
    const page = doc.createElement('div');
    page.className = 'pp-page sp-print';
    applyTheme(page, deck.theme);
    const el = renderSlide(deck, slide, { mode: 'print', resolveAsset, index: i });
    page.append(el);
    pages.append(page);
  });
  doc.body.append(toolbar, pages);
  for (const el of pages.querySelectorAll('.sp-slide')) disposers.push(activateSlide(el));

  printBtn.addEventListener('click', () => w.print());
  closeBtn.addEventListener('click', () => w.close());
  w.addEventListener('pagehide', () => disposers.forEach((d) => d()));

  // Wait for pictures and fonts so the first page is not printed blank.
  const imgs = [...doc.images].filter((i) => !i.complete).map((i) => new Promise((r) => { i.onload = r; i.onerror = r; }));
  await Promise.race([Promise.all(imgs), new Promise((r) => setTimeout(r, 8000))]);
  await doc.fonts?.ready;
  if (autoPrint) w.setTimeout(() => w.print(), 300);
  return w;
}
