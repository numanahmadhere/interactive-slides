import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// A misspelt CSS variable does not fail loudly: the rule is just dropped and the UI
// looks broken. Every var(--x) in the app and site styles must be defined somewhere.

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const tokens = read('src/styles/tokens.css');
const files = ['src/editor/editor.css', 'src/shell/shell.css', 'site/site.css', 'src/live/live.css', 'src/player/player.css', 'src/styles/slides.css'];

// Variables that scripts set on elements (style.setProperty('--c', ...), style: '--w:..').
const walk = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : f.endsWith('.js') ? [join(dir, f)] : []));
const fromScripts = new Set(walk(new URL('../src', import.meta.url).pathname).flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/['"`(;\s](--[a-z][a-z0-9-]*)\s*[:'"`,)]/gi)].map((m) => m[1])));

const definedIn = (css) => new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((m) => m[1]));

test('every CSS variable that is used is defined', () => {
  const global = definedIn(tokens);
  for (const f of files) {
    const css = read(f);
    const local = definedIn(css);
    const used = new Set([...css.matchAll(/var\((--[a-z0-9-]+)/gi)].map((m) => m[1]));
    for (const name of used) {
      // slide themes set their --sp-* variables from JavaScript (theme.js), and a few are set inline
      if (name.startsWith('--sp-') || name.startsWith('--ed-stage') || name === '--i' || name === '--w' || name === '--share') continue;
      assert.ok(global.has(name) || local.has(name) || fromScripts.has(name), `${f} uses ${name}, which is not defined`);
    }
  }
});

test('the dark palette redefines every colour token the light one sets', () => {
  const light = tokens.slice(0, tokens.indexOf('@media'));
  const dark = tokens.slice(tokens.indexOf(":root[data-theme='dark'] {"), tokens.indexOf('@media (prefers-reduced-motion'));
  const colourVars = (css) => new Set([...css.matchAll(/(--(?:bg|ink|text|muted|border|surface|ed-[a-z0-9-]+)[a-z0-9-]*)\s*:/g)].map((m) => m[1]));
  const missing = [...colourVars(light)].filter((v) => !colourVars(dark).has(v) && !['--border-blue', '--ed-font'].includes(v));
  assert.deepEqual(missing, [], `these are light-only: ${missing.join(', ')}`);
});

test('both themes are wired: system preference and an explicit choice', () => {
  assert.match(tokens, /@media \(prefers-color-scheme: dark\)[\s\S]*:root:not\(\[data-theme='light'\]\)/);
  assert.match(tokens, /:root\[data-theme='dark'\]/);
  for (const page of ['src/app.html']) assert.match(read(page), /interactive-slides:theme/, `${page} applies the saved theme before painting`);
});
