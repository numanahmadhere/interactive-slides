import { h, rich, svgIcon } from '../dom.js';
import { str, oneOf } from '../util.js';
import { registerBlock } from './registry.js';
import { cleanList, pad, stateOf, uniqueId } from './shared.js';

const CHECK = 'M5 13l4 4L19 7';
const CROSS = 'M6 6l12 12M18 6L6 18';
const trueFalse = () => [{ text: 'True', correct: true }, { text: 'False', correct: false }];

// Single choice is right when the picked choice is marked correct. Multiple
// choice is right only when exactly the correct choices are picked.
export function isCorrect(choices, mode, picked) {
  const unique = [...new Set(picked)].sort((a, b) => a - b);
  if (mode === 'single') return unique.length === 1 && !!choices[unique[0]]?.correct;
  const right = choices.flatMap((c, i) => (c.correct ? [i] : []));
  return right.length > 0 && unique.length === right.length && unique.every((v, i) => v === right[i]);
}

export default registerBlock({
  type: 'quiz',
  label: 'Quiz question',
  group: 'Interactive',
  scored: true,
  defaults: () => ({
    question: 'Which option is correct?',
    mode: 'single',
    choices: [{ text: 'The first option', correct: true }, { text: 'The second option', correct: false }, { text: 'The third option', correct: false }],
    explanation: '',
    timeLimit: 0,
  }),
  normalize: (p) => ({
    question: str(p.question, '', 1000),
    mode: oneOf(p.mode, ['single', 'multiple'], 'single'),
    choices: pad(
      cleanList(p.choices, 8, (c) => ({ text: str(c.text, '', 300), correct: c.correct === true })),
      2,
      () => ({ text: '', correct: false }),
    ),
    explanation: str(p.explanation, '', 2000),
    timeLimit: [0, 10, 20, 30, 60, 120].includes(Number(p.timeLimit)) ? Number(p.timeLimit) : 0,
  }),
  fields: [
    { key: 'mode', label: 'Answer type', type: 'segmented', options: [{ value: 'single', label: 'One answer' }, { value: 'multiple', label: 'Several answers' }] },
    {
      key: 'choices', label: 'Choices', type: 'list', itemLabel: 'Choice', add: 'Add choice', min: 2, max: 8,
      item: () => ({ text: '', correct: false }),
      fields: [{ key: 'text', label: 'Text', type: 'text' }, { key: 'correct', label: 'Correct answer', type: 'toggle' }],
    },
    { key: 'timeLimit', label: 'Time to answer (live sessions)', type: 'select', options: [{ value: 0, label: 'No limit' }, { value: 10, label: '10 seconds' }, { value: 20, label: '20 seconds' }, { value: 30, label: '30 seconds' }, { value: 60, label: '1 minute' }, { value: 120, label: '2 minutes' }] },
    { type: 'action', label: 'Make this true / false', run: () => ({ mode: 'single', choices: trueFalse() }) },
  ],
  check: (props) => (props.choices.some((c) => c.correct) ? null : 'Mark at least one choice as correct.'),
  edit: [
    { prop: 'question', selector: '.sp-quiz__q', kind: 'rich', placeholder: 'Question' },
    { prop: 'explanation', selector: '.sp-quiz__why', kind: 'rich', placeholder: 'Explain the answer (shown after answering)' },
  ],
  render: (block, ctx) => {
    const { question, mode, choices, explanation } = block.props;
    const editing = ctx.mode === 'edit';
    const qid = uniqueId('quiz-q');

    const group = h('div', { class: 'sp-quiz__choices', role: 'group', 'aria-labelledby': qid, 'data-cols': choices.length >= 5 ? '2' : '1' });
    choices.forEach((c, i) => {
      const classes = `sp-choice${editing && c.correct ? ' is-correct' : ''}`;
      const tag = ctx.mode === 'present' ? 'button' : 'div';
      group.append(h(tag, { class: classes, type: tag === 'button' ? 'button' : undefined, 'data-index': i },
        h('span', { class: 'sp-choice__bar' }),
        h('span', { class: 'sp-choice__key', text: String.fromCharCode(65 + i) }),
        h('span', { class: 'sp-choice__text', text: c.text }),
        h('span', { class: 'sp-choice__pct', 'aria-hidden': 'true' }),
        h('span', { class: 'sp-choice__mark' }, editing && c.correct ? svgIcon(CHECK, { size: 36 }) : null)));
    });

    const root = h('div', { class: 'sp-quiz', 'data-mode': mode }, rich('p', { class: 'sp-quiz__q', id: qid }, question), ctx.mode === 'present' && block.props.timeLimit ? h('p', { class: 'sp-quiz__clock', 'aria-live': 'off' }) : null, group);
    if (mode === 'multiple') {
      const check = h('button', { class: 'sp-btn sp-btn--outline sp-btn--md sp-quiz__check', type: 'button', text: 'Check answer', disabled: true });
      if (ctx.mode === 'present') root.append(h('div', { class: 'sp-quiz__actions' }, check));
    }
    if (editing || explanation) {
      root.append(h('div', { class: 'sp-quiz__feedback', role: 'status', 'aria-live': 'polite', hidden: ctx.mode === 'present' },
        h('div', { class: 'sp-quiz__verdict' }),
        rich('p', { class: 'sp-quiz__why' }, explanation)));
    } else {
      root.append(h('div', { class: 'sp-quiz__feedback', role: 'status', 'aria-live': 'polite', hidden: true }, h('div', { class: 'sp-quiz__verdict' })));
    }
    return root;
  },
  mount: (el, block, ctx) => {
    const { choices, mode } = block.props;
    const state = stateOf(ctx, block, () => ({ picked: [], done: false, correct: false }));
    const buttons = [...el.querySelectorAll('.sp-choice')];
    const check = el.querySelector('.sp-quiz__check');
    const feedback = el.querySelector('.sp-quiz__feedback');
    const verdict = el.querySelector('.sp-quiz__verdict');

    const paint = () => {
      buttons.forEach((button, i) => {
        const picked = state.picked.includes(i);
        button.classList.toggle('is-picked', picked);
        button.setAttribute('aria-pressed', String(picked));
        const mark = button.querySelector('.sp-choice__mark');
        mark.replaceChildren();
        if (state.done) {
          const right = choices[i].correct;
          button.classList.toggle('is-correct', right);
          button.classList.toggle('is-wrong', picked && !right);
          button.setAttribute('aria-disabled', 'true');
          if (right) mark.append(svgIcon(CHECK, { size: 36 }));
          else if (picked) mark.append(svgIcon(CROSS, { size: 36 }));
          button.setAttribute('aria-label', `${String.fromCharCode(65 + i)}. ${choices[i].text}${right ? ', correct answer' : picked ? ', your answer, incorrect' : ''}`);
        }
      });
      if (check) {
        check.disabled = state.done || state.picked.length === 0;
        check.parentElement.hidden = state.done; // the verdict takes its place
      }
      feedback.hidden = !state.done;
      feedback.dataset.result = state.done ? (state.correct ? 'correct' : 'wrong') : '';
      verdict.textContent = state.done ? (state.correct ? 'Correct' : 'Not quite') : '';
    };
    const settle = () => {
      state.done = true;
      state.correct = isCorrect(choices, mode, state.picked);
      paint();
    };

    buttons.forEach((button, i) => {
      button.addEventListener('click', () => {
        if (state.done) return;
        if (mode === 'single') {
          state.picked = [i];
          settle();
        } else {
          state.picked = state.picked.includes(i) ? state.picked.filter((n) => n !== i) : [...state.picked, i];
          paint();
        }
      });
    });
    check?.addEventListener('click', () => {
      if (!state.done && state.picked.length) settle();
    });
    paint();

    // With a live room open, each choice shows how much of the audience picked it.
    const live = ctx.live;
    if (!live) return undefined;
    const paintLive = () => {
      const counts = live.counts(block.id, choices.length);
      const sum = counts.reduce((a, b) => a + b, 0);
      el.querySelector('.sp-quiz').dataset.live = sum ? 'on' : '';
      buttons.forEach((button, i) => {
        button.style.setProperty('--share', String(sum ? counts[i] / sum : 0));
        button.querySelector('.sp-choice__pct').textContent = sum ? `${Math.round((counts[i] / sum) * 100)}%` : '';
      });
    };
    paintLive();
    // A timed question counts down on the big screen too.
    const clock = el.querySelector('.sp-quiz__clock');
    let tick = 0;
    if (clock) {
      const draw = () => {
        const left = live.remaining?.(block.id);
        clock.textContent = left === null || left === undefined ? '' : left > 0 ? `${Math.ceil(left)} seconds left` : 'Time is up';
        clock.classList.toggle('is-out', left === 0);
      };
      draw();
      tick = setInterval(draw, 250);
    }
    const off = live.subscribe(paintLive);
    return () => { clearInterval(tick); off(); };
  },
});
