import { escapeHtml } from '../core/util.js';

// An iframe snippet for a deck that is hosted somewhere. Returns null for
// anything that is not an http(s) address.
export function embedCode({ url, title, aspect = '16:9' }) {
  let u;
  try {
    u = new URL(String(url).trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const ratio = aspect === '4:3' ? '4 / 3' : '16 / 9';
  return `<iframe src="${escapeHtml(u.href)}" title="${escapeHtml(title || 'Presentation')}" `
    + `style="width:100%;max-width:960px;aspect-ratio:${ratio};border:0" `
    + 'loading="lazy" allow="fullscreen" allowfullscreen></iframe>';
}
