// PowerPoint (.pptx) import. Google Slides decks arrive the same way: File >
// Download > Microsoft PowerPoint. We read what maps cleanly onto our blocks (titles,
// text, bullet lists, pictures, speaker notes, positions) and say plainly what we
// skip (charts, SmartArt, video, animations, master styling).

import { readZip } from './unzip.js';
import { parseXml, kid, kids, find, textOf } from './xml.js';
import { createBlock } from '../core/blocks/index.js';
import { uid, escapeHtml } from '../core/util.js';

const MAX_SLIDES = 300;
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };

const dirname = (p) => p.slice(0, p.lastIndexOf('/') + 1);
function resolve(base, target) {
  if (target.startsWith('/')) return target.slice(1);
  const parts = (dirname(base) + target).split('/');
  const out = [];
  for (const part of parts) {
    if (part === '..') out.pop();
    else if (part && part !== '.') out.push(part);
  }
  return out.join('/');
}

function toBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export async function parsePptx(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const zip = readZip(bytes);
  const warnings = [];
  const skipped = new Set();

  const read = async (name) => (zip.has(name) ? zip.get(name)() : null);
  const xml = async (name) => {
    const data = await read(name);
    return data ? parseXml(new TextDecoder().decode(data)) : null;
  };
  const relsOf = async (part) => {
    const rels = await xml(`${dirname(part)}_rels/${part.slice(part.lastIndexOf('/') + 1)}.rels`);
    const map = new Map();
    for (const r of find(rels, 'Relationship')) {
      if (r.attrs.TargetMode === 'External') continue;
      map.set(r.attrs.Id, { type: r.attrs.Type ?? '', path: resolve(part, r.attrs.Target ?? '') });
    }
    return map;
  };

  const presentation = await xml('ppt/presentation.xml');
  if (!presentation) throw new Error('That is not a PowerPoint file (.pptx).');
  const size = kid(kid(presentation, 'presentation'), 'sldSz')?.attrs ?? {};
  const cx = Number(size.cx) || 12192000;
  const cy = Number(size.cy) || 6858000;
  const ratio = cx / cy;
  const aspect = Math.abs(ratio - 16 / 9) < Math.abs(ratio - 4 / 3) ? '16:9' : '4:3';
  const width = aspect === '16:9' ? 1920 : 1440;
  const scale = width / cx;

  const presRels = await relsOf('ppt/presentation.xml');
  const order = find(kid(kid(presentation, 'presentation'), 'sldIdLst'), 'sldId')
    .map((s) => presRels.get(s.attrs['r:id'])?.path)
    .filter(Boolean);
  if (!order.length) throw new Error('No slides were found in that file.');
  if (order.length > MAX_SLIDES) warnings.push(`Only the first ${MAX_SLIDES} slides were imported.`);

  const slides = [];
  let imageBudget = 40 * 1024 * 1024;
  for (const part of order.slice(0, MAX_SLIDES)) {
    const doc = await xml(part);
    if (!doc) continue;
    const sld = kid(doc, 'sld');
    if (sld?.attrs.show === '0') { warnings.push(`Slide ${slides.length + 1} was hidden in PowerPoint and was imported as a normal slide.`); }
    const rels = await relsOf(part);
    const layoutPath = [...rels.values()].find((r) => /slideLayout$/.test(r.type))?.path;
    const layout = layoutPath ? await xml(layoutPath) : null;
    const layoutRels = layoutPath ? await relsOf(layoutPath) : new Map();
    const masterPath = [...layoutRels.values()].find((r) => /slideMaster$/.test(r.type))?.path;
    const master = masterPath ? await xml(masterPath) : null;

    const placeholders = (root) => find(root, 'sp');
    const inherited = (ph) => {
      for (const root of [layout, master]) {
        if (!root) continue;
        for (const sp of placeholders(root)) {
          const p = find(kid(kid(sp, 'nvSpPr'), 'nvPr'), 'ph')[0];
          if (!p) continue;
          const sameIdx = ph.idx !== undefined && p.attrs.idx === ph.idx;
          const sameType = ph.idx === undefined && (p.attrs.type ?? 'body') === (ph.type ?? 'body');
          const xfrm = kid(kid(sp, 'spPr'), 'xfrm');
          if ((sameIdx || sameType) && xfrm) return xfrm;
        }
      }
      return null;
    };

    const blocks = [];
    let notes = '';
    const tree = kid(kid(sld, 'cSld'), 'spTree');

    const frameOf = (xfrm, minH = false) => {
      const off = kid(xfrm, 'off')?.attrs;
      const ext = kid(xfrm, 'ext')?.attrs;
      if (!off || !ext) return null;
      const w = Math.max(40, Math.round(Number(ext.cx) * scale));
      const f = { x: Math.max(0, Math.round(Number(off.x) * scale)), y: Math.max(0, Math.round(Number(off.y) * scale)), w };
      if (!minH) f.h = Math.max(24, Math.round(Number(ext.cy) * scale));
      const rot = Number(xfrm.attrs.rot);
      if (rot) f.r = Math.round(rot / 60000) % 360;
      return f;
    };

    const paragraphsOfBody = (body, placeholder) => {
      const out = [];
      for (const p of kids(body, 'p')) {
        const pPr = kid(p, 'pPr');
        let html = '';
        let size = 0;
        for (const run of p.children) {
          if (run.name === 'br') { html += '<br>'; continue; }
          if (run.name !== 'r' && run.name !== 'fld') continue;
          const t = escapeHtml(textOf(kid(run, 't')));
          if (!t) continue;
          const rPr = kid(run, 'rPr');
          const sz = Number(rPr?.attrs.sz) / 100;
          if (sz > size) size = sz;
          let h = t;
          if (rPr?.attrs.u && rPr.attrs.u !== 'none') h = `<u>${h}</u>`;
          if (rPr?.attrs.i === '1') h = `<i>${h}</i>`;
          if (rPr?.attrs.b === '1') h = `<b>${h}</b>`;
          html += h;
        }
        if (!html.replace(/<br>/g, '').trim()) { out.push(null); continue; }
        const numbered = !!kid(pPr, 'buAutoNum');
        const bulleted = !kid(pPr, 'buNone') && (numbered || !!kid(pPr, 'buChar') || (placeholder && placeholder !== 'title' && placeholder !== 'ctrTitle' && placeholder !== 'subTitle'));
        out.push({ html, size, bullet: bulleted, numbered, align: { ctr: 'center', r: 'end' }[pPr?.attrs.algn] });
      }
      return out;
    };

    const pushText = (paras, frame, ph) => {
      const lines = paras.filter(Boolean);
      if (!lines.length) return;
      const size = Math.max(...lines.map((l) => l.size || 0));
      const isTitle = ph.type === 'title' || ph.type === 'ctrTitle';
      const align = lines[0].align ?? 'start';
      if (isTitle) {
        const text = lines.map((l) => l.html).join('<br>');
        blocks.push({ ...createBlock('heading', { props: { text, level: ph.type === 'ctrTitle' || size >= 40 ? 1 : 2, align } }), frame });
        return;
      }
      if (lines.every((l) => l.bullet)) {
        blocks.push({ ...createBlock('list', { props: { items: lines.map((l) => l.html), ordered: lines[0].numbered, size: size >= 26 ? 'lg' : size && size <= 15 ? 'sm' : 'md' } }), frame });
        return;
      }
      const big = size >= 32 && lines.length === 1;
      const text = lines.map((l) => l.html).join('<br>');
      if (big) blocks.push({ ...createBlock('heading', { props: { text, level: size >= 40 ? 1 : 2, align } }), frame });
      else blocks.push({ ...createBlock('text', { props: { text, size: size >= 24 ? 'lg' : size && size <= 14 ? 'sm' : 'md', align } }), frame });
    };

    const walk = async (nodes) => {
      for (const node of nodes) {
        if (node.name === 'sp') {
          const phNode = find(kid(kid(node, 'nvSpPr'), 'nvPr'), 'ph')[0];
          const ph = phNode?.attrs ?? {};
          const isPh = !!phNode;
          if (isPh && ['sldNum', 'dt', 'ftr'].includes(ph.type)) continue;
          const xfrm = kid(kid(node, 'spPr'), 'xfrm') ?? (isPh ? inherited(ph) : null);
          const frame = frameOf(xfrm, true) ?? { x: 128, y: 128 + blocks.length * 40, w: 1664 };
          const body = kid(node, 'txBody');
          const paras = body ? paragraphsOfBody(body, isPh ? (ph.type ?? 'body') : '') : [];
          if (paras.some(Boolean)) pushText(paras, frame, ph);
          else if (kid(kid(node, 'spPr'), 'solidFill') || kid(kid(node, 'spPr'), 'gradFill')) skipped.add('decorative shapes');
        } else if (node.name === 'pic') {
          const embed = kid(kid(node, 'blipFill'), 'blip')?.attrs['r:embed'];
          const target = rels.get(embed)?.path;
          const ext = target?.split('.').pop().toLowerCase();
          const frame = frameOf(kid(kid(node, 'spPr'), 'xfrm'));
          if (!target || !frame) continue;
          if (!MIME[ext]) { skipped.add(`${ext?.toUpperCase() || 'unknown'} images`); continue; }
          const data = await read(target);
          if (!data || data.length > MAX_IMAGE_BYTES || data.length > imageBudget) { skipped.add('very large images'); continue; }
          imageBudget -= data.length;
          const alt = kid(kid(node, 'nvPicPr'), 'cNvPr')?.attrs.descr ?? '';
          blocks.push({ ...createBlock('image', { props: { src: `data:${MIME[ext]};base64,${toBase64(data)}`, alt, fit: 'contain' } }), frame });
        } else if (node.name === 'grpSp') {
          await walk(node.children);
        } else if (node.name === 'graphicFrame') {
          const table = find(node, 'tbl')[0];
          if (table) {
            const rows = kids(table, 'tr').map((tr) => kids(tr, 'tc').map((tc) => textOf(tc).trim()));
            const frame = frameOf(kid(node, 'xfrm'), true) ?? { x: 128, y: 300, w: 1664 };
            if (rows.length) {
              blocks.push({ ...createBlock('text', { props: { text: rows.map((r) => escapeHtml(r.join('   |   '))).join('<br>'), size: 'md' } }), frame });
              skipped.add('table formatting (tables become plain text)');
            }
          } else if (find(node, 'chart').length) skipped.add('charts');
          else skipped.add('SmartArt and embedded objects');
        } else if (node.name === 'contentPart') skipped.add('embedded media');
      }
    };
    await walk(tree?.children ?? []);

    const notesPath = [...rels.values()].find((r) => /notesSlide$/.test(r.type))?.path;
    if (notesPath) {
      const nd = await xml(notesPath);
      for (const sp of find(nd, 'sp')) {
        const t = find(kid(kid(sp, 'nvSpPr'), 'nvPr'), 'ph')[0]?.attrs.type;
        if (t === 'body') notes = kids(kid(sp, 'txBody'), 'p').map((p) => textOf(p)).join('\n').trim();
      }
    }
    // Reading order: top to bottom, then left to right (PowerPoint's own order is z-order).
    blocks.sort((a, b) => a.frame.y - b.frame.y || a.frame.x - b.frame.x);
    slides.push({ id: uid('s_'), layout: 'free', blocks: blocks.map((b) => ({ ...b, slot: 'free' })), notes });
  }

  if (skipped.size) warnings.push(`Not imported: ${[...skipped].join(', ')}. Everything else came across.`);
  const core = await xml('docProps/core.xml');
  const title = textOf(find(core, 'title')[0]).trim();
  return { title, aspect, slides, warnings };
}

// -> a deck object ready for normalizeDeck
export async function pptxToDeck(input, fileName = '') {
  const { title, aspect, slides, warnings } = await parsePptx(input);
  const now = new Date().toISOString();
  const fallback = fileName.replace(/\.pptx?$/i, '').trim();
  return {
    warnings,
    deck: {
      version: 1,
      meta: { title: title || fallback || 'Imported deck', author: '', createdAt: now, updatedAt: now },
      aspect,
      transition: 'fade',
      slides,
    },
  };
}
