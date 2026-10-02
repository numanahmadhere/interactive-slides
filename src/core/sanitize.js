// Whitelist sanitizer for the inline rich text stored in decks (headings,
// paragraphs, list items). Decks can be imported from anywhere, so every string
// that reaches innerHTML goes through here. It is string-based rather than
// DOM-based so it behaves the same in the browser and in Node tests.

import { decodeEntities, escapeHtml } from './util.js';

const ALLOWED = new Set(['b', 'strong', 'i', 'em', 'u', 's', 'code', 'mark', 'sub', 'sup', 'a', 'br']);
const DROP_WITH_CONTENT = new Set([
  'script', 'style', 'iframe', 'object', 'embed', 'noscript', 'template',
  'svg', 'math', 'textarea', 'title', 'head', 'frame', 'frameset',
]);

const TAG_RE = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:"[^"]*"|'[^']*'|[^'">])*)>/y;
const HREF_RE = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i;
const INVISIBLE = new RegExp('[\\u0000-\\u0020\\u007f-\\u009f\\u200b-\\u200d\\u2028\\u2029\\ufeff]', 'g');

const LINK_SCHEMES = new Set(['http', 'https', 'mailto', 'tel']);
const IMAGE_DATA_RE = /^data:image\/(?:png|jpe?g|gif|webp|avif|svg\+xml)[;,]/i;

function schemeOf(url) {
  const m = /^([a-z][a-z0-9+.-]*):/i.exec(url.replace(INVISIBLE, ''));
  return m ? m[1].toLowerCase() : null;
}

// Returns a safe URL string, or null. Entities are decoded first so that
// "&#106;avascript:" cannot slip past the scheme check.
export function safeLinkUrl(raw) {
  const url = decodeEntities(String(raw ?? '')).trim();
  if (!url) return null;
  const scheme = schemeOf(url);
  if (scheme === null) return url;
  return LINK_SCHEMES.has(scheme) ? url : null;
}

export function safeImageUrl(raw) {
  const url = decodeEntities(String(raw ?? '')).trim();
  if (!url) return null;
  const scheme = schemeOf(url);
  if (scheme === null || scheme === 'http' || scheme === 'https' || scheme === 'blob') return url;
  return scheme === 'data' && IMAGE_DATA_RE.test(url) ? url : null;
}

export function safeEmbedUrl(raw) {
  const url = decodeEntities(String(raw ?? '')).trim();
  return schemeOf(url) === 'https' ? url : null;
}

function escapeText(text) {
  return text
    .replace(/&(?!(?:#\d+|#x[\da-f]+|[a-z][a-z\d]*);)/gi, '&amp;')
    .replace(/>/g, '&gt;');
}

export function sanitizeInline(input) {
  const src = String(input ?? '');
  const stack = []; // { name, emitted }
  let out = '';
  let i = 0;

  while (i < src.length) {
    const lt = src.indexOf('<', i);
    if (lt === -1) {
      out += escapeText(src.slice(i));
      break;
    }
    out += escapeText(src.slice(i, lt));

    if (src.startsWith('<!--', lt)) {
      const end = src.indexOf('-->', lt + 4);
      i = end === -1 ? src.length : end + 3;
      continue;
    }

    TAG_RE.lastIndex = lt;
    const m = TAG_RE.exec(src);
    if (!m) {
      out += '&lt;';
      i = lt + 1;
      continue;
    }

    i = lt + m[0].length;
    const closing = m[1] === '/';
    const name = m[2].toLowerCase();
    const attrs = m[3];

    if (closing) {
      const idx = stack.map((e) => e.name).lastIndexOf(name);
      if (idx === -1) continue;
      while (stack.length > idx) {
        const e = stack.pop();
        if (e.emitted) out += `</${e.name}>`;
      }
      continue;
    }

    if (DROP_WITH_CONTENT.has(name)) {
      const close = new RegExp(`</${name}\\s*>`, 'ig');
      close.lastIndex = i;
      const end = close.exec(src);
      i = end ? end.index + end[0].length : src.length;
      continue;
    }

    if (!ALLOWED.has(name)) continue; // drop the tag, keep its text

    if (name === 'br') {
      out += '<br>';
      continue;
    }

    if (name === 'a') {
      const h = HREF_RE.exec(attrs);
      const href = h ? safeLinkUrl(h[1] ?? h[2] ?? h[3]) : null;
      if (href) {
        out += `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">`;
        stack.push({ name, emitted: true });
      } else {
        stack.push({ name, emitted: false });
      }
      continue;
    }

    out += `<${name}>`;
    stack.push({ name, emitted: true });
  }

  while (stack.length) {
    const e = stack.pop();
    if (e.emitted) out += `</${e.name}>`;
  }
  return out;
}
