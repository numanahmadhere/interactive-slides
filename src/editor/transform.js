// Pure geometry for free-form blocks. A box is {x, y, w, h} in slide pixels.
// Nothing here touches the DOM, so it is all unit-tested.

export const MIN_SIZE = 24;

export const boundsOf = (boxes) => {
  if (!boxes.length) return null;
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  const r = Math.max(...boxes.map((b) => b.x + b.w));
  const bt = Math.max(...boxes.map((b) => b.y + b.h));
  return { x, y, w: r - x, h: bt - y };
};

export const moveBox = (box, dx, dy) => ({ ...box, x: box.x + dx, y: box.y + dy });

export const intersects = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

// Handles: n, ne, e, se, s, sw, w, nw. dx/dy are the pointer travel in slide px.
// opts.ratio keeps the aspect ratio (corners); opts.center resizes about the centre;
// opts.min is the smallest side.
export function resizeBox(box, handle, dx, dy, { ratio = false, center = false, min = MIN_SIZE } = {}) {
  const west = handle.includes('w');
  const east = handle.includes('e');
  const north = handle.includes('n');
  const south = handle.includes('s');
  const k = center ? 2 : 1;
  let w = box.w + (east ? dx * k : west ? -dx * k : 0);
  let h = box.h + (south ? dy * k : north ? -dy * k : 0);
  if (ratio && box.w > 0 && box.h > 0) {
    const aspect = box.w / box.h;
    const corner = (east || west) && (north || south);
    if (corner) {
      // The side that moved furthest (relative to its size) leads.
      if (Math.abs(w - box.w) / box.w >= Math.abs(h - box.h) / box.h) h = w / aspect;
      else w = h * aspect;
    } else if (east || west) h = w / aspect;
    else w = h * aspect;
  }
  w = Math.max(min, w);
  h = Math.max(min, h);
  let x = box.x;
  let y = box.y;
  if (center) {
    x = box.x + (box.w - w) / 2;
    y = box.y + (box.h - h) / 2;
  } else {
    if (west) x = box.x + box.w - w;
    if (north) y = box.y + box.h - h;
    if (ratio && !(west || east)) x = box.x + (box.w - w) / 2;
    if (ratio && !(north || south)) y = box.y + (box.h - h) / 2;
  }
  return { x, y, w, h };
}

// Scale a group of boxes from their bounds to new bounds.
export function scaleBoxes(boxes, from, to) {
  const sx = from.w ? to.w / from.w : 1;
  const sy = from.h ? to.h / from.h : 1;
  return boxes.map((b) => ({
    x: to.x + (b.x - from.x) * sx,
    y: to.y + (b.y - from.y) * sy,
    w: Math.max(MIN_SIZE, b.w * sx),
    h: Math.max(MIN_SIZE, b.h * sy),
  }));
}

// mode: left | center | right | top | middle | bottom. `within` is the box to align
// to (the selection's bounds, or the slide when a single block is selected).
export function alignBoxes(boxes, mode, within = boundsOf(boxes)) {
  return boxes.map((b) => {
    switch (mode) {
      case 'left': return { ...b, x: within.x };
      case 'center': return { ...b, x: within.x + (within.w - b.w) / 2 };
      case 'right': return { ...b, x: within.x + within.w - b.w };
      case 'top': return { ...b, y: within.y };
      case 'middle': return { ...b, y: within.y + (within.h - b.h) / 2 };
      case 'bottom': return { ...b, y: within.y + within.h - b.h };
      default: return b;
    }
  });
}

// Equal gaps between three or more boxes, keeping the outer two where they are.
export function distributeBoxes(boxes, axis) {
  if (boxes.length < 3) return boxes;
  const pos = axis === 'x' ? 'x' : 'y';
  const size = axis === 'x' ? 'w' : 'h';
  const order = boxes.map((b, i) => i).sort((a, b) => boxes[a][pos] - boxes[b][pos]);
  const first = boxes[order[0]];
  const last = boxes[order[order.length - 1]];
  const total = last[pos] + last[size] - first[pos];
  const used = order.reduce((n, i) => n + boxes[i][size], 0);
  const gap = (total - used) / (order.length - 1);
  const out = boxes.slice();
  let cursor = first[pos];
  for (const i of order) {
    out[i] = { ...boxes[i], [pos]: cursor };
    cursor += boxes[i][size] + gap;
  }
  return out;
}

export function matchSize(boxes, dim, to) {
  const w = to.w;
  const h = to.h;
  return boxes.map((b) => ({ ...b, ...(dim !== 'h' ? { w } : {}), ...(dim !== 'w' ? { h } : {}) }));
}

// Pick the nudge distance: 1px, or a grid step with Shift.
export const nudgeStep = (shift) => (shift ? 20 : 2);

export const round = (box) => ({ x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.w), h: Math.round(box.h) });

// ---- rotation -------------------------------------------------------------------

const rad = (deg) => (deg * Math.PI) / 180;

// Angle in degrees (0 = pointing up, clockwise) from a centre to a point.
export const angleTo = (center, point) => {
  const deg = (Math.atan2(point.y - center.y, point.x - center.x) * 180) / Math.PI + 90;
  return ((deg % 360) + 360) % 360;
};

// Snap to the nearest step (15 degrees by default) when `on`, and to 0/90/180/270 within 4 degrees always.
export function snapAngle(angle, on, step = 15) {
  let a = on ? Math.round(angle / step) * step : angle;
  for (const target of [0, 90, 180, 270, 360]) if (Math.abs(a - target) <= 4) a = target % 360;
  return ((Math.round(a * 10) / 10 % 360) + 360) % 360;
}

// Resize a box that is rotated by r degrees about its centre. The pointer travel (dx, dy)
// is in slide space; the edge opposite the handle stays where it is on screen.
export function resizeRotated(box, r, handle, dx, dy, opts = {}) {
  const c = Math.cos(rad(r));
  const s = Math.sin(rad(r));
  const local = resizeBox(box, handle, dx * c + dy * s, -dx * s + dy * c, opts);
  const shiftX = local.x + local.w / 2 - (box.x + box.w / 2);
  const shiftY = local.y + local.h / 2 - (box.y + box.h / 2);
  const cx = box.x + box.w / 2 + shiftX * c - shiftY * s;
  const cy = box.y + box.h / 2 + shiftX * s + shiftY * c;
  return { x: cx - local.w / 2, y: cy - local.h / 2, w: local.w, h: local.h };
}

// A frame's children keep their place when a group is resized: scale them with it.
export function scaleChildFrame(frame, sx, sy) {
  const r2 = (n) => Math.round(n * 100) / 100;
  const out = { ...frame, x: r2(frame.x * sx), y: r2(frame.y * sy), w: r2(Math.max(8, frame.w * sx)) };
  if (frame.h) out.h = r2(Math.max(8, frame.h * sy));
  return out;
}
