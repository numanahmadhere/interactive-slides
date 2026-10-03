import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { contrastRatio, parseColor } from '../src/core/theme.js';

// Reads the phone pages' real colour tokens from live.css and checks WCAG contrast
// in both colour schemes: 4.5:1 for text, 3:1 for control outlines and focus rings.

const css = readFileSync(new URL('../src/live/live.css', import.meta.url), 'utf8');
const tokens = (block) => Object.fromEntries([...block.matchAll(/--lv-([a-z-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]));
const light = tokens(css.slice(0, css.indexOf('@media')));
const dark = { ...light, ...tokens(css.slice(css.indexOf('@media'), css.indexOf('.lv-head'))) };
const ratio = (a, b) => contrastRatio(parseColor(a), parseColor(b));

for (const [name, t] of [['light', light], ['dark', dark]]) {
  test(`phone pages, ${name} mode: text contrast`, () => {
    assert.ok(ratio(t.fg, t.bg) >= 4.5, 'body text');
    assert.ok(ratio(t.muted, t.bg) >= 4.5, 'muted text on the page');
    assert.ok(ratio(t.muted, t.surface) >= 4.5, 'muted text on cards');
    assert.ok(ratio(t['accent-fg'], t.accent) >= 4.5, 'text on the accent button');
  });
  test(`phone pages, ${name} mode: controls and focus are visible`, () => {
    assert.ok(ratio(t.control, t.surface) >= 3, 'option outlines on cards');
    assert.ok(ratio(t.control, t.bg) >= 3, 'pad outlines on the page');
    assert.ok(ratio(t.accent, t.surface) >= 3, 'focus ring on cards');
    assert.ok(ratio(t.accent, t.bg) >= 3, 'focus ring on the page');
  });
}

test('the audience page does not promise keyboard behaviour it lacks', () => {
  const src = readFileSync(new URL('../src/live/audience.js', import.meta.url), 'utf8');
  assert.ok(!/radiogroup|role: prompt\.multi \? 'checkbox' : 'radio'/.test(src), 'radio and checkbox roles imply arrow-key handling');
  assert.match(src, /'aria-pressed'/);
});

// ---- the shared design tokens (home page, dashboard, editor) -----------------------

const tokensCss = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8');
// First :root block is light; the explicit [data-theme='dark'] block is the dark palette.
const readVars = (block) => Object.fromEntries([...block.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\b/g)].map((m) => [m[1], m[2]]));
const lightT = readVars(tokensCss.slice(0, tokensCss.indexOf('@media')));
const darkStart = tokensCss.indexOf(":root[data-theme='dark'] {");
const darkT = { ...lightT, ...readVars(tokensCss.slice(darkStart, tokensCss.indexOf('@media (prefers-reduced-motion')) ) };

for (const [name, t] of [['light', lightT], ['dark', darkT]]) {
  test(`design tokens, ${name}: text on every surface`, () => {
    for (const surface of ['bg', 'bg-alt', 'surface', 'surface-2', 'bg-sunk']) {
      assert.ok(ratio(t.ink, t[surface]) >= 7, `ink on ${surface}`);
      assert.ok(ratio(t.text, t[surface]) >= 4.5, `body text on ${surface}`);
      assert.ok(ratio(t.muted, t[surface]) >= 4.5, `muted text on ${surface} (${ratio(t.muted, t[surface]).toFixed(2)})`);
      assert.ok(ratio(t['blue-text'], t[surface]) >= 4.5, `blue text on ${surface} (${ratio(t['blue-text'], t[surface]).toFixed(2)})`);
    }
    assert.ok(ratio(t['on-blue'], t.blue) >= 4.5, 'text on the brand button');
    assert.ok(ratio(t.danger, t.surface) >= 4.5, 'error text');
    assert.ok(ratio(t.success, t.surface) >= 4.5, 'success text');
    assert.ok(ratio(t['warn-text'], t['warn-bg']) >= 4.5, 'warning text');
  });
  test(`editor chrome, ${name}: text, controls and focus`, () => {
    for (const panel of ['ed-bg', 'ed-panel', 'ed-panel-2', 'ed-field', 'ed-raised']) {
      assert.ok(ratio(t['ed-text'], t[panel]) >= 7, `text on ${panel}`);
      assert.ok(ratio(t['ed-muted'], t[panel]) >= 4.5, `muted on ${panel} (${ratio(t['ed-muted'], t[panel]).toFixed(2)})`);
    }
    assert.ok(ratio(t['ed-accent-text'], t['ed-panel']) >= 4.5, 'accent text on the panel');
    assert.ok(ratio(t['ed-danger'], t['ed-panel']) >= 4.5, 'danger text on the panel');
    assert.ok(ratio(t['ed-focus'], t['ed-panel']) >= 3, 'focus ring on the panel');
    assert.ok(ratio(t['ed-focus'], t['ed-canvas']) >= 3, 'focus ring on the canvas');
    assert.ok(ratio('#FFFFFF', t['ed-accent']) >= 4.5, 'white on the primary button');
    assert.ok(ratio(t['ed-warn-text'], t['ed-warn-bg']) >= 4.5, 'warning text');
  });
}
