// A one-time "how it works" card for someone opening the editor for the first time.
// It never comes back once dismissed, and it stays out of the way on phones.

import { h } from '../core/dom.js';
import { button } from './ui.js';

const KEY = 'interactive-slides:quickstart-done';

const seen = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return true; } };
const remember = () => { try { localStorage.setItem(KEY, '1'); } catch { /* shown again next time; harmless */ } };

export function mountQuickstart() {
  if (seen()) return null;
  const card = h('aside', { class: 'ed-qs', 'aria-label': 'Quick start' },
    h('div', { class: 'ed-qs__head' }, h('h2', { class: 'ed-qs__title', text: 'Three steps to a live session' })),
    h('ol', { class: 'ed-qs__steps' },
      h('li', null, h('b', { text: 'Add a question. ' }), 'Use Quiz or Poll in the bar above the slide.'),
      h('li', null, h('b', { text: 'Try it. ' }), 'Press Present (Ctrl+Enter) to see it full screen.'),
      h('li', null, h('b', { text: 'Go live. ' }), 'Open the arrow next to Present, then Go live. Phones join with a code.')),
    );
  const done = button({ label: 'Got it', variant: 'primary', onClick: () => { remember(); card.remove(); } });
  card.querySelector('.ed-qs__head').append(done);
  document.body.append(card);
  return card;
}
