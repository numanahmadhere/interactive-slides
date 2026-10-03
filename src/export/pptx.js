// PowerPoint export. Each slide becomes a full-size picture of the slide with
// its text hidden, plus real text boxes placed where the text was, so headings,
// paragraphs, lists and quotes stay editable in PowerPoint or Keynote while the
// design matches exactly. Everything else (quizzes, charts, tabs) is part of
// the picture and loses its interactivity; speaker notes carry over.
//
// Positions are measured from the rendered slide: 1920 px wide maps to 13.33 in,
// so 144 px per inch and 1 px = 0.5 pt of type. Fonts follow the deck's font
// name; where it is not installed PowerPoint substitutes, so lines can wrap a
// little differently.

import PptxGenJS from 'pptxgenjs';
import { ASPECTS } from '../core/schema.js';
import { withRenderedSlide, stageToPng } from './png.js';

const PX_PER_INCH = 144;
const toInches = (px) => Math.round((px / PX_PER_INCH) * 1000) / 1000;
const toPoints = (px) => Math.round(px * 0.5 * 10) / 10;
const TEXT_SELECTOR = '.sp-heading, .sp-text, .sp-list, .sp-quote blockquote, .sp-quote figcaption';
const HIDE_TEXT_CSS = '.sp-export-clear, .sp-export-clear * { color: transparent !important; -webkit-text-fill-color: transparent !important; text-decoration-color: transparent !important; } .sp-export-clear li::marker { color: transparent !important; }';

function hexOf(color) {
  const m = /rgba?\(([^)]+)\)/.exec(color);
  if (!m) return '000000';
  return m[1].split(',').slice(0, 3).map((v) => Math.round(parseFloat(v)).toString(16).padStart(2, '0')).join('').toUpperCase();
}

// Inline HTML to PowerPoint text runs, split into paragraphs at line breaks.
export function paragraphsOf(node) {
  const paragraphs = [[]];
  const push = (run) => paragraphs.at(-1).push(run);
  const walk = (n, base) => {
    for (const child of n.childNodes) {
      if (child.nodeType === 3) {
        child.textContent.replace(/\r/g, '').split('\n').forEach((part, i) => {
          if (i > 0) paragraphs.push([]);
          if (part) push({ text: part, options: { ...base } });
        });
      } else if (child.nodeType === 1) {
        const tag = child.tagName.toLowerCase();
        if (tag === 'br') { paragraphs.push([]); continue; }
        const next = { ...base };
        if (tag === 'b' || tag === 'strong') next.bold = true;
        if (tag === 'i' || tag === 'em') next.italic = true;
        if (tag === 'code') next.fontFace = 'Courier New';
        if (tag === 'a' && child.href) next.hyperlink = { url: child.href };
        walk(child, next);
      }
    }
  };
  walk(node, {});
  return paragraphs;
}

function toRuns(paragraphs, { bullet } = {}) {
  const runs = [];
  paragraphs.forEach((para, i) => {
    const line = para.length ? para : [{ text: ' ', options: {} }];
    line.forEach((run, j) => {
      const options = { ...run.options };
      if (j === 0 && bullet) options.bullet = bullet;
      if (j === line.length - 1 && i < paragraphs.length - 1) options.breakLine = true;
      runs.push({ text: run.text, options });
    });
  });
  return runs;
}

function collectText(el, stage) {
  const origin = stage.getBoundingClientRect();
  const items = [];
  for (const node of el.querySelectorAll(TEXT_SELECTOR)) {
    if (node.closest('[hidden]')) continue;
    const rect = node.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) continue;
    const cs = getComputedStyle(node);
    const fontSize = parseFloat(cs.fontSize);
    const lineHeight = parseFloat(cs.lineHeight) || fontSize * 1.3;
    const isList = node.matches('.sp-list');
    const paragraphs = isList ? [...node.children].map((li) => paragraphsOf(li).flat()) : paragraphsOf(node);
    const align = cs.textAlign === 'center' ? 'center' : cs.textAlign === 'right' || (cs.textAlign === 'end' && cs.direction === 'ltr') ? 'right' : 'left';
    items.push({
      node,
      box: { x: rect.left - origin.left, y: rect.top - origin.top, w: rect.width, h: rect.height },
      paragraphs,
      bullet: isList ? (node.tagName === 'OL' ? { type: 'number' } : true) : undefined,
      style: {
        fontSize, align, color: hexOf(cs.color), bold: Number(cs.fontWeight) >= 600,
        lineSpacingMultiple: Math.min(3, Math.max(0.5, Math.round((lineHeight / fontSize) * 100) / 100)),
        spaceAfter: isList ? parseFloat(getComputedStyle(node.children[1] ?? node.children[0] ?? node).marginTop) || 0 : 0,
        fontFace: cs.fontFamily.split(',')[0].replace(/["']/g, '').trim().replace(/ Variable$/, ''),
      },
    });
  }
  return items;
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:/, ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function buildPptx(deck, { includeNotes = false, resolveAsset, onProgress, scale = 1 } = {}) {
  const size = ASPECTS[deck.aspect];
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'DECK', width: toInches(size.width), height: toInches(size.height) });
  pptx.layout = 'DECK';
  pptx.title = deck.meta.title;
  pptx.author = deck.meta.author || 'Densight Slides';

  for (let i = 0; i < deck.slides.length; i++) {
    onProgress?.(i, deck.slides.length);
    const { items, png } = await withRenderedSlide(deck, i, async (el, stage, dims) => {
      const found = collectText(el, stage);
      const style = document.createElement('style');
      style.textContent = HIDE_TEXT_CSS;
      stage.prepend(style);
      for (const item of found) item.node.classList.add('sp-export-clear');
      return { items: found, png: await stageToPng(stage, dims, scale) };
    }, { resolveAsset });

    const slide = pptx.addSlide();
    slide.addImage({ data: await blobToBase64(png), x: 0, y: 0, w: toInches(size.width), h: toInches(size.height) });
    for (const item of items) {
      const { box, style } = item;
      slide.addText(toRuns(item.paragraphs, { bullet: item.bullet }), {
        x: toInches(box.x), y: toInches(box.y), w: toInches(box.w * 1.03), h: toInches(box.h),
        fontFace: style.fontFace, fontSize: toPoints(style.fontSize), color: style.color, bold: style.bold,
        align: style.align, valign: 'top', margin: 0, fit: 'none', wrap: true,
        lineSpacingMultiple: style.lineSpacingMultiple,
        paraSpaceAfter: toPoints(style.spaceAfter),
      });
    }
    const notes = deck.slides[i].notes?.trim();
    if (includeNotes && notes) slide.addNotes(notes);
  }
  onProgress?.(deck.slides.length, deck.slides.length);
  const file = await pptx.write({ outputType: 'blob' });
  return new Blob([file], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
}
