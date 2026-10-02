import { h, rich } from '../dom.js';
import { str, clamp } from '../util.js';
import { registerBlock } from './registry.js';
import { stateOf } from './shared.js';

export default registerBlock({
  type: 'reflection',
  label: 'Reflection prompt',
  group: 'Interactive',
  defaults: () => ({ prompt: 'What is one thing you will do differently?', placeholder: 'Write your thoughts here', rows: 4 }),
  normalize: (p) => ({
    prompt: str(p.prompt, '', 1000),
    placeholder: str(p.placeholder, '', 200),
    rows: clamp(Number.isFinite(Number(p.rows)) ? Math.round(Number(p.rows)) : 4, 2, 10),
  }),
  fields: [
    { key: 'placeholder', label: 'Hint inside the box', type: 'text' },
    { key: 'rows', label: 'Box height (lines)', type: 'number', min: 2, max: 10 },
  ],
  edit: [{ prop: 'prompt', selector: '.sp-reflect__prompt', kind: 'rich', placeholder: 'Question to reflect on' }],
  render: (block, ctx) => {
    const { prompt, placeholder, rows } = block.props;
    const present = ctx.mode === 'present';
    const state = present ? stateOf(ctx, block, () => ({ text: '' })) : null;
    const root = h('div', { class: 'sp-reflect' }, rich('p', { class: 'sp-reflect__prompt' }, prompt));
    if (present) {
      const area = h('textarea', { class: 'sp-reflect__area', rows, placeholder, 'aria-label': 'Your response' });
      area.value = state.text;
      root.append(area, h('div', { class: 'sp-reflect__bar' },
        h('span', { class: 'sp-reflect__note', text: 'Stays on this device. Nothing is sent anywhere.' }),
        h('button', { class: 'sp-btn sp-btn--outline sp-btn--md sp-reflect__copy', type: 'button', text: 'Copy' })));
    } else {
      root.append(h('div', { class: 'sp-reflect__area sp-reflect__area--static', style: `min-height:${rows * 1.5}em`, text: placeholder }));
    }
    return root;
  },
  mount: (el, block, ctx) => {
    const state = stateOf(ctx, block, () => ({ text: '' }));
    const area = el.querySelector('.sp-reflect__area');
    const copy = el.querySelector('.sp-reflect__copy');
    area.addEventListener('input', () => { state.text = area.value; });
    area.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); area.blur(); } // leave the box before leaving the slide
    });
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(area.value);
        copy.textContent = 'Copied';
        setTimeout(() => { copy.textContent = 'Copy'; }, 1500);
      } catch {
        area.select();
      }
    });
  },
});
