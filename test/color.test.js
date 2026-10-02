import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseColor, toHex, luminance, contrastRatio, mixColors, buildThemeTokens, backgroundVars, isColor, normalizeThemeRef } from '../src/core/theme.js';
import { normalizeDeck } from '../src/core/schema.js';
import * as ops from '../src/editor/ops.js';

test('parseColor understands hex, rgb and hsl', () => {
  assert.deepEqual(parseColor('#2020E8'), [32, 32, 232]);
  assert.deepEqual(parseColor('#fff'), [255, 255, 255]);
  assert.deepEqual(parseColor('#0f0f'), [0, 255, 0]);
  assert.deepEqual(parseColor('rgb(10, 20, 30)'), [10, 20, 30]);
  assert.deepEqual(parseColor('rgba(10 20 30 / 0.5)'), [10, 20, 30]);
  assert.deepEqual(parseColor('hsl(0, 100%, 50%)'), [255, 0, 0]);
  assert.deepEqual(parseColor('hsl(120, 100%, 25%)'), [0, 128, 0]);
  assert.equal(parseColor('red'), null);
  assert.equal(parseColor('url(x)'), null);
  assert.equal(parseColor(undefined), null);
});

test('toHex, luminance and contrast match the WCAG definitions', () => {
  assert.equal(toHex([255, 0, 128]), '#FF0080');
  assert.equal(toHex([300, -5, 0.4]), '#FF0000');
  assert.equal(luminance([0, 0, 0]), 0);
  assert.equal(Math.round(luminance([255, 255, 255]) * 100) / 100, 1);
  assert.equal(Math.round(contrastRatio([0, 0, 0], [255, 255, 255])), 21);
  assert.equal(contrastRatio([10, 10, 10], [10, 10, 10]), 1);
  assert.deepEqual(mixColors([0, 0, 0], [100, 200, 50], 0.5), [50, 100, 25]);
});

test('buildThemeTokens: every text pairing meets AA for a spread of colours', () => {
  const accents = ['#2020E8', '#FFD60A', '#FF3B3B', '#00A86B', '#7A3FF2', '#F5F5F5', '#111111', '#FF8800'];
  const backgrounds = ['#0F1117', '#FFFFFF', '#FAF8F4', '#102A43', '#F5E6C8', '#7A1F3D', '#C8D6E5', '#888888'];
  for (const accent of accents) {
    for (const bg of backgrounds) {
      const t = buildThemeTokens({ accent, bg });
      const c = (a, b) => contrastRatio(parseColor(a), parseColor(b));
      assert.ok(c(t.fg, t.bg) >= 4.5, `fg on ${bg}: ${c(t.fg, t.bg).toFixed(2)}`);
      assert.ok(c(t.muted, t.bg) >= Math.min(4.5, c(t.fg, t.bg)) - 0.01, `muted on ${bg}: ${c(t.muted, t.bg).toFixed(2)}`);
      assert.ok(c(t.accentFg, t.accent) >= 4.5, `text on accent ${accent}: ${c(t.accentFg, t.accent).toFixed(2)}`);
      assert.ok(c(t.accentText, t.bg) >= 4.5 || c(t.accentText, t.bg) >= c(t.accent, t.bg), `accent text on ${bg}: ${c(t.accentText, t.bg).toFixed(2)}`);
    }
  }
});

test('buildThemeTokens output is accepted as theme overrides', () => {
  const tokens = buildThemeTokens({ accent: '#E85D04', bg: '#14213D' });
  const warnings = [];
  const ref = normalizeThemeRef({ id: 'densight-dark', overrides: tokens }, (m) => warnings.push(m));
  assert.deepEqual(warnings, []);
  assert.deepEqual(ref.overrides, tokens);
  assert.equal(buildThemeTokens({ accent: 'nope', bg: '#fff' }), null);
});

test('backgroundVars picks light or dark text for a colour', () => {
  assert.equal(backgroundVars('#101010')['--sp-fg'], '#FFFFFF');
  assert.equal(backgroundVars('#F0F0F0')['--sp-fg'], '#0F1117');
  assert.deepEqual(backgroundVars('not a colour'), {});
});

test('isColor only accepts safe colour syntax', () => {
  assert.ok(isColor('#abc') && isColor('rgb(1,2,3)') && isColor('hsl(10, 20%, 30%)'));
  assert.ok(!isColor('red; background: url(x)') && !isColor('url(x)') && !isColor(''));
});

test('slide backgrounds and brand are normalised', () => {
  const { deck } = normalizeDeck({
    brand: { logo: 'asset:abc', position: 'middle', size: 'huge' },
    slides: [
      { layout: 'blank', background: { color: '#112233' } },
      { layout: 'blank', background: { image: 'asset:x', dim: 500 } },
      { layout: 'blank', background: { color: 'red; x:y', dim: 10 } },
      { layout: 'blank', background: 'nope' },
    ],
  });
  assert.deepEqual(deck.brand, { logo: 'asset:abc', position: 'bottom-right', size: 'md' });
  assert.deepEqual(deck.slides[0].background, { color: '#112233' });
  assert.deepEqual(deck.slides[1].background, { image: 'asset:x', dim: 80 });
  assert.equal('background' in deck.slides[2], false, 'unsafe colour and no image: nothing left');
  assert.equal('background' in deck.slides[3], false);
});

test('ops: theme overrides, brand and slide background', () => {
  const { deck } = normalizeDeck({ slides: [{ id: 's1', layout: 'blank' }] });
  const tokens = buildThemeTokens({ accent: '#E85D04', bg: '#14213D' });
  const themed = ops.setThemeOverrides(deck, tokens);
  assert.equal(themed.theme.overrides.accent, '#E85D04');
  assert.equal(ops.setThemeOverrides(themed, { ...tokens }), themed, 'same values: no change');
  assert.deepEqual(ops.setThemeOverrides(themed, {}).theme.overrides, {});
  // choosing a built-in theme clears custom colours
  assert.deepEqual(ops.setTheme(themed, 'paper').theme.overrides, {});

  const branded = ops.setBrand(deck, { logo: 'asset:logo1', size: 'lg' });
  assert.deepEqual(branded.brand, { logo: 'asset:logo1', position: 'bottom-right', size: 'lg' });
  assert.equal(ops.setBrand(branded, { size: 'lg' }), branded);

  const withBg = ops.setSlideBackground(deck, 's1', { color: '#112233' });
  assert.deepEqual(withBg.slides[0].background, { color: '#112233' });
  assert.equal(ops.setSlideBackground(withBg, 's1', { color: '#112233' }), withBg);
  assert.equal('background' in ops.setSlideBackground(withBg, 's1', null).slides[0], false);
  assert.equal(ops.setSlideBackground(deck, 'missing', { color: '#fff' }), deck);
});
