// Snapping guides. Given the box being dragged and the other boxes (plus the slide
// itself), find the small shift that lines an edge or centre up with something, and
// the guide lines to draw. Pure; slide pixels throughout.

export const SNAP_DISTANCE = 8;

const xs = (b) => [b.x, b.x + b.w / 2, b.x + b.w];
const ys = (b) => [b.y, b.y + b.h / 2, b.y + b.h];

// Closest candidate for any of `mine` against `targets`; returns {delta, at} or null.
function nearest(mine, targets, threshold) {
  let best = null;
  for (const m of mine) {
    for (const t of targets) {
      const d = t - m;
      if (Math.abs(d) <= threshold && (!best || Math.abs(d) < Math.abs(best.delta))) best = { delta: d, at: t };
    }
  }
  return best;
}


// slide: {w, h}; others: boxes. -> {dx, dy, guides}
export function snapMove(box, others, slide, threshold = SNAP_DISTANCE) {
  const tx = [0, slide.w / 2, slide.w];
  const ty = [0, slide.h / 2, slide.h];
  for (const o of others) {
    tx.push(...xs(o));
    ty.push(...ys(o));
  }
  const sx = nearest(xs(box), tx, threshold);
  const sy = nearest(ys(box), ty, threshold);
  const dx = sx?.delta ?? 0;
  const dy = sy?.delta ?? 0;
  return { dx, dy, guides: guidesFor({ ...box, x: box.x + dx, y: box.y + dy }, others, slide, sx, sy) };
}

// Resizing: `edges` says which sides move, e.g. {left, right, top, bottom} booleans.
export function snapResize(box, edges, others, slide, threshold = SNAP_DISTANCE) {
  const tx = [0, slide.w / 2, slide.w];
  const ty = [0, slide.h / 2, slide.h];
  for (const o of others) {
    tx.push(...xs(o));
    ty.push(...ys(o));
  }
  const mineX = [];
  if (edges.left) mineX.push(box.x);
  if (edges.right) mineX.push(box.x + box.w);
  const mineY = [];
  if (edges.top) mineY.push(box.y);
  if (edges.bottom) mineY.push(box.y + box.h);
  const sx = mineX.length ? nearest(mineX, tx, threshold) : null;
  const sy = mineY.length ? nearest(mineY, ty, threshold) : null;
  const out = { ...box };
  if (sx) {
    if (edges.right) out.w = box.w + sx.delta;
    else { out.x = box.x + sx.delta; out.w = box.w - sx.delta; }
  }
  if (sy) {
    if (edges.bottom) out.h = box.h + sy.delta;
    else { out.y = box.y + sy.delta; out.h = box.h - sy.delta; }
  }
  return { box: out, guides: guidesFor(out, others, slide, sx, sy) };
}

// Lines to draw: a vertical guide at x spanning the aligned boxes, and so on.
function guidesFor(box, others, slide, sx, sy) {
  const guides = [];
  if (sx) {
    const near = [box, ...others.filter((o) => xs(o).some((v) => Math.abs(v - sx.at) < 0.5))];
    const ysv = near.flatMap((b) => [b.y, b.y + b.h]);
    guides.push({ axis: 'x', pos: sx.at, from: Math.min(...ysv), to: Math.max(...ysv) });
  }
  if (sy) {
    const near = [box, ...others.filter((o) => ys(o).some((v) => Math.abs(v - sy.at) < 0.5))];
    const xsv = near.flatMap((b) => [b.x, b.x + b.w]);
    guides.push({ axis: 'y', pos: sy.at, from: Math.min(...xsv), to: Math.max(...xsv) });
  }
  return guides;
}
