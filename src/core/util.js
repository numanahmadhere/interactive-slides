// Small helpers shared by the model, renderer and player. No DOM access here
// so everything stays importable from Node tests.

export function uid(prefix = '') {
  const bytes = new Uint8Array(6);
  globalThis.crypto.getRandomValues(bytes);
  let s = '';
  for (const b of bytes) s += b.toString(36).padStart(2, '0');
  return prefix + s.slice(0, 8);
}

export function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

export function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export function str(v, fallback = '', max = 10000) {
  return typeof v === 'string' ? v.slice(0, max) : fallback;
}

export function oneOf(v, allowed, fallback) {
  return allowed.includes(v) ? v : fallback;
}

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeEntities(s) {
  return String(s).replace(/&(#x[\da-f]+|#\d+|[a-z][a-z\d]*);/gi, (m, body) => {
    if (body[0] === '#') {
      const code = body[1].toLowerCase() === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? m;
  });
}

// Plain text from an inline-HTML string, for titles and screen-reader labels.
export function stripTags(html) {
  return decodeEntities(String(html).replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
}
