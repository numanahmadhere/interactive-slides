import { test } from 'node:test';
import assert from 'node:assert/strict';
import PptxGenJS from 'pptxgenjs';
import { parsePptx, pptxToDeck } from '../src/import/pptx.js';
import { parseXml, find, textOf } from '../src/import/xml.js';
import { normalizeDeck } from '../src/core/schema.js';

// 1x1 transparent PNG
const PNG = 'image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

async function sample() {
  const p = new PptxGenJS();
  p.layout = 'LAYOUT_16x9';
  p.title = 'Quarterly review';
  const a = p.addSlide();
  a.addText('Big title', { x: 1, y: 1, w: 8, h: 1, fontSize: 44, bold: true });
  a.addNotes('Say hello first');
  const b = p.addSlide();
  b.addText([{ text: 'One', options: { bullet: true, breakLine: true } }, { text: 'Two & <three>', options: { bullet: true } }], { x: 0.5, y: 1.5, w: 5, h: 2, fontSize: 20 });
  b.addImage({ data: PNG, x: 6, y: 1.5, w: 2, h: 2, altText: 'a dot' });
  b.addText('Plain note line', { x: 0.5, y: 4.5, w: 5, h: 0.5, fontSize: 18 });
  b.addTable([[{ text: 'A' }, { text: 'B' }], [{ text: '1' }, { text: '2' }]], { x: 1, y: 3.6, w: 4 });
  return new Uint8Array(await p.write({ outputType: 'uint8array' }));
}

test('xml reader handles entities, CDATA and prefixes', () => {
  const doc = parseXml('<?xml version="1.0"?><a:r xmlns:a="x" r:id="1"><a:t>1 &lt; 2 &amp; &#65;<![CDATA[<b>]]></a:t></a:r>');
  assert.equal(textOf(find(doc, 't')[0]), '1 < 2 & A<b>');
  assert.equal(find(doc, 'r')[0].attrs['r:id'], '1');
});

test('reads slides, text, bullets, images, tables and notes from a real .pptx', async () => {
  const { slides, aspect, title } = await parsePptx(await sample());
  assert.equal(aspect, '16:9');
  assert.equal(title, 'Quarterly review');
  assert.equal(slides.length, 2);
  const first = slides[0];
  assert.equal(first.notes, 'Say hello first');
  assert.equal(first.blocks[0].type, 'heading');
  assert.match(first.blocks[0].props.text, /Big title/);
  assert.equal(first.layout, 'free');
  const f = first.blocks[0].frame;
  assert.deepEqual([f.x, f.y, f.w], [192, 192, 1536]);
  const second = slides[1];
  const list = second.blocks.find((b) => b.type === 'list');
  assert.deepEqual(list.props.items, ['One', 'Two &amp; &lt;three&gt;']);
  const img = second.blocks.find((b) => b.type === 'image');
  assert.match(img.props.src, /^data:image\/png;base64,/);
  assert.equal(img.props.alt, 'a dot');
  assert.ok(second.blocks.some((b) => b.type === 'text' && /Plain note line/.test(b.props.text)));
  assert.ok(second.blocks.some((b) => b.type === 'text' && /A\s+\|\s+B/.test(b.props.text)));
});

test('the result passes the deck gate unchanged and warns about what it skipped', async () => {
  const { deck, warnings } = await pptxToDeck(await sample(), 'review.pptx');
  const out = normalizeDeck(deck);
  assert.deepEqual(out.warnings, []);
  assert.equal(out.deck.slides.length, 2);
  assert.equal(out.deck.meta.title, 'Quarterly review');
  assert.ok(warnings.some((w) => /table/.test(w)));
  // angle brackets from the file are text, never markup
  assert.ok(!JSON.stringify(out.deck).includes('<three>'));
});

test('rejects files that are not presentations', async () => {
  await assert.rejects(parsePptx(new TextEncoder().encode('not a zip')), /PowerPoint/);
  await assert.rejects(parsePptx(new Uint8Array(0)), /PowerPoint/);
});
