// A tour of the interactive blocks. Used by File > Open interactive demo and as
// test material for the player.

const svg = (body, w = 1600, h = 900) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">${body}</svg>`)}`;

// A mock of the editor, with three regions that the hotspots point at.
const editorMock = svg(`
  <rect width="1600" height="900" rx="28" fill="#12151d"/>
  <rect width="1600" height="84" rx="28" fill="#171b26"/>
  <rect y="56" width="1600" height="28" fill="#171b26"/>
  <rect x="32" y="26" width="300" height="32" rx="8" fill="#2b3246"/>
  <rect x="1380" y="22" width="176" height="40" rx="10" fill="#2020e8"/>
  <rect y="84" width="300" height="816" fill="#11141c"/>
  <rect x="36" y="120" width="228" height="128" rx="10" fill="#0f1117" stroke="#8f8fff" stroke-width="4"/>
  <rect x="36" y="272" width="228" height="128" rx="10" fill="#0f1117" stroke="#2b3246" stroke-width="4"/>
  <rect x="36" y="424" width="228" height="128" rx="10" fill="#0f1117" stroke="#2b3246" stroke-width="4"/>
  <rect x="300" y="84" width="1000" height="816" fill="#0a0c12"/>
  <rect x="360" y="180" width="880" height="495" rx="8" fill="#0f1117" stroke="#31384d" stroke-width="3"/>
  <rect x="420" y="260" width="520" height="52" rx="8" fill="#ffffff"/>
  <rect x="420" y="350" width="360" height="26" rx="8" fill="#a3a9bd"/>
  <rect x="420" y="400" width="420" height="26" rx="8" fill="#a3a9bd"/>
  <rect x="1300" y="84" width="300" height="816" fill="#11141c"/>
  <rect x="1332" y="130" width="236" height="40" rx="8" fill="#0c0f15" stroke="#31384d" stroke-width="3"/>
  <rect x="1332" y="198" width="236" height="40" rx="8" fill="#0c0f15" stroke="#31384d" stroke-width="3"/>
  <rect x="1332" y="266" width="236" height="120" rx="8" fill="#0c0f15" stroke="#31384d" stroke-width="3"/>
`);

const plainSlide = svg(`
  <rect width="1600" height="900" fill="#e9ebf0"/>
  <rect x="140" y="160" width="860" height="70" rx="10" fill="#555b6b"/>
  <rect x="140" y="290" width="640" height="34" rx="10" fill="#9aa0b0"/>
  <rect x="140" y="350" width="720" height="34" rx="10" fill="#9aa0b0"/>
  <rect x="140" y="410" width="560" height="34" rx="10" fill="#9aa0b0"/>
`);

const themedSlide = svg(`
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0f1117"/><stop offset="1" stop-color="#1b1b6a"/></linearGradient></defs>
  <rect width="1600" height="900" fill="url(#g)"/>
  <rect width="26" height="900" fill="#2020e8"/>
  <rect x="140" y="160" width="860" height="70" rx="10" fill="#ffffff"/>
  <rect x="140" y="290" width="640" height="34" rx="10" fill="#8f8fff"/>
  <rect x="140" y="350" width="720" height="34" rx="10" fill="#a3a9bd"/>
  <rect x="140" y="410" width="560" height="34" rx="10" fill="#a3a9bd"/>
  <circle cx="1280" cy="640" r="190" fill="#2020e8" fill-opacity="0.45"/>
`);

const h = (id, text, level = 2) => ({ id, type: 'heading', slot: 'title', props: { text, level } });
const text = (id, t, extra = {}) => ({ id, type: 'text', props: { text: t, ...extra } });
const goto = (id, label, slide, extra = {}) => ({ id, type: 'button', props: { label, action: 'slide', slide, align: 'center', size: 'lg', ...extra } });

export const interactiveDeck = {
  version: 1,
  meta: { title: 'Interactive blocks: a tour', author: 'Densight Labs' },
  theme: { id: 'densight-dark' },
  aspect: '16:9',
  transition: 'fade',
  slides: [
    {
      id: 's_start',
      layout: 'title',
      blocks: [
        { id: 'i_t1', type: 'heading', slot: 'title', props: { text: 'Interactive blocks', level: 1 } },
        { id: 'i_t2', type: 'text', slot: 'subtitle', props: { text: 'A tour of everything you can click', size: 'lg', muted: true } },
        { id: 'i_t3', type: 'button', slot: 'subtitle', props: { label: 'Start the tour', action: 'next', size: 'lg' } },
      ],
    },
    {
      id: 's_menu',
      layout: 'content',
      blocks: [
        h('i_m1', 'Where would you like to go?'),
        {
          id: 'i_m2', type: 'columns', slot: 'body',
          props: {
            cols: [
              { blocks: [text('i_m3', 'Test yourself', { muted: true, align: 'center' }), goto('i_m4', 'Quiz', 's_quiz1')] },
              { blocks: [text('i_m5', 'Explore content', { muted: true, align: 'center' }), goto('i_m6', 'Tabs', 's_tabs')] },
              { blocks: [text('i_m7', 'See the difference', { muted: true, align: 'center' }), goto('i_m8', 'Before / after', 's_compare')] },
            ],
          },
        },
        { id: 'i_m9', type: 'text', slot: 'body', props: { text: 'Buttons can jump to any slide, so one deck can branch.', size: 'sm', muted: true, align: 'center' } },
      ],
    },
    {
      id: 's_quiz1',
      layout: 'content',
      blocks: [
        h('i_q1', 'Quick quiz: question 1'),
        {
          id: 'i_q2', type: 'quiz', slot: 'body',
          props: {
            question: 'In the ADAPT framework, which phase comes first?',
            mode: 'single',
            choices: [{ text: 'Assess', correct: true }, { text: 'Diagnose', correct: false }, { text: 'Align', correct: false }, { text: 'Pilot', correct: false }],
            explanation: 'ADAPT has five phases: Assess, Diagnose, Align, Pilot, Track.',
          },
        },
      ],
    },
    {
      id: 's_quiz2',
      layout: 'content',
      blocks: [
        h('i_q3', 'Quick quiz: question 2'),
        {
          id: 'i_q4', type: 'quiz', slot: 'body',
          props: {
            question: 'Which of these are ADAPT phases? Select all that apply.',
            mode: 'multiple',
            choices: [
              { text: 'Assess', correct: true }, { text: 'Pilot', correct: true }, { text: 'Track', correct: true },
              { text: 'Launch', correct: false }, { text: 'Optimise', correct: false },
            ],
            explanation: 'Assess, Diagnose, Align, Pilot and Track. There is no Launch or Optimise phase.',
          },
        },
      ],
    },
    {
      id: 's_quiz3',
      layout: 'content',
      blocks: [
        h('i_q5', 'Quick quiz: question 3'),
        {
          id: 'i_q6', type: 'quiz', slot: 'body',
          props: {
            question: 'True or false: you should pilot before you assess.',
            mode: 'single',
            choices: [{ text: 'True', correct: false }, { text: 'False', correct: true }],
            explanation: 'Assessing comes first, so the pilot tests something you already understand.',
          },
        },
      ],
    },
    {
      id: 's_score',
      layout: 'content',
      blocks: [
        h('i_s1', 'How did you do?'),
        { id: 'i_s2', type: 'quiz-results', slot: 'body', props: { title: 'Your score', restart: true, restartLabel: 'Try again' } },
      ],
    },
    {
      id: 's_tabs',
      layout: 'content',
      blocks: [
        h('i_b1', 'Tabs hold blocks'),
        {
          id: 'i_b2', type: 'tabs', slot: 'body',
          props: {
            tabs: [
              { title: 'Claude Code Pods', blocks: [text('i_b3', 'An embedded, AI-fluent developer squad.', { size: 'lg' }), text('i_b4', 'Weekly billing, and you pay only for shipped code.', { muted: true })] },
              { title: 'AI Stack Setup', blocks: [text('i_b5', 'Turnkey AI infrastructure, set up in two weeks.', { size: 'lg' })] },
              {
                title: 'Corporate AI Training',
                blocks: [
                  text('i_b6', 'Role-specific modules for:', { size: 'lg' }),
                  { id: 'i_b7', type: 'list', props: { items: ['Sales', 'Marketing', 'Operations'], size: 'md' } },
                ],
              },
            ],
          },
        },
      ],
    },
    {
      id: 's_acc',
      layout: 'content',
      blocks: [
        h('i_a1', 'Accordions answer questions'),
        {
          id: 'i_a2', type: 'accordion', slot: 'body',
          props: {
            single: true,
            items: [
              { title: 'How do reveal steps work?', blocks: [text('i_a3', 'Give any block a step number and it appears on that click. Lists can reveal one item at a time.', { size: 'sm' })] },
              { title: 'Where is my deck saved?', blocks: [text('i_a4', 'In your browser, automatically. Export a JSON file to keep a copy or move it elsewhere.', { size: 'sm' })] },
              { title: 'Does it work offline?', blocks: [text('i_a5', 'The editor and presenter run entirely in the page, so yes, once it has loaded.', { size: 'sm' })] },
            ],
          },
        },
      ],
    },
    {
      id: 's_hot',
      layout: 'content',
      blocks: [
        h('i_h1', 'Hotspots explain an image'),
        {
          id: 'i_h2', type: 'hotspots', slot: 'body',
          props: {
            src: editorMock,
            alt: 'A mock-up of the editor with a slide list, a canvas and a settings panel',
            spots: [
              { x: 9, y: 40, title: 'Slide list', text: 'Thumbnails of every slide. Drag to reorder.' },
              { x: 50, y: 42, title: 'Canvas', text: 'Click a block to select it, then click again to type in place.' },
              { x: 91, y: 28, title: 'Settings', text: 'Everything about the selected block, slide or deck.' },
            ],
          },
        },
      ],
    },
    {
      id: 's_flip',
      layout: 'content',
      blocks: [
        h('i_f1', 'Flip cards test recall'),
        {
          id: 'i_f2', type: 'flip-cards', slot: 'body',
          props: {
            cards: [
              { front: 'Layout', back: 'Where a slide puts its content: title, columns, image and text, and so on.' },
              { front: 'Block', back: 'One piece of content: a heading, a quiz, a set of tabs.' },
              { front: 'Reveal step', back: 'Which click makes a block appear.' },
              { front: 'Theme', back: 'The colours and fonts for the whole deck.' },
            ],
            size: 'md',
          },
        },
      ],
    },
    {
      id: 's_reveal',
      layout: 'content',
      blocks: [
        h('i_r1', 'Click to reveal'),
        { id: 'i_r2', type: 'reveal-answer', slot: 'body', props: { prompt: 'How many undo steps is one typing session?', answer: 'One. Everything you type in a block before you click away undoes together.', label: 'Show answer' } },
      ],
    },
    {
      id: 's_compare',
      layout: 'content',
      blocks: [
        h('i_c1', 'Drag to compare'),
        { id: 'i_c2', type: 'compare', slot: 'body', props: { before: plainSlide, after: themedSlide, beforeLabel: 'Plain', afterLabel: 'Themed', start: 50 } },
      ],
    },
    {
      id: 's_end',
      layout: 'title',
      blocks: [
        { id: 'i_e1', type: 'heading', slot: 'title', props: { text: 'That is the tour', level: 1 } },
        {
          id: 'i_e2', type: 'columns', slot: 'subtitle',
          props: {
            cols: [
              { blocks: [{ id: 'i_e3', type: 'button', props: { label: 'Back to the menu', action: 'slide', slide: 's_menu', size: 'lg' } }] },
              { blocks: [{ id: 'i_e4', type: 'button', props: { label: 'Go back', action: 'back', style: 'outline', size: 'lg' } }] },
            ],
          },
        },
      ],
    },
  ],
};
