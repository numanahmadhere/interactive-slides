// The "hold for approval" queue shown on the presenter's slide, and the moderation setting every free-text
// block shares.

import { h } from '../dom.js';

export const MODERATION_FIELD = {
  key: 'moderation', label: 'Check what people send', type: 'segmented',
  options: [{ value: 'off', label: 'Show everything' }, { value: 'filter', label: 'Hide swearing' }, { value: 'approve', label: 'Approve first' }],
};

// A container for the queue, only meaningful when presenting a block set to "approve first".
export const queueBox = () => h('div', { class: 'sp-mod', hidden: true });

// Draws the waiting entries with Approve and Hide buttons. Returns a function to call whenever things change.
export function mountQueue(el, block, live) {
  const box = el.querySelector('.sp-mod');
  if (!box || !live || block.props.moderation !== 'approve') return () => {};
  return () => {
    const items = live.pending?.(block.id) ?? [];
    box.hidden = items.length === 0;
    box.replaceChildren(
      h('p', { class: 'sp-mod__title', text: `${items.length} waiting for you` }),
      ...items.map((item) => {
        const row = h('div', { class: 'sp-mod__row' }, h('span', { class: 'sp-mod__text', text: item.text }));
        const approve = h('button', { type: 'button', class: 'sp-qa__tool', text: 'Show' });
        const reject = h('button', { type: 'button', class: 'sp-qa__tool', text: 'Hide' });
        approve.addEventListener('click', () => live.approve(block.id, item.pid));
        reject.addEventListener('click', () => live.reject(block.id, item.pid));
        row.append(approve, reject);
        return row;
      }));
  };
}
