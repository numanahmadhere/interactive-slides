import { h, rich } from '../dom.js';
import { str, clamp } from '../util.js';
import { registerBlock } from './registry.js';
import { stateOf, isLocked, LOCKED_NOTE } from './shared.js';
import { MODERATION_FIELD, queueBox, mountQueue } from './moderation.js';
import { cleanModeration } from '../../live/boards.js';

const SAMPLE = [['clarity', 9], ['speed', 7], ['trust', 6], ['simple', 5], ['design', 4], ['teamwork', 3], ['focus', 3], ['value', 2], ['fun', 2], ['safe', 1]];

// Words grow with how many people said them. The same words always land in the same
// order, so the cloud does not reshuffle every time a vote arrives.
export function layoutWords(words) {
  const top = Math.max(1, ...words.map((w) => w[1]));
  return words
    .map(([word, n], i) => ({ word, n, scale: 0.75 + 2.25 * Math.sqrt(n / top), hue: i % 5 }))
    .sort((a, b) => hash(a.word) - hash(b.word));
}
const hash = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

export default registerBlock({
  type: 'wordcloud',
  label: 'Word cloud',
  group: 'Interactive',
  mountInEdit: false,
  defaults: () => ({ question: 'In one word, how do you feel about this?', limit: 3, moderation: 'filter' }),
  normalize: (p) => ({ question: str(p.question, '', 1000), limit: Number.isFinite(Number(p.limit)) ? clamp(Math.round(Number(p.limit)), 1, 5) : 3, moderation: cleanModeration(p.moderation) }),
  fields: [
    { key: 'limit', label: 'Words each person can send', type: 'segmented', options: [1, 2, 3, 5].map((n) => ({ value: n, label: String(n) })) },
    MODERATION_FIELD,
    { type: 'hint', text: 'Phones send words; the biggest ones are the most common. The same word typed twice by one person counts once.' },
  ],
  edit: [{ prop: 'question', selector: '.sp-wc__q', kind: 'rich', placeholder: 'Question' }],
  render: (block, ctx) => {
    const cloud = h('div', { class: 'sp-wc__cloud', role: 'img', 'aria-label': 'Word cloud' });
    if (ctx.mode === 'edit' || ctx.mode === 'thumb') fill(cloud, SAMPLE, true);
    const root = h('div', { class: 'sp-wc' }, rich('p', { class: 'sp-wc__q' }, block.props.question), cloud);
    if (ctx.mode === 'present') {
      root.append(h('p', { class: 'sp-live__count', role: 'status', 'aria-live': 'polite' }), queueBox());
      if (!ctx.live) {
        root.append(h('form', { class: 'sp-live__try' },
          h('input', { type: 'text', maxlength: '40', 'aria-label': 'Type a word to try it', placeholder: 'Type a word to try it' }),
          h('button', { type: 'submit', class: 'sp-btn sp-btn--outline sp-btn--md', text: 'Add' })));
      }
    }
    return root;
  },
  mount: (el, block, ctx) => {
    const cloud = el.querySelector('.sp-wc__cloud');
    const count = el.querySelector('.sp-live__count');
    const live = ctx.live ?? null;
    const local = stateOf(ctx, block, () => ({ words: new Map(), mine: 0 }));
    const words = () => (live ? live.words(block.id) : [...local.words].sort((a, b) => b[1] - a[1]));
    const paint = () => {
      const list = words();
      fill(cloud, list, false);
      const total = list.reduce((a, w) => a + w[1], 0);
      count.textContent = isLocked(live, block) ? LOCKED_NOTE : total ? `${total} ${total === 1 ? 'word' : 'words'}` : live ? 'Waiting for words' : 'Add a word to see the cloud';
    };
    el.querySelector('.sp-live__try')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = e.target.querySelector('input');
      const word = input.value.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 40);
      if (word && local.mine < block.props.limit) {
        local.words.set(word, (local.words.get(word) ?? 0) + 1);
        local.mine++;
      }
      input.value = '';
      paint();
    });
    const paintQueue = mountQueue(el, block, live);
    const all = () => { paint(); paintQueue(); };
    all();
    return live?.subscribe(all);
  },
});

function fill(cloud, words, sample) {
  cloud.replaceChildren(...layoutWords(words).map(({ word, n, scale, hue }) => {
    const span = h('span', { class: 'sp-wc__word', 'data-hue': hue, text: word, title: `${n}` });
    span.style.fontSize = `${scale}em`;
    return span;
  }));
  cloud.dataset.sample = String(sample);
}
