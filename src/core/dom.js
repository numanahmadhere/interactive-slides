// Minimal element builder. Text goes in via textContent; the only way to set
// innerHTML is rich(), which sanitizes first.

import { sanitizeInline } from './sanitize.js';

export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (const c of children) {
    if (c === undefined || c === null || c === false) continue;
    el.append(c);
  }
  return el;
}

export function rich(tag, attrs, html) {
  const el = h(tag, attrs);
  el.innerHTML = sanitizeInline(html);
  return el;
}

export function svgIcon(pathD, { size = 24, label } = {}) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  if (label) svg.setAttribute('aria-label', label);
  else svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', pathD);
  svg.append(p);
  return svg;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

// Builds an SVG element: svgEl('rect', { x: 0, class: 'bar' }, child, ...).
export function svgEl(tag, attrs, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v !== undefined && v !== null && v !== false) el.setAttribute(k, String(v));
  }
  for (const c of children) if (c !== undefined && c !== null && c !== false) el.append(c);
  return el;
}
