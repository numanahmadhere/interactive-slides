import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// The PNG export draws a slide inside a stage element. If that stage borrowed a
// class that a block also uses (it once used "sp-image"), the block's CSS styled
// the whole stage and the logo and background pictures vanished from exports.
test('the export stage class is not a block class', () => {
  const png = readFileSync(new URL('../src/export/png.js', import.meta.url), 'utf8');
  const stage = /stage\.className = '([\w-]+)'/.exec(png)?.[1];
  assert.ok(stage, 'stage class found');
  const blockDir = new URL('../src/core/blocks/', import.meta.url);
  for (const file of readdirSync(blockDir)) {
    const src = readFileSync(new URL(file, blockDir), 'utf8');
    assert.ok(!new RegExp(`class: \`?'?${stage}[\\s'\`$]`).test(src), `${file} uses the export stage class "${stage}"`);
  }
  const css = readFileSync(new URL('../src/styles/slides.css', import.meta.url), 'utf8');
  assert.ok(!new RegExp(`\\.${stage}\\s+img`).test(css), 'no rule styles images inside the stage');
});
