// Slides as PNG images. A slide is drawn by the browser itself: its DOM and the
// slide CSS are wrapped in an SVG <foreignObject>, loaded as an image, and
// painted onto a canvas. No library, and what you get is what the renderer draws.
//
// Images in the deck must already be data: URIs (inline the deck first); remote
// images cannot be loaded into an SVG image and will be missing.

import { renderSlide, activateSlide } from '../core/render.js';
import { applyTheme } from '../core/theme.js';
import { ASPECTS, slideTitle } from '../core/schema.js';
import { slugify } from '../core/util.js';
import { slideCss } from './css.js';
import { zipFiles } from './zip.js';

const IMAGE_TIMEOUT_MS = 8000;

// Wait for pictures and fonts, then let layout settle. This deliberately avoids
// requestAnimationFrame: browsers pause it in background tabs, which would stall
// an export whenever someone switches away. Reading a rect flushes layout.
async function settle(el) {
  const pending = [...el.querySelectorAll('img')].filter((i) => !i.complete).map((i) => new Promise((r) => {
    i.addEventListener('load', r, { once: true });
    i.addEventListener('error', r, { once: true });
  }));
  await Promise.race([Promise.all(pending), new Promise((r) => setTimeout(r, IMAGE_TIMEOUT_MS))]);
  await document.fonts?.ready;
  el.getBoundingClientRect();
  await new Promise((r) => setTimeout(r, 30));
}

// Draw a slide into a detached, off-screen box and hand it to fn(el, stage).
// mutate(el) can adjust the DOM (hide text, for the PPTX background) first.
export async function withRenderedSlide(deck, index, fn, { mutate, resolveAsset } = {}) {
  const { width, height } = ASPECTS[deck.aspect];
  const host = document.createElement('div');
  host.style.cssText = `position:fixed;left:-100000px;top:0;width:${width}px;height:${height}px;pointer-events:none;`;
  const stage = document.createElement('div');
  stage.className = 'sp-image';
  stage.style.cssText = `position:relative;width:${width}px;height:${height}px;overflow:hidden;`;
  applyTheme(stage, deck.theme);
  const el = renderSlide(deck, deck.slides[index], { mode: 'image', resolveAsset, index });
  stage.append(el);
  host.append(stage);
  document.body.append(host);
  const dispose = activateSlide(el);
  try {
    await settle(el);
    mutate?.(el);
    return await fn(el, stage, { width, height });
  } finally {
    dispose();
    host.remove();
  }
}

function toSvg(stage, { width, height }, scale) {
  const markup = new XMLSerializer().serializeToString(stage);
  const css = slideCss().replace(/]]>/g, ']] >');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width * scale}" height="${height * scale}" viewBox="0 0 ${width} ${height}">`
    + `<foreignObject x="0" y="0" width="${width}" height="${height}">`
    + `<div xmlns="http://www.w3.org/1999/xhtml" style="width:${width}px;height:${height}px"><style><![CDATA[${css}]]></style>${markup}</div>`
    + '</foreignObject></svg>';
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('The browser could not draw this slide as an image.'));
    img.src = url;
  });
}

// Paint an already rendered stage to a PNG blob.
export async function stageToPng(stage, size, scale = 1) {
  // A data: URL, not a blob: URL. Browsers treat a blob SVG that contains HTML as
  // cross-origin and refuse to read the canvas back.
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(toSvg(stage, size, scale))}`;
  try {
    const img = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(size.width * scale);
    canvas.height = Math.round(size.height * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode the image.'))), 'image/png'));
  } catch (err) {
    if (err?.name === 'SecurityError') throw new Error('This browser does not allow slides to be saved as images. Try PDF or the web page instead.');
    throw err;
  }
}

export async function slideToPng(deck, index, { scale = 1, mutate, resolveAsset } = {}) {
  return withRenderedSlide(deck, index, (el, stage, size) => stageToPng(stage, size, scale), { mutate, resolveAsset });
}

export function slideFileName(deck, index) {
  const n = String(index + 1).padStart(String(deck.slides.length).length, '0');
  return `${n}-${slugify(slideTitle(deck.slides[index], index), 'slide')}.png`;
}

// All slides as one zip of PNGs.
export async function slidesToZip(deck, { scale = 1, onProgress, resolveAsset } = {}) {
  const files = [];
  for (let i = 0; i < deck.slides.length; i++) {
    onProgress?.(i, deck.slides.length);
    const blob = await slideToPng(deck, i, { scale, resolveAsset });
    files.push({ name: slideFileName(deck, i), data: new Uint8Array(await blob.arrayBuffer()) });
  }
  onProgress?.(deck.slides.length, deck.slides.length);
  return new Blob([zipFiles(files)], { type: 'application/zip' });
}
