// A deck that touches every layout and block type, used to exercise the
// renderer and player by hand and in tests.

const svg = (body, w = 1600, h = 1200) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">${body}</svg>`,
  )}`;

const artSquare = svg(`
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#2020E8"/><stop offset="1" stop-color="#8F8FFF"/>
    </linearGradient>
  </defs>
  <rect width="1600" height="1200" fill="url(#g)"/>
  <circle cx="1180" cy="330" r="240" fill="#fff" fill-opacity="0.16"/>
  <circle cx="420" cy="860" r="330" fill="#0F1117" fill-opacity="0.28"/>
  <rect x="520" y="420" width="560" height="360" rx="36" fill="#fff" fill-opacity="0.92"/>
  <rect x="580" y="490" width="300" height="28" rx="14" fill="#2020E8"/>
  <rect x="580" y="556" width="440" height="20" rx="10" fill="#B9BCCB"/>
  <rect x="580" y="604" width="380" height="20" rx="10" fill="#B9BCCB"/>
  <rect x="580" y="652" width="410" height="20" rx="10" fill="#B9BCCB"/>
`);

const artWide = svg(`
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0F1117"/><stop offset="0.55" stop-color="#1A1A8F"/><stop offset="1" stop-color="#2020E8"/>
    </linearGradient>
  </defs>
  <rect width="1920" height="1080" fill="url(#g)"/>
  <circle cx="1500" cy="260" r="360" fill="#8F8FFF" fill-opacity="0.18"/>
  <circle cx="1700" cy="640" r="200" fill="#fff" fill-opacity="0.08"/>
  <circle cx="300" cy="120" r="260" fill="#fff" fill-opacity="0.06"/>
`, 1920, 1080);

export const sampleDeck = {
  version: 1,
  meta: { title: 'Interactive Slides: sample deck', author: 'Densight Labs' },
  theme: { id: 'densight-dark' },
  aspect: '16:9',
  transition: 'fade',
  slides: [
    {
      id: 's_title',
      layout: 'title',
      blocks: [
        { id: 'b_t1', type: 'heading', slot: 'title', props: { text: 'Interactive Slides', level: 1 } },
        { id: 'b_t2', type: 'text', slot: 'subtitle', props: { text: 'Phase 1: renderer, themes, layouts and the player', size: 'lg', muted: true } },
      ],
      notes: 'Open with the one-sentence pitch.',
    },
    {
      id: 's_section',
      layout: 'section',
      blocks: [
        { id: 'b_s1', type: 'heading', slot: 'title', props: { text: 'Foundations', level: 1 } },
        { id: 'b_s2', type: 'text', slot: 'subtitle', props: { text: 'Layouts, themes and content blocks', size: 'lg' } },
      ],
    },
    {
      id: 's_reveal',
      layout: 'content',
      blocks: [
        { id: 'b_r1', type: 'heading', slot: 'title', props: { text: 'One renderer, three modes', level: 2 } },
        {
          id: 'b_r2', type: 'list', slot: 'body',
          props: {
            items: [
              '<strong>Edit</strong>: the canvas you build on',
              '<strong>Present</strong>: full-screen with notes and a timer',
              '<strong>Export</strong>: one standalone HTML file',
            ],
            revealItems: true,
          },
        },
      ],
    },
    {
      id: 's_two',
      layout: 'two-column',
      blocks: [
        { id: 'b_c1', type: 'heading', slot: 'title', props: { text: 'Two columns', level: 2 } },
        {
          id: 'b_c2', type: 'text', slot: 'left',
          props: { text: 'Every slide is plain JSON: a layout, a list of blocks, and notes. The renderer turns that into DOM, and the player scales it to fit any screen.' },
        },
        {
          id: 'b_c3', type: 'list', slot: 'right',
          props: { items: ['Fixed 1920 by 1080 canvas', 'Scaled with CSS transform', 'Identical in PDF and export'], size: 'md' },
        },
      ],
    },
    {
      id: 's_image',
      layout: 'image-text',
      blocks: [
        { id: 'b_i1', type: 'image', slot: 'media', props: { src: artSquare, alt: 'Abstract slide illustration', fit: 'cover' } },
        { id: 'b_i2', type: 'heading', slot: 'title', props: { text: 'Image and text', level: 2 } },
        { id: 'b_i3', type: 'list', slot: 'body', props: { items: ['Media bleeds to the edge', 'Text sits in its own slots', 'Works with any theme'], size: 'md' } },
      ],
    },
    {
      id: 's_bleed',
      layout: 'full-bleed',
      transition: 'zoom',
      blocks: [
        { id: 'b_f1', type: 'image', slot: 'media', props: { src: artWide, alt: '', fit: 'cover' } },
        { id: 'b_f2', type: 'heading', slot: 'overlay', props: { text: 'Full-bleed with a caption scrim', level: 2 } },
      ],
    },
    {
      id: 's_code',
      layout: 'content',
      blocks: [
        { id: 'b_k1', type: 'heading', slot: 'title', props: { text: 'A deck is just data', level: 2 } },
        {
          id: 'b_k2', type: 'code', slot: 'body',
          props: {
            filename: 'deck.json',
            language: 'json',
            code: '{\n  "layout": "content",\n  "blocks": [\n    { "type": "heading", "slot": "title" },\n    { "type": "list", "slot": "body", "props": { "revealItems": true } }\n  ]\n}',
            size: 'md',
          },
        },
      ],
    },
    {
      id: 's_quote',
      layout: 'content',
      transition: 'slide',
      blocks: [
        { id: 'b_q1', type: 'heading', slot: 'title', props: { text: 'Quote', level: 3 } },
        { id: 'b_q2', type: 'quote', slot: 'body', props: { text: 'Applied AI. Not just talked about.', cite: 'Densight Labs' } },
      ],
    },
    {
      id: 's_cols',
      layout: 'content',
      blocks: [
        { id: 'b_n1', type: 'heading', slot: 'title', props: { text: 'Columns reveal one at a time', level: 2 } },
        {
          id: 'b_n2', type: 'columns', slot: 'body',
          props: {
            cols: [
              { blocks: [
                { id: 'b_n3', type: 'heading', props: { text: 'Plan', level: 3 }, reveal: 1 },
                { id: 'b_n4', type: 'text', props: { text: 'Decide what the deck needs to say.', size: 'sm', muted: true }, reveal: 1 },
              ] },
              { blocks: [
                { id: 'b_n5', type: 'heading', props: { text: 'Build', level: 3 }, reveal: 2 },
                { id: 'b_n6', type: 'text', props: { text: 'Lay out slides and add interactive blocks.', size: 'sm', muted: true }, reveal: 2 },
              ] },
              { blocks: [
                { id: 'b_n7', type: 'heading', props: { text: 'Present', level: 3 }, reveal: 3 },
                { id: 'b_n8', type: 'text', props: { text: 'Run it live or share a single file.', size: 'sm', muted: true }, reveal: 3 },
              ] },
            ],
          },
        },
      ],
    },
    {
      id: 's_embed',
      layout: 'content',
      blocks: [
        { id: 'b_e1', type: 'heading', slot: 'title', props: { text: 'Embeds', level: 2 } },
        { id: 'b_e2', type: 'embed', slot: 'body', props: { url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ', title: 'Sample video', ratio: '16:9' } },
      ],
    },
    {
      id: 's_end',
      layout: 'title',
      blocks: [
        { id: 'b_z1', type: 'heading', slot: 'title', props: { text: 'Thank you', level: 1 } },
        { id: 'b_z2', type: 'text', slot: 'subtitle', props: { text: 'densightlabs.com', size: 'lg', muted: true } },
      ],
    },
  ],
};
