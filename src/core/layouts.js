// Slide layouts. A slide has a layout; each block on it names a slot. The
// geometry lives here (grid areas and padding on a 1920x1080 canvas) so the
// editor, player and exports all lay out slides identically.
//
// slot options: area (grid-area, defaults to the slot id), v (vertical
// alignment of stacked blocks), h (text/item alignment), pad, layer, scrim.

const SLOT = (id, label, extra = {}) => ({ id, label, ...extra });

export const LAYOUTS = [
  {
    id: 'title',
    name: 'Title',
    tone: 'default',
    grid: { areas: [['title'], ['subtitle']], columns: '1fr', rows: 'auto auto', gap: '44px', align: 'center' },
    pad: '0 200px',
    slots: [SLOT('title', 'Title', { v: 'end' }), SLOT('subtitle', 'Subtitle', { v: 'start' })],
    starter: () => [
      { slot: 'title', type: 'heading', props: { text: 'Presentation title', level: 1 } },
      { slot: 'subtitle', type: 'text', props: { text: 'Subtitle or presenter', size: 'lg', muted: true } },
    ],
  },
  {
    id: 'section',
    name: 'Section header',
    tone: 'accent',
    grid: { areas: [['title'], ['subtitle']], columns: '1fr', rows: 'auto auto', gap: '36px', align: 'center' },
    pad: '0 200px',
    slots: [SLOT('title', 'Title', { v: 'end' }), SLOT('subtitle', 'Subtitle', { v: 'start' })],
    starter: () => [
      { slot: 'title', type: 'heading', props: { text: 'Section title', level: 1 } },
      { slot: 'subtitle', type: 'text', props: { text: 'What this section covers', size: 'lg' } },
    ],
  },
  {
    id: 'content',
    name: 'Title and content',
    tone: 'default',
    grid: { areas: [['title'], ['body']], columns: '1fr', rows: 'auto 1fr', gap: '56px' },
    pad: '96px 128px 88px',
    slots: [SLOT('title', 'Title'), SLOT('body', 'Content')],
    starter: () => [
      { slot: 'title', type: 'heading', props: { text: 'Slide title', level: 2 } },
      { slot: 'body', type: 'list', props: { items: ['First point', 'Second point', 'Third point'] } },
    ],
  },
  {
    id: 'two-column',
    name: 'Two columns',
    tone: 'default',
    grid: { areas: [['title', 'title'], ['left', 'right']], columns: '1fr 1fr', rows: 'auto 1fr', gap: '56px 96px' },
    pad: '96px 128px 88px',
    slots: [SLOT('title', 'Title'), SLOT('left', 'Left'), SLOT('right', 'Right')],
    starter: () => [
      { slot: 'title', type: 'heading', props: { text: 'Slide title', level: 2 } },
      { slot: 'left', type: 'text', props: { text: 'Left column' } },
      { slot: 'right', type: 'text', props: { text: 'Right column' } },
    ],
  },
  {
    id: 'image-text',
    name: 'Image and text',
    tone: 'default',
    grid: { areas: [['media', 'title'], ['media', 'body']], columns: '1fr 1fr', rows: 'auto 1fr', gap: '0' },
    pad: '0',
    slots: [
      SLOT('media', 'Image', { pad: '0' }),
      SLOT('title', 'Title', { pad: '96px 128px 0 96px' }),
      SLOT('body', 'Content', { pad: '48px 128px 88px 96px' }),
    ],
    starter: () => [
      { slot: 'media', type: 'image', props: { src: '', alt: '', fit: 'cover' } },
      { slot: 'title', type: 'heading', props: { text: 'Slide title', level: 2 } },
      { slot: 'body', type: 'list', props: { items: ['First point', 'Second point'] } },
    ],
  },
  {
    id: 'full-bleed',
    name: 'Full-bleed image',
    tone: 'default',
    grid: { areas: [['stack']], columns: '1fr', rows: '1fr', gap: '0' },
    pad: '0',
    slots: [
      SLOT('media', 'Image', { area: 'stack', layer: 0, pad: '0' }),
      SLOT('overlay', 'Caption', { area: 'stack', layer: 1, v: 'end', pad: '0 128px 96px', scrim: true }),
    ],
    starter: () => [
      { slot: 'media', type: 'image', props: { src: '', alt: '', fit: 'cover' } },
      { slot: 'overlay', type: 'heading', props: { text: 'Caption', level: 2 } },
    ],
  },
  {
    id: 'blank',
    name: 'Blank',
    tone: 'default',
    grid: { areas: [['main']], columns: '1fr', rows: '1fr', gap: '0' },
    pad: '96px 128px',
    slots: [SLOT('main', 'Content')],
    starter: () => [],
  },
];

const BY_ID = new Map(LAYOUTS.map((l) => [l.id, l]));

export function getLayout(id) {
  return BY_ID.get(id);
}

export function listLayouts() {
  return LAYOUTS;
}
