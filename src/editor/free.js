// Direct manipulation on free-form slides: drag to move, handles to resize, a rubber
// band to select several, snapping guides while you drag. Everything happens in slide
// pixels inside the scaled stage; while a gesture is running only element styles
// change, and one undo step is committed when the pointer is released.

import { h } from '../core/dom.js';
import { getLayout } from '../core/layouts.js';
import * as ops from './ops.js';
import { applyFrame } from '../core/render.js';
import { boundsOf, resizeBox, resizeRotated, scaleBoxes, intersects, angleTo, snapAngle, MIN_SIZE } from './transform.js';
import { snapMove, snapResize } from './snap.js';

const DRAG_THRESHOLD = 3; // screen px before a press becomes a drag
const KEEP_RATIO = new Set(['image', 'icon']);
const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

export class FreeLayer {
  constructor(canvas, editor) {
    this.canvas = canvas;
    this.editor = editor;
    this.overlay = null;
    this.gesture = null;
  }

  get stage() {
    return this.canvas.stage;
  }

  get scale() {
    return this.canvas.scale || 1;
  }

  // True when the slide on the canvas is free-form.
  get active() {
    const slide = this.editor.slide;
    return !!slide && !!getLayout(slide.layout)?.free;
  }

  get slideSize() {
    const el = this.stage;
    return { w: el.offsetWidth, h: el.offsetHeight };
  }

  // Called after every full render: put the overlay back on top of the new slide.
  attach() {
    this.gesture = null;
    this.overlay = null;
    if (!this.active) {
      this.cropping = null;
      return;
    }
    this.overlay = h('div', { class: 'ed-overlay' });
    this.stage.append(this.overlay);
    this.update();
    if (this.cropping) { // a re-render in the middle of cropping keeps the mode on
      if (this.canvas.blockEl(this.cropping.id)) this.#showCropUi();
      else this.cropping = null;
    }
  }

  // ---- geometry ------------------------------------------------------------

  topLevelEl(el) {
    let cur = el?.closest?.('.sp-block');
    while (cur && cur.parentElement && !cur.parentElement.classList.contains('sp-free')) {
      cur = cur.parentElement.closest('.sp-block');
    }
    return cur ?? null;
  }

  // The block's box in slide px, read from the model; auto height comes from the DOM.
  boxOf(block) {
    const f = block.frame;
    const el = this.canvas.blockEl(block.id);
    return { x: f.x, y: f.y, w: f.w, h: f.h ?? el?.offsetHeight ?? MIN_SIZE };
  }

  blocks() {
    return this.editor.slide.blocks.filter((b) => b.frame);
  }

  selectedBlocks() {
    const ids = new Set(this.editor.selectedIds);
    return this.blocks().filter((b) => ids.has(b.id));
  }

  // ---- the selection box ---------------------------------------------------

  update() {
    if (!this.overlay) return;
    this.overlay.style.setProperty('--ed-px', String(1 / this.scale));
    this.overlay.querySelector('.ed-selbox')?.remove();
    const picked = this.selectedBlocks();
    if (!picked.length || this.editor.canvas.isEditing) return;
    const boxes = picked.map((b) => this.boxOf(b));
    const bounds = boundsOf(boxes);
    const single = picked.length === 1 ? picked[0] : null;
    const locked = picked.every((b) => b.locked);
    const box = h('div', { class: `ed-selbox${locked ? ' is-locked' : ''}${picked.length > 1 ? ' is-multi' : ''}` });
    box.style.cssText = `left:${bounds.x}px;top:${bounds.y}px;width:${bounds.w}px;height:${bounds.h}px;`;
    if (single?.frame.r) box.style.transform = `rotate(${single.frame.r}deg)`;
    if (!locked) {
      const autoHeight = picked.every((b) => !b.frame.h);
      for (const handle of HANDLES) {
        if (autoHeight && (handle === 'n' || handle === 's')) continue;
        const grip = h('div', { class: `ed-grip ed-grip--${handle}`, 'data-handle': handle });
        grip.addEventListener('pointerdown', (e) => this.#startResize(e, handle));
        box.append(grip);
      }
    }
    if (single && !locked) {
      const rot = h('div', { class: 'ed-grip ed-grip--rot', 'data-handle': 'rotate', title: 'Rotate (hold Shift for 15 degree steps)' });
      rot.addEventListener('pointerdown', (e) => this.#startRotate(e, single));
      box.append(h('div', { class: 'ed-selbox__stem' }), rot);
    }
    if (picked.length === 1) {
      const label = h('div', { class: 'ed-selbox__size', text: `${Math.round(bounds.w)} x ${Math.round(bounds.h)}` });
      box.append(label);
    }
    this.overlay.append(box);
  }

  #drawGuides(guides) {
    this.overlay.querySelectorAll('.ed-guide').forEach((g) => g.remove());
    for (const g of guides) {
      const line = h('div', { class: `ed-guide ed-guide--${g.axis}` });
      if (g.axis === 'x') line.style.cssText = `left:${g.pos}px;top:${g.from}px;height:${g.to - g.from}px;`;
      else line.style.cssText = `top:${g.pos}px;left:${g.from}px;width:${g.to - g.from}px;`;
      this.overlay.append(line);
    }
  }

  // ---- pointer entry from the canvas ----------------------------------------

  // Returns true when the press was handled here.
  pointerDown(e) {
    if (!this.active || e.button !== 0 || e.target.closest('.ed-overlay')) return false;
    const top = this.topLevelEl(e.target);
    if (this.cropping) {
      if (top?.dataset.block === this.cropping.id) { this.#startCropPan(e, this.cropping.id); return true; }
      this.endCrop();
    }
    if (top) {
      const id = top.dataset.block;
      const selected = this.editor.selectedIds;
      // A press inside a container that is already selected reaches its inner blocks.
      if (selected.length === 1 && selected[0] === id && e.target.closest('.sp-block') !== top) return false;
      return this.#startMove(e, id);
    }
    if (e.target.closest('.ed-section-empty')) return false;
    this.#startMarquee(e);
    return true;
  }

  pointOf(e) {
    return this.#point(e);
  }

  #point(e) {
    const rect = this.stage.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / this.scale, y: (e.clientY - rect.top) / this.scale };
  }

  #track(e, move, up) {
    const pointerId = e.pointerId;
    try { this.stage.setPointerCapture(pointerId); } catch { /* already gone */ }
    const onMove = (ev) => ev.pointerId === pointerId && move(ev);
    const finish = (ev, cancelled) => {
      if (ev.pointerId !== pointerId) return;
      this.stage.removeEventListener('pointermove', onMove);
      this.stage.removeEventListener('pointerup', onUp);
      this.stage.removeEventListener('pointercancel', onCancel);
      try { this.stage.releasePointerCapture(pointerId); } catch { /* already gone */ }
      up(ev, cancelled);
    };
    const onUp = (ev) => finish(ev, false);
    const onCancel = (ev) => finish(ev, true);
    this.stage.addEventListener('pointermove', onMove);
    this.stage.addEventListener('pointerup', onUp);
    this.stage.addEventListener('pointercancel', onCancel);
  }

  // ---- move ----------------------------------------------------------------

  #startMove(e, id) {
    const editor = this.editor;
    const wasSelected = editor.selectedIds.includes(id);
    const only = editor.selectedIds.length === 1 && wasSelected;
    if (e.shiftKey) {
      editor.toggleSelected(id);
    } else if (!wasSelected) {
      editor.select({ blockId: id });
    }
    const picked = this.selectedBlocks().filter((b) => !b.locked);
    const start = { x: e.clientX, y: e.clientY };
    const origin = new Map(picked.map((b) => [b.id, this.boxOf(b)]));
    const others = this.blocks().filter((b) => !origin.has(b.id) && !b.hidden).map((b) => this.boxOf(b));
    const group = origin.size ? boundsOf([...origin.values()]) : null;
    let moved = false;
    this.stage.classList.add('is-gesture');
    this.canvas.toolbar.hide();

    this.#track(e, (ev) => {
      if (!group) return;
      const sdx = ev.clientX - start.x;
      const sdy = ev.clientY - start.y;
      if (!moved && Math.hypot(sdx, sdy) < DRAG_THRESHOLD) return;
      if (!moved) {
        moved = true;
        editor.canvas.finishEdit?.();
      }
      let dx = sdx / this.scale;
      let dy = sdy / this.scale;
      if (ev.shiftKey) { // hold Shift to keep to one axis
        if (Math.abs(dx) > Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      let guides = [];
      if (!ev.altKey) {
        const snap = snapMove({ ...group, x: group.x + dx, y: group.y + dy }, others, this.slideSize);
        dx += snap.dx;
        dy += snap.dy;
        guides = snap.guides;
      }
      for (const b of picked) {
        const o = origin.get(b.id);
        applyFrame(this.canvas.blockEl(b.id), { ...b.frame, x: o.x + dx, y: o.y + dy, h: b.frame.h });
      }
      this.#liveBox({ ...group, x: group.x + dx, y: group.y + dy });
      this.#drawGuides(guides);
    }, (ev, cancelled) => {
      this.stage.classList.remove('is-gesture');
      this.canvas.toolbar.update();
      this.#drawGuides([]);
      if (!moved || cancelled) {
        if (moved) this.canvas.sync({});
        // A plain click on the only selected block starts editing its text.
        if (!moved && !cancelled && only && !e.shiftKey) editor.canvas.editIfPossible(id, e);
        return;
      }
      const frames = {};
      for (const b of picked) {
        const el = this.canvas.blockEl(b.id);
        frames[b.id] = { x: round(parseFloat(el.style.left)), y: round(parseFloat(el.style.top)) };
      }
      editor.commit(ops.setFrames(editor.deck, frames));
    });
    return true;
  }

  #liveBox(b) {
    const box = this.overlay.querySelector('.ed-selbox');
    if (!box) return;
    box.style.left = `${b.x}px`;
    box.style.top = `${b.y}px`;
    box.style.width = `${b.w}px`;
    box.style.height = `${b.h}px`;
    const label = box.querySelector('.ed-selbox__size');
    if (label) label.textContent = `${Math.round(b.w)} x ${Math.round(b.h)}`;
  }

  // ---- resize --------------------------------------------------------------

  #startResize(e, handle) {
    e.preventDefault();
    e.stopPropagation();
    const editor = this.editor;
    const picked = this.selectedBlocks().filter((b) => !b.locked);
    if (!picked.length) return;
    const origin = picked.map((b) => this.boxOf(b));
    const auto = picked.map((b) => !b.frame.h);
    const bounds = boundsOf(origin);
    const allAuto = auto.every(Boolean);
    const single = picked.length === 1 ? picked[0] : null;
    // Corner handles on text-like blocks only change the width.
    const h2 = allAuto ? handle.replace(/[ns]/g, '') : handle;
    if (!h2) return;
    const ratioDefault = single ? KEEP_RATIO.has(single.type) : false;
    const others = this.blocks().filter((b) => !picked.includes(b) && !b.hidden).map((b) => this.boxOf(b));
    const start = { x: e.clientX, y: e.clientY };
    const min = allAuto ? 80 : MIN_SIZE;
    let next = null;
    this.stage.classList.add('is-gesture');
    this.canvas.toolbar.hide();

    this.#track(e, (ev) => {
      const dx = (ev.clientX - start.x) / this.scale;
      const dy = (ev.clientY - start.y) / this.scale;
      const ratio = ratioDefault !== ev.shiftKey && !allAuto;
      const spin = single?.frame.r ?? 0;
      let box = spin ? resizeRotated(bounds, spin, h2, dx, dy, { ratio, min }) : resizeBox(bounds, h2, dx, dy, { ratio, min });
      let guides = [];
      if (!ev.altKey && !spin) {
        const edges = { left: h2.includes('w'), right: h2.includes('e'), top: h2.includes('n'), bottom: h2.includes('s') };
        const snap = snapResize(box, edges, others, this.slideSize);
        if (!(ratioDefault !== ev.shiftKey)) box = snap.box;
        guides = snap.guides;
      }
      box.w = Math.max(min, box.w);
      box.h = Math.max(min, box.h);
      next = picked.length === 1 ? [box] : scaleBoxes(origin, bounds, box);
      picked.forEach((b, i) => {
        const n = next[i];
        const el = this.canvas.blockEl(b.id);
        applyFrame(el, { ...b.frame, x: n.x, y: n.y, w: n.w, h: auto[i] ? undefined : n.h });
        if (b.type === 'group') { // children follow the group while dragging
          const inner = el.querySelector(':scope > .sp-group');
          if (inner) inner.style.cssText = `transform:scale(${n.w / origin[i].w},${n.h / origin[i].h});transform-origin:0 0;`;
        }
      });
      this.#liveBox(box);
      this.#drawGuides(guides);
    }, (ev, cancelled) => {
      this.stage.classList.remove('is-gesture');
      this.canvas.toolbar.update();
      this.#drawGuides([]);
      if (!next || cancelled) {
        this.canvas.sync({});
        return;
      }
      const frames = {};
      picked.forEach((b, i) => {
        const n = next[i];
        frames[b.id] = { x: round(n.x), y: round(n.y), w: round(n.w), ...(auto[i] ? {} : { h: round(n.h) }) };
      });
      editor.commit(ops.setFrames(editor.deck, frames));
    });
  }

  // ---- rotate --------------------------------------------------------------

  #startRotate(e, block) {
    e.preventDefault();
    e.stopPropagation();
    const editor = this.editor;
    const o = this.boxOf(block);
    const center = { x: o.x + o.w / 2, y: o.y + o.h / 2 };
    const el = this.canvas.blockEl(block.id);
    let angle = block.frame.r ?? 0;
    this.stage.classList.add('is-gesture');
    this.canvas.toolbar.hide();
    this.#track(e, (ev) => {
      angle = snapAngle(angleTo(center, this.#point(ev)), ev.shiftKey);
      applyFrame(el, { ...block.frame, r: angle, h: block.frame.h });
      const box = this.overlay.querySelector('.ed-selbox');
      if (box) box.style.transform = `rotate(${angle}deg)`;
      const label = box?.querySelector('.ed-selbox__size');
      if (label) label.textContent = `${Math.round(angle)} deg`;
    }, (ev, cancelled) => {
      this.stage.classList.remove('is-gesture');
      this.canvas.toolbar.update();
      if (cancelled) { this.canvas.sync({}); return; }
      editor.commit(ops.setFrames(editor.deck, { [block.id]: { r: angle } }));
    });
  }

  // ---- crop ------------------------------------------------------------------

  get cropId() {
    return this.cropping?.id ?? null;
  }

  startCrop(id) {
    const hit = ops.findBlock(this.editor.deck, id);
    if (!hit || hit.block.type !== 'image' || !hit.block.props.src) return;
    if (hit.block.props.fit !== 'cover') this.editor.commit(ops.patchBlockProps(this.editor.deck, id, { fit: 'cover' }));
    this.cropping = { id };
    this.editor.select({ blockId: id });
    this.#showCropUi();
  }

  #showCropUi() {
    this.canvas.blockEl(this.cropping.id)?.classList.add('is-cropping');
    this.overlay?.append(h('div', { class: 'ed-crophint', text: 'Drag to move the picture. Scroll to zoom. Press Enter to finish.' }));
    this.canvas.toolbar.hide();
  }

  endCrop() {
    if (!this.cropping) return;
    this.canvas.blockEl(this.cropping.id)?.classList.remove('is-cropping');
    this.overlay?.querySelector('.ed-crophint')?.remove();
    this.cropping = null;
    this.canvas.toolbar.update();
  }

  #cropProps(id) {
    return ops.findBlock(this.editor.deck, id)?.block.props ?? { zoom: 1, fx: 50, fy: 50 };
  }

  #paintCrop(id, p) {
    const img = this.canvas.blockEl(id)?.querySelector('img');
    if (!img) return;
    img.style.objectPosition = `${p.fx}% ${p.fy}%`;
    img.style.transformOrigin = `${p.fx}% ${p.fy}%`;
    img.style.transform = p.zoom > 1 ? `scale(${p.zoom})` : '';
  }

  // Scroll over the picture while cropping.
  cropZoom(deltaY) {
    if (!this.cropping) return false;
    const id = this.cropping.id;
    const p = this.#cropProps(id);
    const zoom = Math.min(4, Math.max(1, Math.round((p.zoom - deltaY * 0.002) * 100) / 100));
    this.editor.commit(ops.patchBlockProps(this.editor.deck, id, { zoom }), { coalesce: `crop:${id}` });
    return true;
  }

  #startCropPan(e, id) {
    const start = { x: e.clientX, y: e.clientY };
    const origin = { ...this.#cropProps(id) };
    const box = this.boxOf(this.selectedBlocks().find((b) => b.id === id) ?? this.blocks().find((b) => b.id === id));
    let latest = origin;
    this.#track(e, (ev) => {
      const dx = (ev.clientX - start.x) / this.scale;
      const dy = (ev.clientY - start.y) / this.scale;
      const k = 100 / Math.max(1, origin.zoom);
      latest = {
        ...origin,
        fx: Math.min(100, Math.max(0, Math.round(origin.fx - (dx / box.w) * k))),
        fy: Math.min(100, Math.max(0, Math.round(origin.fy - (dy / box.h) * k))),
      };
      this.#paintCrop(id, latest);
    }, (ev, cancelled) => {
      if (cancelled) { this.#paintCrop(id, origin); return; }
      this.editor.commit(ops.patchBlockProps(this.editor.deck, id, { fx: latest.fx, fy: latest.fy }));
    });
  }

  // ---- marquee -------------------------------------------------------------

  #startMarquee(e) {
    const editor = this.editor;
    const origin = this.#point(e);
    const start = { x: e.clientX, y: e.clientY };
    const keep = e.shiftKey ? editor.selectedIds : [];
    const band = h('div', { class: 'ed-marquee' });
    let moving = false;
    this.#track(e, (ev) => {
      if (!moving && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < DRAG_THRESHOLD) return;
      moving = true;
      if (!band.isConnected) this.overlay.append(band);
      const p = this.#point(ev);
      const box = { x: Math.min(origin.x, p.x), y: Math.min(origin.y, p.y), w: Math.abs(p.x - origin.x), h: Math.abs(p.y - origin.y) };
      band.style.cssText = `left:${box.x}px;top:${box.y}px;width:${box.w}px;height:${box.h}px;`;
      const hit = this.blocks().filter((b) => !b.hidden && intersects(box, this.boxOf(b))).map((b) => b.id);
      editor.selectMany([...new Set([...keep, ...hit])]);
    }, () => {
      band.remove();
      if (!moving && !e.shiftKey) editor.select({});
      else editor.selectMany(editor.selectedIds);
    });
  }
}

const round = (n) => Math.round(n * 100) / 100;
