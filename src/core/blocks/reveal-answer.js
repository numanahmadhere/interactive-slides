import { h, rich } from '../dom.js';
import { str } from '../util.js';
import { registerBlock } from './registry.js';
import { stateOf, uniqueId } from './shared.js';

export default registerBlock({
  type: 'reveal-answer',
  label: 'Click to reveal',
  group: 'Interactive',
  defaults: () => ({ prompt: 'What is the question?', answer: 'The answer appears when you click.', label: 'Show answer' }),
  normalize: (p) => ({ prompt: str(p.prompt, '', 1000), answer: str(p.answer, '', 2000), label: str(p.label, 'Show answer', 60) }),
  fields: [{ key: 'label', label: 'Button label', type: 'text' }],
  edit: [
    { prop: 'prompt', selector: '.sp-reveal__prompt', kind: 'rich', placeholder: 'Question or prompt' },
    { prop: 'answer', selector: '.sp-reveal__answer', kind: 'rich', placeholder: 'Answer' },
  ],
  render: (block, ctx) => {
    const { prompt, answer, label } = block.props;
    const present = ctx.mode === 'present';
    const state = stateOf(ctx, block, () => ({ open: false }));
    const id = uniqueId('reveal');
    const button = h(present ? 'button' : 'div', {
      class: 'sp-btn sp-btn--outline sp-btn--md sp-reveal__btn', type: present ? 'button' : undefined,
      'aria-expanded': present ? String(state.open) : undefined, 'aria-controls': present ? id : undefined, text: label,
    });
    const answerEl = rich('div', { class: 'sp-reveal__answer', id, hidden: present && !state.open }, answer);
    return h('div', { class: 'sp-reveal' }, rich('div', { class: 'sp-reveal__prompt' }, prompt), button, answerEl);
  },
  mount: (el, block, ctx) => {
    const { label } = block.props;
    const state = stateOf(ctx, block, () => ({ open: false }));
    const button = el.querySelector('.sp-reveal__btn');
    const answer = el.querySelector('.sp-reveal__answer');
    const paint = () => {
      button.setAttribute('aria-expanded', String(state.open));
      button.textContent = state.open ? 'Hide answer' : label;
      answer.hidden = !state.open;
    };
    button.addEventListener('click', () => {
      state.open = !state.open;
      paint();
    });
    paint();
  },
});
