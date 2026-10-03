// A deck as one standalone HTML file: the player (JS and CSS) and the deck JSON
// inlined, so it opens from disk or any web host with no other files. Pure
// string building; the runtime is passed in so this can be tested without a
// bundler.

import { escapeHtml } from '../core/util.js';

// Restrictive on purpose: the page needs inline script and style, images from
// the deck, and frames for embeds. Nothing else, and no network requests.
const CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  'img-src data: blob: https:',
  'media-src data: blob: https:',
  'font-src data:',
  'frame-src https: data:',
  "connect-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

// JSON inside a <script> element: "<" must not be able to start "</script" or
// "<!--", and the two line separators break pre-ES2019 parsers.
export function embedJson(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

// Inline script text must not contain "</script", and "<!--" followed later by
// "<script" puts the HTML parser in a state where the real closing tag no longer
// closes the element. A backslash is an identity escape inside the string and
// regex literals those sequences live in, so the code means the same thing.
export function safeScript(js) {
  return js
    .replace(/<!--/g, '<\\!--')
    .replace(/<(\/?)(script)/gi, (m, slash, name) => `<\\${slash}${name}`);
}

export function stripNotes(deck) {
  return { ...deck, slides: deck.slides.map((s) => ({ ...s, notes: '' })) };
}

export function buildStandaloneHtml(deck, { js, css, includeNotes = false }) {
  const shipped = includeNotes ? deck : stripNotes(deck);
  const lang = deck.lang ? ` lang="${escapeHtml(deck.lang)}"` : ' lang="en"';
  const dir = deck.direction === 'rtl' ? ' dir="rtl"' : '';
  return `<!doctype html>
<html${lang}${dir}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<meta name="generator" content="Densight Slides">
<title>${escapeHtml(deck.meta.title)}</title>
<style>html,body{margin:0;height:100%;background:#000}#app{position:fixed;inset:0}</style>
<style>${css}</style>
</head>
<body>
<div id="app"></div>
<script type="application/json" id="deck-data">${embedJson(shipped)}</script>
<script>${safeScript(js)}</script>
</body>
</html>
`;
}
