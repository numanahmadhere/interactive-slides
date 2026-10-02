// Find and replace across a deck. Every text string in every block (including
// blocks nested in tabs and columns) is searched; strings that are really
// identifiers, links or settings are skipped by key. Rich text is matched on its
// visible text only, so a search can never reach into a tag or an entity.

import { decodeEntities, escapeHtml } from '../core/util.js';

// Property names that hold settings, references or code rather than prose.
const SKIP = new Set([
  'id', 'type', 'slot', 'src', 'url', 'slide', 'language', 'ratio', 'size', 'align', 'style', 'mode', 'action', 'fit',
  'before', 'after', 'key', 'kind', 'fill', 'direction', 'layout', 'color', 'format', 'name', 'width', 'position',
  'formula', 'html', 'css', 'js', 'level', 'transition', 'theme', 'aspect', 'logo', 'image',
]);

const RICHISH = /<\/?[a-z][^>]*>|&(?:#\d+|#x[\da-f]+|[a-z][a-z\d]*);/i;
const MAX_SNIPPETS = 2;

export function makeMatcher({ query, caseSensitive = false, wholeWord = false }) {
  if (!query) return null;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const flags = `g${caseSensitive ? '' : 'i'}u`;
  if (!wholeWord) return new RegExp(escaped, flags);
  try {
    return new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, flags);
  } catch {
    // Safari before 16.4 has no lookbehind: \b is a close second for most words.
    return new RegExp(`\\b${escaped}\\b`, flags);
  }
}

const plainOf = (s) => (RICHISH.test(s) ? decodeEntities(s.replace(/<[^>]*>/g, '')) : s);

// Replace within one string. Returns { out, count }.
function replaceIn(s, re, replacement) {
  if (!RICHISH.test(s)) {
    let count = 0;
    const out = s.replace(re, () => { count++; return replacement; });
    return { out, count };
  }
  let count = 0;
  const out = s.split(/(<[^>]*>)/).map((part) => {
    if (part.startsWith('<') && part.endsWith('>')) return part;
    const text = decodeEntities(part);
    let hit = 0;
    const replaced = text.replace(re, () => { hit++; return replacement; });
    if (!hit) return part;
    count += hit;
    return escapeHtml(replaced).replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  }).join('');
  return { out, count };
}

// Visit every prose string under value; visit(string) returns the same string or a new one.
function walk(value, key, visit) {
  if (typeof value === 'string') return SKIP.has(key) ? value : visit(value);
  if (Array.isArray(value)) {
    let changed = false;
    const out = value.map((v) => {
      const next = walk(v, key, visit);
      if (next !== v) changed = true;
      return next;
    });
    return changed ? out : value;
  }
  if (value && typeof value === 'object') {
    let changed = false;
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const next = walk(v, k, visit);
      out[k] = next;
      if (next !== v) changed = true;
    }
    return changed ? out : value;
  }
  return value;
}

// -> { total, slides: [{ index, id, count, snippets }] }
export function findMatches(deck, opts) {
  const re = makeMatcher(opts);
  const result = { total: 0, slides: [] };
  if (!re) return result;
  deck.slides.forEach((slide, index) => {
    let count = 0;
    const snippets = [];
    const visit = (s) => {
      const text = plainOf(s);
      for (const m of text.matchAll(re)) {
        count++;
        if (snippets.length < MAX_SNIPPETS) {
          const from = Math.max(0, m.index - 24);
          const to = Math.min(text.length, m.index + m[0].length + 24);
          snippets.push({ before: (from > 0 ? '…' : '') + text.slice(from, m.index), match: m[0], after: text.slice(m.index + m[0].length, to) + (to < text.length ? '…' : '') });
        }
      }
      return s;
    };
    walk(slide.blocks, 'blocks', visit);
    if (opts.includeNotes && slide.notes) visit(slide.notes);
    if (count) {
      result.slides.push({ index, id: slide.id, count, snippets });
      result.total += count;
    }
  });
  return result;
}

// -> { deck, count }. Untouched slides and blocks keep their identity.
export function replaceAll(deck, opts, replacement) {
  const re = makeMatcher(opts);
  if (!re) return { deck, count: 0 };
  let count = 0;
  const visit = (s) => {
    const { out, count: n } = replaceIn(s, re, replacement);
    count += n;
    return n ? out : s;
  };
  let changed = false;
  const slides = deck.slides.map((slide) => {
    const blocks = walk(slide.blocks, 'blocks', visit);
    let notes = slide.notes;
    if (opts.includeNotes && notes) notes = visit(notes);
    if (blocks === slide.blocks && notes === slide.notes) return slide;
    changed = true;
    return { ...slide, blocks, notes };
  });
  return { deck: changed ? { ...deck, slides } : deck, count };
}
