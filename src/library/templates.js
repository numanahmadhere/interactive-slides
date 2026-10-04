// Ready-made slides to start from. Each one is a free-form slide built from ordinary
// blocks and theme colours, so it follows whatever theme the deck uses and every part
// can be moved, restyled or deleted. make() returns a fresh slide every time.

import { uid } from '../core/util.js';
import { createBlock } from '../core/blocks/index.js';

const B = (type, props, frame, extra = {}) => ({ ...createBlock(type, { props }), slot: 'free', frame, ...extra });

const slide = (blocks, extra = {}) => ({ id: uid('s_'), layout: 'free', blocks, notes: '', ...extra });

export const TEMPLATES = [
  {
    id: 'blank', name: 'Blank canvas', group: 'Basics',
    make: () => slide([]),
  },
  {
    id: 'title', name: 'Title', group: 'Basics',
    make: () => slide([
      B('shape', { kind: 'rect', fill: 'accent', text: '', size: 'sm', width: 'full' }, { x: 200, y: 300, w: 160, h: 12 }),
      B('heading', { text: 'Presentation title', level: 1 }, { x: 200, y: 340, w: 1520 }),
      B('text', { text: 'A line about what this is and who it is for', size: 'lg', muted: true }, { x: 200, y: 600, w: 1200 }),
    ]),
  },
  {
    id: 'agenda', name: 'Agenda', group: 'Basics',
    make: () => slide([
      B('heading', { text: 'Agenda', level: 2 }, { x: 128, y: 96, w: 1664 }),
      B('list', { items: ['Where we are today', 'What we learned', 'What we recommend', 'Next steps'], ordered: true, size: 'lg' }, { x: 128, y: 300, w: 1100 }),
    ]),
  },
  {
    id: 'statement', name: 'Big statement', group: 'Basics',
    make: () => slide([
      B('heading', { text: 'One idea, said plainly.', level: 1, align: 'center' }, { x: 160, y: 380, w: 1600 }, { style: { color: 'accentText' } }),
      B('text', { text: 'Back it up with one supporting line.', size: 'lg', align: 'center', muted: true }, { x: 360, y: 640, w: 1200 }),
    ]),
  },
  {
    id: 'quote', name: 'Quote', group: 'Basics',
    make: () => slide([
      B('icon', { name: 'star', size: 'lg', color: 'accent', label: '', align: 'start' }, { x: 200, y: 200, w: 200, h: 200 }),
      B('quote', { text: 'A sentence worth reading aloud.', cite: 'Name, Role' }, { x: 200, y: 420, w: 1500 }),
    ]),
  },
  {
    id: 'two-column', name: 'Two columns', group: 'Content',
    make: () => slide([
      B('heading', { text: 'Two things to compare', level: 2 }, { x: 128, y: 96, w: 1664 }),
      B('shape', { kind: 'rounded', fill: 'surface', text: '', size: 'lg', width: 'full' }, { x: 128, y: 280, w: 800, h: 640 }),
      B('shape', { kind: 'rounded', fill: 'surface', text: '', size: 'lg', width: 'full' }, { x: 992, y: 280, w: 800, h: 640 }),
      B('heading', { text: 'Option A', level: 3 }, { x: 188, y: 330, w: 680 }),
      B('list', { items: ['First point', 'Second point', 'Third point'], size: 'md' }, { x: 188, y: 440, w: 680 }),
      B('heading', { text: 'Option B', level: 3 }, { x: 1052, y: 330, w: 680 }),
      B('list', { items: ['First point', 'Second point', 'Third point'], size: 'md' }, { x: 1052, y: 440, w: 680 }),
    ]),
  },
  {
    id: 'numbers', name: 'Three numbers', group: 'Content',
    make: () => slide([
      B('heading', { text: 'The numbers that matter', level: 2 }, { x: 128, y: 96, w: 1664 }),
      ...[0, 1, 2].flatMap((i) => [
        B('heading', { text: ['42%', '3.1x', '12 days'][i], level: 1 }, { x: 128 + i * 576, y: 380, w: 520 }, { style: { color: 'accentText' } }),
        B('text', { text: ['of customers return within a month', 'faster than the old process', 'from request to delivery'][i], size: 'md', muted: true }, { x: 128 + i * 576, y: 580, w: 480 }),
      ]),
    ]),
  },
  {
    id: 'picture-left', name: 'Picture and text', group: 'Content',
    make: () => slide([
      B('image', { src: '', alt: '', fit: 'cover' }, { x: 0, y: 0, w: 960, h: 1080 }),
      B('heading', { text: 'Say what the picture shows', level: 2 }, { x: 1048, y: 160, w: 744 }),
      B('list', { items: ['A point that matters', 'Another one', 'And a third'], size: 'md' }, { x: 1048, y: 400, w: 744 }),
    ]),
  },
  {
    id: 'timeline', name: 'Timeline', group: 'Content',
    make: () => slide([
      B('heading', { text: 'How it unfolds', level: 2 }, { x: 128, y: 96, w: 1664 }),
      B('timeline', {}, { x: 128, y: 300, w: 1664 }),
    ]),
  },
  {
    id: 'quiz', name: 'Quiz question', group: 'Audience',
    make: () => slide([
      B('heading', { text: 'Check your understanding', level: 2 }, { x: 128, y: 96, w: 1664 }),
      B('quiz', {}, { x: 128, y: 280, w: 1664 }),
    ]),
  },
  {
    id: 'poll', name: 'Live poll', group: 'Audience',
    make: () => slide([
      B('heading', { text: 'Ask the room', level: 2 }, { x: 128, y: 96, w: 1664 }),
      B('poll', {}, { x: 128, y: 280, w: 1664 }),
    ]),
  },
  {
    id: 'thanks', name: 'Thank you', group: 'Basics',
    make: () => slide([
      B('heading', { text: 'Thank you', level: 1, align: 'center' }, { x: 160, y: 360, w: 1600 }),
      B('text', { text: 'Questions and discussion', size: 'lg', align: 'center', muted: true }, { x: 360, y: 620, w: 1200 }),
    ]),
  },
];

export const getTemplate = (id) => TEMPLATES.find((t) => t.id === id);
