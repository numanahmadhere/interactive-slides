// Arrangements: one click lays the blocks of a free-form slide out like a classic
// layout. Each preset is a set of named areas on the 1920 x 1080 canvas; blocks are
// handed to areas by kind (headings to the title, pictures to the picture area, the
// rest to the content areas in reading order). Pure, so it is unit-tested.

export const ARRANGEMENTS = [
  { id: 'title', name: 'Title', areas: { title: { x: 200, y: 330, w: 1520 }, sub: { x: 200, y: 600, w: 1520 } } },
  { id: 'section', name: 'Section', areas: { title: { x: 200, y: 360, w: 1520 }, sub: { x: 200, y: 600, w: 1520 } } },
  { id: 'content', name: 'Title and content', areas: { title: { x: 128, y: 96, w: 1664 }, body: { x: 128, y: 280, w: 1664, h: 680 } } },
  { id: 'two-column', name: 'Two columns', areas: { title: { x: 128, y: 96, w: 1664 }, left: { x: 128, y: 280, w: 780, h: 680 }, right: { x: 1012, y: 280, w: 780, h: 680 } } },
  { id: 'image-text', name: 'Picture left', areas: { media: { x: 0, y: 0, w: 960, h: 1080 }, title: { x: 1048, y: 140, w: 744 }, body: { x: 1048, y: 330, w: 744, h: 600 } } },
  { id: 'image-right', name: 'Picture right', areas: { media: { x: 960, y: 0, w: 960, h: 1080 }, title: { x: 128, y: 140, w: 744 }, body: { x: 128, y: 330, w: 744, h: 600 } } },
  { id: 'full-bleed', name: 'Full picture', areas: { media: { x: 0, y: 0, w: 1920, h: 1080 }, title: { x: 128, y: 780, w: 1664 } } },
];

const TEXTY = new Set(['heading']);
const MEDIA = new Set(['image', 'embed', 'diagram', 'chart', 'hotspots', 'compare']);

export function getArrangement(id) {
  return ARRANGEMENTS.find((a) => a.id === id);
}

// blocks: the slide's top-level blocks (with frames); measured: { [id]: {h} } for auto-height ones.
// -> { [blockId]: frame } for setFrames, or null when the preset is unknown.
export function arrange(blocks, presetId, measured = {}) {
  const preset = getArrangement(presetId);
  if (!preset) return null;
  const areas = preset.areas;
  const order = blocks.filter((b) => b.frame && !b.locked)
    .slice()
    .sort((a, b) => (a.frame.y - b.frame.y) || (a.frame.x - b.frame.x));

  const headings = order.filter((b) => TEXTY.has(b.type));
  const media = order.filter((b) => MEDIA.has(b.type));
  const rest = order.filter((b) => !headings.includes(b) && !media.includes(b));

  const out = {};
  const place = (block, area, extra = {}) => {
    const f = { x: area.x, y: area.y, w: area.w, ...extra };
    if (area.h && (MEDIA.has(block.type) || block.type === 'shape')) f.h = area.h;
    out[block.id] = { ...f, x: Math.round(f.x), y: Math.round(f.y), w: Math.round(f.w), ...(f.h ? { h: Math.round(f.h) } : {}) };
  };

  // Title area: the first heading; later headings flow into the content like any other block.
  const titleArea = areas.title;
  const titleBlock = titleArea ? headings[0] : null;
  if (titleBlock) place(titleBlock, titleArea);
  const flow = [...headings.slice(titleBlock ? 1 : 0), ...rest];

  // Pictures.
  const mediaArea = areas.media;
  media.forEach((block, i) => {
    if (mediaArea && i === 0) place(block, mediaArea, { h: mediaArea.h });
    else flow.push(block);
  });

  // Content areas in order; extra blocks stack under the last one.
  const slots = ['sub', 'body', 'left', 'right'].map((k) => areas[k]).filter(Boolean);
  const stack = (area, list) => {
    let y = area.y;
    for (const block of list) {
      const h = measured[block.id]?.h ?? block.frame?.h ?? 120;
      place(block, { ...area, y }, MEDIA.has(block.type) ? { h: Math.min(area.h ?? 420, 420) } : {});
      out[block.id].y = y;
      y += (MEDIA.has(block.type) ? Math.min(area.h ?? 420, 420) : h) + 32;
    }
  };
  if (!slots.length) {
    stack({ x: 128, y: 300, w: 1664 }, flow);
  } else if (slots.length === 1) {
    stack(slots[0], flow);
  } else {
    // Several areas: split the blocks evenly in reading order.
    const per = Math.max(1, Math.ceil(flow.length / slots.length));
    const groups = slots.map(() => []);
    flow.forEach((block, i) => groups[Math.min(Math.floor(i / per), slots.length - 1)].push(block));
    groups.forEach((list, i) => stack(slots[i], list));
  }
  return out;
}
