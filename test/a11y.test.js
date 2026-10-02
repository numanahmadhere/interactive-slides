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
