import { test } from 'node:test';
import assert from 'node:assert/strict';
import { themeVars, normalizeThemeRef, THEMES } from '../src/core/theme.js';

test('every theme defines the full token set', () => {
  const keys = Object.keys(THEMES['densight-dark'].tokens).sort();
  for (const [id, theme] of Object.entries(THEMES)) {
    assert.deepEqual(Object.keys(theme.tokens).sort(), keys, id);
  }
});

test('themeVars maps tokens to --sp-* custom properties', () => {
  const vars = themeVars({ id: 'densight-dark' });
  assert.equal(vars['--sp-bg'], '#0F1117');
  assert.equal(vars['--sp-accent-text'], '#8F8FFF');
  assert.ok(vars['--sp-font-sans'].includes('Inter'));
});

test('valid overrides win over theme values', () => {
  assert.equal(themeVars({ id: 'paper', overrides: { accent: 'rgb(10, 20, 30)' } })['--sp-accent'], 'rgb(10, 20, 30)');
});

test('invalid overrides are ignored', () => {
  const warnings = [];
  const ref = normalizeThemeRef({ id: 'paper', overrides: { accent: 'url(x)', bg: '#12', fg: 5 } }, (m) => warnings.push(m));
  assert.deepEqual(ref.overrides, {});
  assert.equal(warnings.length, 3);
});
