import { h } from '../dom.js';
import { str, clamp } from '../util.js';
import { registerBlock } from './registry.js';
import { cleanList, pad, stateOf, itemStep, itemSteps, firstStep, REVEAL_FIELD } from './shared.js';

const MAX_ITEMS = 8;

export default registerBlock({
  type: 'timeline',
  label: 'Timeline',
  group: 'Interactive',
  mountInEdit: true,
  defaults: () => ({
    items: [
      { title: 'Discover', text: 'Find out what is really needed.' },
      { title: 'Design', text: 'Sketch the solution and agree the plan.' },
      { title: 'Deliver', text: 'Build it, test it, and ship it.' },
    ],
    revealItems: false,
  }),
  normalize: (p) => ({
    items: pad(cleanList(p.items, MAX_ITEMS, (c) => ({ title: str(c.title, '', 120), text: str(c.text, '', 800) })), 2, () => ({ title: '', text: '' })),
    revealItems: p.revealItems === true,
  }),
  steps: (block) => itemSteps(block, block.props.items.length),
  fields: [REVEAL_FIELD, {
    key: 'items', label: 'Stages', type: 'list', itemLabel: 'Stage', add: 'Add stage', min: 2, max: MAX_ITEMS,
    item: () => ({ title: 'Stage', text: '' }),
    fields: [{ key: 'title', label: 'Title', type: 'text' }, { key: 'text', label: 'Description', type: 'textarea' }],
  }],
  render: (block, ctx) => {
    const { items } = block.props;
    if (ctx.mode === 'print') {
      return h('ol', { class: 'sp-tl__print' }, ...items.map((item) => h('li', null,
        h('strong', { text: item.title }), item.text ? h('span', { text: ` ${item.text}` }) : null)));
    }
    const state = stateOf(ctx, block, () => ({ active: 0 }));
    const active = clamp(state.active ?? 0, 0, items.length - 1);
    const track = h('div', { class: 'sp-tl__track', role: 'tablist', style: `--tl-progress:${items.length > 1 ? (active / (items.length - 1)) * 100 : 0}%` });
    items.forEach((item, i) => {
      track.append(h('button', {
        type: 'button', role: 'tab', 'data-step': itemStep(block, i), class: `sp-tl__dot${i <= active ? ' is-reached' : ''}`, 'aria-selected': String(i === active), tabindex: i === active ? '0' : '-1',
      }, h('span', { class: 'sp-tl__marker', text: String(i + 1) }), h('span', { class: 'sp-tl__label', text: item.title || `Stage ${i + 1}` })));
    });
    // With stages revealed one at a time, the description waits for the first one.
    const waits = block.props.revealItems ? firstStep(block) : undefined;
    const detail = h('div', { class: 'sp-tl__detail', role: 'tabpanel', 'aria-live': 'polite', 'data-step': waits },
      h('h4', { class: 'sp-tl__title', text: items[active].title }),
      h('p', { class: 'sp-tl__text', text: items[active].text }));
    const controls = h('div', { class: 'sp-tl__controls', 'data-step': waits },
      h('button', { class: 'sp-btn sp-btn--outline sp-btn--md sp-tl__prev', type: 'button', text: 'Previous', disabled: active === 0 }),
      h('button', { class: 'sp-btn sp-btn--primary sp-btn--md sp-tl__next', type: 'button', text: 'Next', disabled: active === items.length - 1 }));
    return h('div', { class: 'sp-timeline' }, track, detail, controls);
  },
  mount: (el, block, ctx) => {
    const { items } = block.props;
    const state = stateOf(ctx, block, () => ({ active: 0 }));
    const track = el.querySelector('.sp-tl__track');
    const dots = [...track.children];
    const title = el.querySelector('.sp-tl__title');
    const text = el.querySelector('.sp-tl__text');
    const prev = el.querySelector('.sp-tl__prev');
    const next = el.querySelector('.sp-tl__next');

    // Stages revealed one at a time: while presenting, only the stages that have appeared can be reached.
    const stepped = block.props.revealItems && ctx.mode === 'present';
    const reached = () => (stepped ? Math.max(1, dots.filter((d) => d.classList.contains('is-revealed')).length) : items.length);

    const select = (i, focus = false) => {
      state.active = clamp(i, 0, reached() - 1);
      dots.forEach((d, n) => {
        d.setAttribute('aria-selected', String(n === state.active));
        d.tabIndex = n === state.active ? 0 : -1;
        d.classList.toggle('is-reached', n <= state.active);
      });
      track.style.setProperty('--tl-progress', `${(state.active / (items.length - 1)) * 100}%`);
      title.textContent = items[state.active].title;
      text.textContent = items[state.active].text;
      prev.disabled = state.active === 0;
      next.disabled = state.active >= reached() - 1;
      if (focus) dots[state.active].focus();
    };
    dots.forEach((d, i) => d.addEventListener('click', () => select(i)));
    prev.addEventListener('click', () => select(state.active - 1));
    next.addEventListener('click', () => select(state.active + 1));
    track.addEventListener('keydown', (e) => {
      const at = dots.indexOf(e.target.closest('.sp-tl__dot'));
      if (at < 0) return;
      const target = e.key === 'ArrowRight' ? Math.min(at + 1, dots.length - 1) : e.key === 'ArrowLeft' ? Math.max(at - 1, 0)
        : e.key === 'Home' ? 0 : e.key === 'End' ? dots.length - 1 : null;
      if (target === null) return;
      e.preventDefault(); // arrows walk the timeline here, not the slides
      select(target, true);
    });
    if (!stepped) return undefined;
    let seen = reached();
    select(seen - 1);
    const watch = new MutationObserver(() => {
      const now = reached();
      select(now > seen ? now - 1 : state.active); // a new stage arrived: go to it
      seen = now;
    });
    watch.observe(track, { attributes: true, attributeFilter: ['class'], subtree: true });
    return () => watch.disconnect();
  },
});
