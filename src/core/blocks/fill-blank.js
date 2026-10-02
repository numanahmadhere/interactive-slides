import { h } from '../dom.js';
import { str } from '../util.js';
import { registerBlock } from './registry.js';
import { stateOf } from './shared.js';

// "The capital of France is [Paris]." -> text and blank segments. A blank can
// accept alternatives: [Paris|paris, france].
export function parseBlanks(text) {
  const out = [];
  const re = /\[([^\]]+)\]/g;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    out.push({ answers: m[1].split('|').map((s) => s.trim()).filter(Boolean) });
    last = re.lastIndex;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

const norm = (s) => String(s).trim().toLowerCase().replace(/\s+/g, ' ');
export const matchesAnswer = (answers, value) => answers.some((a) => norm(a) === norm(value));

export default registerBlock({
  type: 'fill-blank',
  label: 'Fill in the blank',
  group: 'Interactive',
  scored: true,
  defaults: () => ({ text: 'The capital of France is [Paris].' }),
  normalize: (p) => ({ text: str(p.text, '', 3000) }),
  fields: [
    { key: 'text', label: 'Sentence', type: 'textarea', rows: 4, placeholder: 'The sky is [blue].' },
    { type: 'hint', text: 'Put each answer in [square brackets]. Separate accepted alternatives with |, like [colour|color].' },
  ],
  check: (props) => (parseBlanks(props.text).some((s) => s.answers) ? null : 'Add at least one [answer] in square brackets.'),
  edit: [{ prop: 'text', selector: '.sp-fill__text', kind: 'plain', placeholder: 'The sky is [blue].' }],
  render: (block, ctx) => {
    const { text } = block.props;
    const present = ctx.mode === 'present';
    const para = h('p', { class: 'sp-fill__text' });
    if (ctx.mode === 'edit') {
      para.textContent = text; // authors type the raw [answers] directly
    } else {
      parseBlanks(text).forEach((seg, i) => {
        if (seg.text !== undefined) para.append(seg.text);
        else if (present) {
          const width = Math.max(...seg.answers.map((a) => a.length), 4) + 2;
          para.append(h('input', { class: 'sp-blank', type: 'text', 'data-blank': i, 'aria-label': 'Answer', style: `width:${width}ch`, autocomplete: 'off', spellcheck: 'false' }));
        } else para.append(h('span', { class: 'sp-blank sp-blank--static', text: '   ' }));
      });
    }
    const root = h('div', { class: 'sp-fill' }, para);
    if (present) {
      root.append(
        h('div', { class: 'sp-quiz__actions' }, h('button', { class: 'sp-btn sp-btn--outline sp-btn--md sp-fill__check', type: 'button', text: 'Check answers' })),
        h('div', { class: 'sp-quiz__feedback', role: 'status', 'aria-live': 'polite', hidden: true },
          h('div', { class: 'sp-quiz__verdict' }), h('p', { class: 'sp-quiz__why' })));
    }
    return root;
  },
  mount: (el, block, ctx) => {
    const segments = parseBlanks(block.props.text);
    const state = stateOf(ctx, block, () => ({ values: {}, done: false, correct: false }));
    const inputs = [...el.querySelectorAll('.sp-blank')];
    const check = el.querySelector('.sp-fill__check');
    const feedback = el.querySelector('.sp-quiz__feedback');
    if (!inputs.length) return;

    const paint = () => {
      inputs.forEach((input) => {
        const seg = segments[Number(input.dataset.blank)];
        input.value = state.values[input.dataset.blank] ?? '';
        input.readOnly = state.done;
        if (state.done) {
          const right = matchesAnswer(seg.answers, input.value);
          input.classList.toggle('is-correct', right);
          input.classList.toggle('is-wrong', !right);
          input.setAttribute('aria-invalid', String(!right));
        }
      });
      check.hidden = state.done;
      feedback.hidden = !state.done;
      feedback.dataset.result = state.done ? (state.correct ? 'correct' : 'wrong') : '';
      if (state.done) {
        feedback.querySelector('.sp-quiz__verdict').textContent = state.correct ? 'Correct' : 'Not quite';
        feedback.querySelector('.sp-quiz__why').textContent = state.correct ? ''
          : `Answers: ${segments.filter((s) => s.answers).map((s) => s.answers[0]).join(', ')}`;
      }
    };
    const settle = () => {
      if (state.done) return;
      state.done = true;
      state.correct = segments.filter((s) => s.answers).every((seg, n) => {
        const input = inputs[n];
        return matchesAnswer(seg.answers, input.value);
      });
      paint();
    };
    inputs.forEach((input) => {
      input.addEventListener('input', () => { state.values[input.dataset.blank] = input.value; });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); settle(); }
      });
    });
    check.addEventListener('click', settle);
    paint();
  },
});
